import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "./config";
import {
	createHttpApp,
	FAILURE_WINDOW_MS,
	type HttpApp,
	MAX_FAILURES,
} from "./http";
import { fakeDeps } from "./testing";

const TOKEN = "a".repeat(64);
const HOST = "api.marinholocacoes.com";
const URL_MCP = `https://${HOST}/mcp`;

let now = 0;
const apps: HttpApp[] = [];
const clients: Client[] = [];
afterEach(async () => {
	await Promise.all(clients.splice(0).map((client) => client.close()));
	await Promise.all(apps.splice(0).map((app) => app.close()));
	now = 0;
});

function setup(mode: "leitura" | "completo" = "leitura") {
	const fake = fakeDeps(mode);
	const logs: { level: string; message: string }[] = [];
	const app = createHttpApp({
		deps: fake.deps,
		token: TOKEN,
		allowedHosts: [HOST],
		clock: () => now,
		log: (level, message) => logs.push({ level, message }),
	});
	apps.push(app);
	return { ...fake, app, logs };
}

/** Chamada JSON-RPC crua, como um cliente da era 2025 (o conector do claude.ai). */
function rpc(
	body: unknown,
	headers: Record<string, string> = {},
	url = URL_MCP,
): Request {
	return new Request(url, {
		method: "POST",
		headers: {
			host: new URL(url).host,
			"content-type": "application/json",
			accept: "application/json, text/event-stream",
			authorization: `Bearer ${TOKEN}`,
			"x-forwarded-for": "160.79.104.10",
			...headers,
		},
		body: JSON.stringify(body),
	});
}

const initialize = {
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "claude-ai", version: "1" },
	},
};

async function readJsonRpc(response: Response) {
	const text = await response.text();
	if (response.headers.get("content-type")?.includes("text/event-stream")) {
		const data = text
			.split("\n")
			.filter((line) => line.startsWith("data: "))
			.map((line) => line.slice(6))
			.at(-1);
		return JSON.parse(data ?? "null");
	}
	return JSON.parse(text);
}

describe("barreiras", () => {
	it("/health responde sem token e o resto é 404", async () => {
		const { app } = setup();
		const health = await app.fetch(new Request("http://127.0.0.1:3000/health"));
		expect(health.status).toBe(200);
		const other = await app.fetch(new Request(`https://${HOST}/rpc/x`));
		expect(other.status).toBe(404);
	});

	it("sem token ou com token errado: 401, e nada chega à API", async () => {
		const { app, api } = setup();
		const missing = await app.fetch(rpc(initialize, { authorization: "" }));
		const wrong = await app.fetch(
			rpc(initialize, { authorization: `Bearer ${"b".repeat(64)}` }),
		);
		expect(missing.status).toBe(401);
		expect(wrong.status).toBe(401);
		expect(api.state.signIns).toBe(0);
	});

	it("bloqueia o IP depois de tentativas erradas, mesmo com o token certo", async () => {
		const { app } = setup();
		for (let attempt = 0; attempt < MAX_FAILURES; attempt++) {
			await app.fetch(rpc(initialize, { authorization: "Bearer errado" }));
		}
		const blocked = await app.fetch(rpc(initialize));
		expect(blocked.status).toBe(429);
		const otherIp = await app.fetch(
			rpc(initialize, { "x-forwarded-for": "160.79.104.11" }),
		);
		expect(otherIp.status).toBe(200);
		now += FAILURE_WINDOW_MS + 1;
		expect((await app.fetch(rpc(initialize))).status).toBe(200);
	});

	it("recusa outro Host", async () => {
		const { app } = setup();
		const response = await app.fetch(
			rpc(initialize, {}, "https://outro.exemplo.com/mcp"),
		);
		expect(response.status).toBe(403);
	});

	it("não sobe com token curto", () => {
		const { deps } = fakeDeps("leitura");
		expect(() =>
			createHttpApp({ deps, token: "curto", allowedHosts: [HOST] }),
		).toThrow(ConfigError);
	});
});

describe("protocolo", () => {
	it("cliente da era 2025: initialize e tools/call, cada um numa requisição", async () => {
		const { app } = setup();
		const init = await app.fetch(rpc(initialize));
		expect(init.status).toBe(200);
		const initBody = await readJsonRpc(init);
		expect(initBody.result.serverInfo.name).toBe("marinho-gestao");
		expect(initBody.result.instructions).toContain("Marinho Locações");

		const list = await readJsonRpc(
			await app.fetch(rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })),
		);
		expect(list.result.tools).toHaveLength(15);

		const call = await readJsonRpc(
			await app.fetch(
				rpc({
					jsonrpc: "2.0",
					id: 3,
					method: "tools/call",
					params: { name: "conferir_conexao", arguments: {} },
				}),
			),
		);
		expect(JSON.parse(call.result.content[0].text)).toMatchObject({
			usuario: "claude",
			papel: "ATTENDANT",
		});
	});

	it("cliente do SDK atual, com o token no cabeçalho", async () => {
		const { app, audits } = setup("completo");
		const transport = new StreamableHTTPClientTransport(new URL(URL_MCP), {
			requestInit: {
				headers: {
					authorization: `Bearer ${TOKEN}`,
					"x-forwarded-for": "160.79.104.10",
				},
			},
			fetch: (input, init) => {
				const request = new Request(
					input instanceof URL ? input.href : input,
					init,
				);
				request.headers.set("host", HOST);
				return app.fetch(request);
			},
		});
		const client = new Client({ name: "teste", version: "1" });
		await client.connect(transport);
		clients.push(client);
		const tools = await client.listTools();
		expect(tools.tools).toHaveLength(26);
		const result = await client.callTool({
			name: "buscar_clientes",
			arguments: { q: "joão" },
		});
		expect(JSON.stringify(result.content)).not.toContain("123.456.789-00");
		expect(audits).toEqual([
			expect.objectContaining({
				tool: "buscar_clientes",
				write: false,
				ok: true,
				error: null,
			}),
		]);
		expect(JSON.stringify(audits)).not.toContain("joão");
	});

	it("a auditoria registra o código do erro de regra", async () => {
		const { app, audits } = setup("completo");
		const response = await app.fetch(
			rpc({
				jsonrpc: "2.0",
				id: 4,
				method: "tools/call",
				params: {
					name: "criar_orcamento",
					arguments: {
						customerId: "c1",
						startAt: "2026-12-01T08:00:00-03:00",
						endAt: "2026-12-02T08:00:00-03:00",
						items: [{ kind: "UNIT", code: "MAR-002" }],
						deliveryMode: "DELIVERY",
					},
				},
			}),
		);
		const body = await readJsonRpc(response);
		expect(body.result.isError).toBe(true);
		expect(audits).toEqual([
			expect.objectContaining({
				tool: "criar_orcamento",
				write: true,
				ok: false,
				error: "CONFLICT",
			}),
		]);
	});
});
