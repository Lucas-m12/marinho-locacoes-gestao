import type { Session } from "@marinho-gestao/contract";

export type SignInOptions = { remember?: boolean };

export interface AuthGateway {
	getSession(): Promise<Session | null>;
	signIn(
		email: string,
		password: string,
		options?: SignInOptions,
	): Promise<Session>;
	signOut(): Promise<void>;
}

export class InvalidCredentialsError extends Error {
	constructor() {
		super("E-mail ou senha incorretos.");
		this.name = "InvalidCredentialsError";
	}
}
