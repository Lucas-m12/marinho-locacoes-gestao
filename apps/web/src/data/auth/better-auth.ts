import { createAuthClient } from "better-auth/react";
import { client } from "@/data/client";
import { ENV } from "@/env.public";
import { type AuthGateway, InvalidCredentialsError } from "./types";

export function createBetterAuthGateway(): AuthGateway {
	const authClient = createAuthClient({ baseURL: ENV.VITE_SERVER_URL });

	return {
		async getSession() {
			const { data } = await authClient.getSession();
			return data ? client.session.me() : null;
		},
		async signIn(email, password, options) {
			const { error } = await authClient.signIn.email({
				email,
				password,
				rememberMe: options?.remember ?? true,
			});
			if (error) throw new InvalidCredentialsError();
			return client.session.me();
		},
		async signOut() {
			await authClient.signOut();
		},
	};
}
