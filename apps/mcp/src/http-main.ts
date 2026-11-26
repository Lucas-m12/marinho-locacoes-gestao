/**
 * MCP remoto: o processo do contêiner `mcp` na VPS. O Caddy manda para cá só
 * `/mcp`, e só de IPs da Anthropic; aqui ainda se exige o token. Daqui o MCP
 * fala com a API pela rede interna do Docker, logado como o usuário `claude`.
 *
 * Ambiente: MCP_TOKEN, MCP_PUBLIC_HOST, MARINHO_USUARIO, MARINHO_SENHA,
 * MARINHO_MCP_MODO, MARINHO_API_URL (http://server:3000) e PORT.
 */
import { ApiSession, createApiClient, withSession } from "./api";
import { ConfigError, readConfig } from "./config";
import { createHttpApp, type LogFields } from "./http";

function log(level: string, message: string, fields: LogFields = {}): void {
	process.stdout.write(
		`${JSON.stringify({ level, message, time: new Date().toISOString(), ...fields })}\n`,
	);
}

function start() {
	const config = readConfig();
	const session = new ApiSession(config);
	const app = createHttpApp({
		token: process.env.MCP_TOKEN ?? "",
		allowedHosts: (process.env.MCP_PUBLIC_HOST ?? "api.marinholocacoes.com")
			.split(",")
			.map((host) => host.trim())
			.filter(Boolean),
		log,
		deps: {
			api: createApiClient(session, config),
			mode: config.mode,
			apiUrl: config.apiUrl,
			now: () => new Date(),
			call: (run) => withSession(session, run),
			audit: (entry) => log("info", "ferramenta", entry),
		},
	});
	const port = Number(process.env.PORT ?? 3000);
	const server = Bun.serve({ port, hostname: "0.0.0.0", fetch: app.fetch });
	log("info", "mcp pronto", {
		port,
		api: config.apiUrl,
		usuario: config.username,
		modo: config.mode,
	});

	let closing = false;
	async function shutdown(): Promise<void> {
		if (closing) return;
		closing = true;
		await server.stop();
		await app.close().catch(() => undefined);
		await session.signOut();
		process.exit(0);
	}
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}

try {
	start();
} catch (error) {
	log("error", error instanceof ConfigError ? error.message : String(error));
	process.exit(1);
}
