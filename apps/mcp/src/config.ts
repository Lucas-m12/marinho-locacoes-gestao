import { spawnSync } from "node:child_process";

/** `leitura` só registra as ferramentas de consulta; `completo` inclui as que mudam dados. */
export type Mode = "leitura" | "completo";

export type McpConfig = {
	apiUrl: string;
	/** Origem confiável do Better Auth (a do front), enviada no login. */
	origin: string;
	username: string;
	mode: Mode;
	/** Lida a cada login, para a senha não ficar guardada no processo. */
	readPassword: () => string;
};

export const DEFAULT_API_URL = "https://api.marinholocacoes.com";
export const DEFAULT_ORIGIN = "https://sistema.marinholocacoes.com";
/** Nome do item no app Chaves (Keychain) do macOS. */
export const KEYCHAIN_SERVICE = "marinho-mcp";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class ConfigError extends Error {
	override name = "ConfigError";
}

type Env = Record<string, string | undefined>;

export function readConfig(
	env: Env = process.env,
	platform: NodeJS.Platform = process.platform,
): McpConfig {
	const apiUrl = trimSlash(env.MARINHO_API_URL ?? DEFAULT_API_URL);
	assertSafeUrl(apiUrl, "MARINHO_API_URL");
	const origin = trimSlash(env.MARINHO_ORIGIN ?? DEFAULT_ORIGIN);
	const username = env.MARINHO_USUARIO?.trim();
	if (!username) {
		throw new ConfigError(
			"Defina MARINHO_USUARIO com o usuário do Claude no sistema (por exemplo, claude).",
		);
	}
	return {
		apiUrl,
		origin,
		username,
		mode: parseMode(env.MARINHO_MCP_MODO),
		readPassword: () => readPassword(env, platform, username),
	};
}

export function parseMode(value: string | undefined): Mode {
	const mode = value?.trim().toLowerCase() || "leitura";
	if (mode === "leitura" || mode === "completo") return mode;
	throw new ConfigError(
		`MARINHO_MCP_MODO deve ser "leitura" ou "completo" (veio "${value}").`,
	);
}

/**
 * A senha só viaja por HTTPS. HTTP só para a API na própria máquina ou num
 * nome sem ponto, que só existe dentro da rede do Docker (ex.: `server`).
 */
export function assertSafeUrl(value: string, name: string): void {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new ConfigError(`${name} não é uma URL válida: ${value}`);
	}
	if (url.protocol === "https:") return;
	const internal = LOCAL_HOSTS.has(url.hostname) || !url.hostname.includes(".");
	if (url.protocol === "http:" && internal) return;
	throw new ConfigError(
		`${name} precisa ser https (http só para localhost ou a rede interna do Docker): ${value}`,
	);
}

function readPassword(
	env: Env,
	platform: NodeJS.Platform,
	username: string,
): string {
	const fromEnv = env.MARINHO_SENHA;
	if (fromEnv) return fromEnv;
	if (platform !== "darwin") {
		throw new ConfigError(
			"Sem senha: defina MARINHO_SENHA (fora do macOS não há leitura do Chaves).",
		);
	}
	const result = spawnSync(
		"security",
		["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", username, "-w"],
		{ encoding: "utf8" },
	);
	const password = result.stdout?.replace(/\r?\n$/, "") ?? "";
	if (result.status !== 0 || password === "") {
		throw new ConfigError(
			`Senha não encontrada no Chaves (serviço "${KEYCHAIN_SERVICE}", conta "${username}"). Veja apps/mcp/README.md.`,
		);
	}
	return password;
}

function trimSlash(value: string): string {
	return value.trim().replace(/\/+$/, "");
}
