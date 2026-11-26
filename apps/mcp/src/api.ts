import type { AppClient } from "@marinho-gestao/contract";
import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

export type FetchLike = (
	input: Request | string,
	init?: RequestInit,
) => Promise<Response>;

export type ApiOptions = {
	apiUrl: string;
	origin: string;
	username: string;
	readPassword: () => string;
	/** Trocado nos testes para falar com um servidor em memória. */
	fetch?: FetchLike;
};

export class SignInError extends Error {
	override name = "SignInError";
}

/**
 * Sessão do Better Auth do usuário do MCP. Entra na primeira chamada, guarda
 * só o cookie em memória e entra de novo quando a API responde UNAUTHORIZED.
 */
export class ApiSession {
	readonly #options: ApiOptions;
	readonly #fetch: FetchLike;
	#cookie: string | null = null;
	#pending: Promise<string> | null = null;

	constructor(options: ApiOptions) {
		this.#options = options;
		this.#fetch = options.fetch ?? ((input, init) => fetch(input, init));
	}

	cookie(): Promise<string> {
		if (this.#cookie) return Promise.resolve(this.#cookie);
		this.#pending ??= this.#signIn().finally(() => {
			this.#pending = null;
		});
		return this.#pending;
	}

	invalidate(): void {
		this.#cookie = null;
	}

	/** Encerra a sessão no servidor. Melhor esforço: falha aqui não importa. */
	async signOut(): Promise<void> {
		const cookie = this.#cookie;
		this.#cookie = null;
		if (!cookie) return;
		try {
			await this.#fetch(`${this.#options.apiUrl}/api/auth/sign-out`, {
				method: "POST",
				headers: { cookie, origin: this.#options.origin },
				signal: AbortSignal.timeout(3000),
			});
		} catch {
			// a sessão expira sozinha
		}
	}

	async #signIn(): Promise<string> {
		const { apiUrl, origin, username } = this.#options;
		let response: Response;
		try {
			response = await this.#fetch(`${apiUrl}/api/auth/sign-in/username`, {
				method: "POST",
				headers: { "content-type": "application/json", origin },
				body: JSON.stringify({
					username,
					password: this.#options.readPassword(),
				}),
			});
		} catch (error) {
			throw new SignInError(
				`Não consegui falar com ${apiUrl}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		if (!response.ok) throw new SignInError(signInFailure(response.status));
		const cookie = sessionCookie(response.headers);
		if (!cookie) {
			throw new SignInError(
				"O sistema aceitou o login mas não mandou o cookie.",
			);
		}
		this.#cookie = cookie;
		return cookie;
	}
}

function signInFailure(status: number): string {
	if (status === 401) {
		return "O sistema recusou o usuário ou a senha do MCP.";
	}
	if (status === 429) {
		return "Muitas tentativas de login seguidas. Espere um minuto.";
	}
	return `O sistema recusou o login (HTTP ${status}).`;
}

/** Junta os pares `nome=valor` dos Set-Cookie numa linha de Cookie. */
export function sessionCookie(headers: Headers): string | null {
	const pairs = headers
		.getSetCookie()
		.map((line) => line.split(";", 1)[0]?.trim() ?? "")
		.filter((pair) => /^[^=]+=.+$/.test(pair));
	return pairs.length > 0 ? pairs.join("; ") : null;
}

/** Cliente tipado pelo contrato, o mesmo que o front usa, com o cookie do MCP. */
export function createApiClient(
	session: ApiSession,
	options: Pick<ApiOptions, "apiUrl" | "fetch">,
): AppClient {
	const doFetch: FetchLike =
		options.fetch ?? ((input, init) => fetch(input, init));
	const link = new RPCLink({
		url: `${options.apiUrl}/rpc`,
		headers: async () => ({ cookie: await session.cookie() }),
		fetch: (request, init) => doFetch(request, init),
	});
	return createORPCClient(link);
}

/** Roda a chamada; se a sessão tiver caído, entra de novo e tenta uma vez. */
export async function withSession<T>(
	session: ApiSession,
	run: () => Promise<T>,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (!(error instanceof ORPCError) || error.code !== "UNAUTHORIZED") {
			throw error;
		}
		session.invalidate();
		return run();
	}
}
