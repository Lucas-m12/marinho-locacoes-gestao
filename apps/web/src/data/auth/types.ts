import type { Session } from "@marinho-gestao/contract";

export type SignInInput = {
	username: string;
	password: string;
	rememberMe: boolean;
};

export interface AuthGateway {
	getSession(): Promise<Session | null>;
	signIn(input: SignInInput): Promise<Session>;
	signOut(): Promise<void>;
}

export class InvalidCredentialsError extends Error {
	constructor() {
		super("Usuário ou senha incorretos.");
		this.name = "InvalidCredentialsError";
	}
}
