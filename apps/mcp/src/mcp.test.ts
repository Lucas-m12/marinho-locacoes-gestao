import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import { sessionCookie } from "./api";
import type { Mode } from "./config";
import { createMarinhoMcpServer } from "./server";
import { fakeDeps, NOW, ORIGIN } from "./testing";

const clients: Client[] = [];
afterEach(async () => {
	await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function connect(mode: Mode, password = "senha-certa") {
	const { api, deps, audits } = fakeDeps(mode, password);
	const { server, tools } = createMarinhoMcpServer(deps);
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await server.connect(serverSide);
	const client = new Client({ name: "teste", version: "1" });
	await client.connect(clientSide);
	clients.push(client);

	async function call(name: string, args: Record<string, unknown> = {}) {
		const result = await client.callTool({ name, arguments: args });
		const first = (result.content as { type: string; text: string }[])[0];
		return {
			isError: result.isError === true,
			body: JSON.parse(first?.text ?? "null"),
		};
	}

	return { api, audits, client, tools, call };
}

const READ_TOOLS = [
	"conferir_conexao",
	"resumo_do_dia",
	"verificar_disponibilidade",
	"agenda",
	"listar_equipamentos",
	"tabela_de_precos",
	"listar_locacoes",
	"ver_locacao",
	"texto_do_orcamento",
	"simular_prorrogacao",
	"buscar_clientes",
	"ver_cliente",
	"resumo_financeiro",
	"lancamentos_do_caixa",
	"demanda_perdida",
];

describe("ferramentas registradas", () => {
	it("no modo leitura, só consultas, todas marcadas como somente leitura", async () => {
		const { client, tools } = await connect("leitura");
		expect(tools).toEqual(READ_TOOLS);
		const listed = await client.listTools();
		expect(
			listed.tools.every((tool) => tool.annotations?.readOnlyHint === true),
		).toBe(true);
	});

	it("no modo completo, as operações entram, e cancelar e encerrar são destrutivas", async () => {
		const { client, tools } = await connect("completo");
		expect(tools).toEqual(
			expect.arrayContaining([
				...READ_TOOLS,
				"cadastrar_cliente",
				"criar_orcamento",
				"registrar_pagamento",
				"cancelar_locacao",
				"lancar_no_caixa",
			]),
		);
		const listed = await client.listTools();
		const byName = new Map(listed.tools.map((tool) => [tool.name, tool]));
		expect(byName.get("registrar_pagamento")?.annotations?.readOnlyHint).toBe(
			false,
		);
		expect(byName.get("cancelar_locacao")?.annotations?.destructiveHint).toBe(
			true,
		);
		expect(byName.get("criar_orcamento")?.annotations?.destructiveHint).toBe(
			false,
		);
	});
});

describe("sessão", () => {
	it("entra uma vez, manda a origem no login e usa o cookie nas chamadas", async () => {
		const { api, call } = await connect("leitura");
		const first = await call("conferir_conexao");
		await call("conferir_conexao");
		expect(first.body).toMatchObject({
			usuario: "claude",
			papel: "ATTENDANT",
			modo: "leitura",
		});
		expect(api.state.signIns).toBe(1);
		expect(api.state.signInOrigins).toEqual([ORIGIN]);
	});

	it("entra de novo quando a sessão cai e repete a chamada", async () => {
		const { api, call } = await connect("leitura");
		await call("conferir_conexao");
		api.state.validCookie = "tok-2";
		const again = await call("conferir_conexao");
		expect(again.isError).toBe(false);
		expect(api.state.signIns).toBe(2);
	});

	it("senha errada vira erro de login legível, sem derrubar o servidor", async () => {
		const { call } = await connect("leitura", "senha-errada");
		const result = await call("resumo_do_dia");
		expect(result.isError).toBe(true);
		expect(result.body).toEqual({
			erro: "LOGIN",
			mensagem: "O sistema recusou o usuário ou a senha do MCP.",
		});
	});

	it("junta vários Set-Cookie e ignora cookie apagado", () => {
		const headers = new Headers();
		headers.append("set-cookie", "a=1; Path=/; HttpOnly");
		headers.append("set-cookie", "b=; Max-Age=0");
		headers.append("set-cookie", "c=3; Secure");
		expect(sessionCookie(headers)).toBe("a=1; c=3");
		expect(sessionCookie(new Headers())).toBeNull();
	});
});

describe("dados", () => {
	it("repassa a consulta de disponibilidade como o contrato espera", async () => {
		const { call } = await connect("leitura");
		const result = await call("verificar_disponibilidade", {
			start: "2026-12-01T08:00:00-03:00",
			end: "2026-12-03T08:00:00-03:00",
			query: "martelete",
		});
		expect(result.body).toEqual({
			echo: {
				start: "2026-12-01T08:00:00-03:00",
				end: "2026-12-03T08:00:00-03:00",
				query: "martelete",
			},
		});
	});

	it("recusa data sem fuso antes de chamar a API", async () => {
		const { api, client } = await connect("leitura");
		const result = await client.callTool({
			name: "verificar_disponibilidade",
			arguments: {
				start: "2026-12-01T08:00:00",
				end: "2026-12-03T08:00:00-03:00",
			},
		});
		expect(result.isError).toBe(true);
		expect(JSON.stringify(result.content)).toContain("Input validation error");
		expect(api.state.signIns).toBe(0);
	});

	it("cliente sai sem CPF/CNPJ e sem endereço", async () => {
		const { call } = await connect("leitura");
		const result = await call("buscar_clientes", { q: "joão" });
		const [customer] = result.body.clientes;
		expect(customer.name).toBe("João Pedreiro");
		expect(customer).not.toHaveProperty("taxId");
		expect(customer).not.toHaveProperty("address");
		expect(JSON.stringify(result.body)).not.toContain("123.456.789-00");
	});

	it("conflito de agenda volta como erro com as unidades ocupadas", async () => {
		const { call } = await connect("completo");
		const result = await call("criar_orcamento", {
			customerId: "c1",
			startAt: "2026-12-01T08:00:00-03:00",
			endAt: "2026-12-02T08:00:00-03:00",
			items: [{ kind: "UNIT", code: "MAR-002" }],
			deliveryMode: "DELIVERY",
		});
		expect(result.isError).toBe(true);
		expect(result.body.erro).toBe("CONFLICT");
		expect(result.body.detalhes.conflicts[0]).toMatchObject({
			code: "MAR-002",
			rentalNumber: "LOC-0003",
		});
	});
});

describe("dinheiro", () => {
	const payment = {
		number: "LOC-0012",
		kind: "SIGNAL",
		amountCents: 4000,
		method: "PIX",
	};

	it("a mesma chamada no mesmo dia usa a mesma chave de idempotência", async () => {
		const { api, call } = await connect("completo");
		await call("registrar_pagamento", payment);
		await call("registrar_pagamento", payment);
		await call("registrar_pagamento", { ...payment, reference: "segundo pix" });
		const [first, repeat, other] = api.state.paymentKeys;
		expect(first).toMatch(/^mcp-[0-9a-f]{40}$/);
		expect(repeat).toBe(first);
		expect(other).not.toBe(first);
	});

	it("lançamento avulso não devolve a chave do comprovante", async () => {
		const { api, call } = await connect("completo");
		const result = await call("lancar_no_caixa", {
			direction: "OUT",
			category: "FUEL",
			amountCents: 5000,
			method: "PIX",
			description: "Gasolina da entrega",
		});
		expect(result.body.hasReceipt).toBe(true);
		expect(result.body).not.toHaveProperty("receiptFileKey");
		expect(api.state.ledgerInputs[0]).toMatchObject({
			occurredAt: NOW.toISOString(),
			receiptFileKey: null,
		});
	});

	it("operações não existem no modo leitura", async () => {
		const { api, client } = await connect("leitura");
		await expect(
			client.callTool({ name: "registrar_pagamento", arguments: payment }),
		).rejects.toThrow(/not found/);
		expect(api.state.paymentKeys).toEqual([]);
	});
});
