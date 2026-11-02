import { adminClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { client } from "@/data/client";
import { ENV } from "@/env.public";
import { type AuthGateway, InvalidCredentialsError } from "./types";

export function createBetterAuthGateway(): AuthGateway {
	const authClient = createAuthClient({
		baseURL: ENV.VITE_SERVER_URL,
		plugins: [usernameClient(), adminClient()],
	});

	return {
		async getSession() {
			const { data } = await authClient.getSession();
			return data ? client.session.me() : null;
		},
		async signIn({ username, password, rememberMe }) {
			const { error } = await authClient.signIn.username({
				username,
				password,
				rememberMe,
			});
			if (error) throw new InvalidCredentialsError();
			return client.session.me();
		},
		async signOut() {
			await authClient.signOut();
		},
	};
}
