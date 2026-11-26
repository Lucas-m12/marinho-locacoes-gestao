#!/usr/bin/env bun
/**
 * MCP local do sistema da Marinho. Roda no computador do Lucas, chamado pelo
 * Claude Desktop ou pelo Claude Code por stdio: não abre porta nenhuma. Fala
 * com a API de produção como o front fala, logado com o usuário do Claude.
 *
 * stdout é o canal do protocolo: qualquer log vai para stderr.
 */
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { ApiSession, createApiClient, withSession } from "./api";
import { ConfigError, readConfig } from "./config";
import { createMarinhoMcpServer } from "./server";

function log(message: string): void {
	process.stderr.write(`[marinho-mcp] ${message}\n`);
}

let config: ReturnType<typeof readConfig>;
try {
	config = readConfig();
} catch (error) {
	log(error instanceof ConfigError ? error.message : String(error));
	process.exit(1);
}

const session = new ApiSession(config);
const api = createApiClient(session, config);
const deps = {
	api,
	mode: config.mode,
	apiUrl: config.apiUrl,
	now: () => new Date(),
	call: <T>(run: () => Promise<T>) => withSession(session, run),
};

const handle = serveStdio(
	() => {
		const { server, tools } = createMarinhoMcpServer(deps);
		log(`conectado: ${tools.length} ferramentas no modo ${config.mode}`);
		return server;
	},
	{ onerror: (error) => log(`erro no transporte: ${error.message}`) },
);

log(`pronto: ${config.apiUrl}, usuário ${config.username}`);

let closing = false;
async function shutdown(): Promise<void> {
	if (closing) return;
	closing = true;
	await handle.close().catch(() => undefined);
	await session.signOut();
	process.exit(0);
}

process.stdin.on("end", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
