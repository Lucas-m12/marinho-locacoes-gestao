import type { Session } from "@marinho-gestao/contract";
import { adminClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { client } from "@/data/client";
import { ENV } from "@/env.public";
import { type AuthGateway, InvalidCredentialsError } from "./types";

const SESSION_REUSE_MS = 60_000;

export function createBetterAuthGateway(): AuthGateway {
	const authClient = createAuthClient({
		baseURL: ENV.VITE_SERVER_URL,
		plugins: [usernameClient(), adminClient()],
	});

	let recent: { at: number; session: Promise<Session | null> } | null = null;

	function remember(session: Promise<Session | null>) {
		recent = { at: Date.now(), session };
		session.catch(() => {
			recent = null;
		});
		return session;
	}

	async function fetchSession(): Promise<Session | null> {
		const { data } = await authClient.getSession();
		return data ? client.session.me() : null;
	}

	return {
		getSession() {
			if (recent && Date.now() - recent.at < SESSION_REUSE_MS) {
				return recent.session;
			}
			return remember(fetchSession());
		},
		async signIn({ username, password, rememberMe }) {
			recent = null;
			const { error } = await authClient.signIn.username({
				username,
				password,
				rememberMe,
			});
			if (error) throw new InvalidCredentialsError();
			const session = client.session.me();
			remember(session);
			return session;
		},
		async signOut() {
			recent = null;
			await authClient.signOut();
		},
	};
}
