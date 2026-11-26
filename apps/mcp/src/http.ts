import { createHash, timingSafeEqual } from "node:crypto";
import {
	createMcpHandler,
	hostHeaderValidationResponse,
} from "@modelcontextprotocol/server";
import { ConfigError } from "./config";
import { createMarinhoMcpServer } from "./server";
import type { ToolDeps } from "./tools";

/** 32 caracteres de `openssl rand -hex 32` já são 128 bits; o roteiro gera 64. */
export const MIN_TOKEN_LENGTH = 32;
/** Tentativas com token errado por IP antes de bloquear por um tempo. */
export const MAX_FAILURES = 10;
export const FAILURE_WINDOW_MS = 15 * 60_000;
const MAX_BODY_BYTES = 1024 * 1024;

export type LogFields = Record<string, unknown>;
export type Logger = (
	level: "info" | "warn" | "error",
	message: string,
	fields?: LogFields,
) => void;

export type HttpAppOptions = {
	deps: ToolDeps;
	/** Token que o conector do Claude manda em `Authorization: Bearer …`. */
	token: string;
	/** Hosts aceitos no cabeçalho Host (o domínio público, sem porta). */
	allowedHosts: string[];
	clock?: () => number;
	log?: Logger;
};

export type HttpApp = {
	fetch: (request: Request) => Promise<Response>;
	close: () => Promise<void>;
};

/**
 * MCP por HTTP (Streamable HTTP, sem sessão) atrás do Caddy. Ordem das
 * barreiras: caminho, Host, bloqueio por tentativas erradas e token. Só
 * depois disso a requisição chega ao SDK.
 */
export function createHttpApp(options: HttpAppOptions): HttpApp {
	if (options.token.length < MIN_TOKEN_LENGTH) {
		throw new ConfigError(
			`MCP_TOKEN precisa de pelo menos ${MIN_TOKEN_LENGTH} caracteres. Gere com: openssl rand -hex 32`,
		);
	}
	if (options.allowedHosts.length === 0) {
		throw new ConfigError("Defina MCP_PUBLIC_HOST com o domínio público.");
	}
	const clock = options.clock ?? Date.now;
	const log: Logger = options.log ?? (() => undefined);
	const expected = digest(options.token);
	const failures = new Map<string, { count: number; since: number }>();

	const mcp = createMcpHandler(
		() => createMarinhoMcpServer(options.deps).server,
		{
			legacy: "stateless",
			maxRequestBodySize: MAX_BODY_BYTES,
			onerror: (error) => log("warn", "mcp", { error: error.message }),
		},
	);

	function blockedUntil(ip: string): number | null {
		const entry = failures.get(ip);
		if (!entry) return null;
		if (clock() - entry.since > FAILURE_WINDOW_MS) {
			failures.delete(ip);
			return null;
		}
		return entry.count >= MAX_FAILURES ? entry.since + FAILURE_WINDOW_MS : null;
	}

	function registerFailure(ip: string): void {
		const entry = failures.get(ip);
		if (!entry || clock() - entry.since > FAILURE_WINDOW_MS) {
			failures.set(ip, { count: 1, since: clock() });
		} else {
			entry.count += 1;
		}
		if (failures.size > 10_000) failures.clear();
	}

	function authorized(request: Request): boolean {
		const header = request.headers.get("authorization") ?? "";
		const match = /^Bearer\s+(.+)$/i.exec(header.trim());
		if (!match?.[1]) return false;
		return timingSafeEqual(digest(match[1]), expected);
	}

	return {
		async fetch(request) {
			const { pathname } = new URL(request.url);
			if (pathname === "/health" && request.method === "GET") {
				return json({ ok: true });
			}
			if (pathname !== "/mcp") return json({ error: "NOT_FOUND" }, 404);

			const badHost = hostHeaderValidationResponse(
				request,
				options.allowedHosts,
			);
			if (badHost) return badHost;

			const ip = clientIp(request);
			const until = blockedUntil(ip);
			if (until !== null) {
				return json({ error: "TOO_MANY_ATTEMPTS" }, 429, {
					"retry-after": String(Math.ceil((until - clock()) / 1000)),
				});
			}
			if (!authorized(request)) {
				registerFailure(ip);
				log("warn", "token recusado", { ip });
				return json({ error: "UNAUTHORIZED" }, 401, {
					"www-authenticate": 'Bearer realm="marinho-mcp"',
				});
			}
			failures.delete(ip);
			return mcp.fetch(request);
		},
		close: () => mcp.close(),
	};
}

/** O Caddy põe o IP de quem chamou no fim do X-Forwarded-For. */
export function clientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	const last = forwarded?.split(",").pop()?.trim();
	return last || "direto";
}

function digest(value: string): Buffer {
	return createHash("sha256").update(value).digest();
}

function json(
	body: unknown,
	status = 200,
	headers: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}
