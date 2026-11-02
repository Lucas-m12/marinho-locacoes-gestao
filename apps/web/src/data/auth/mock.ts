import type { Session } from "@marinho-gestao/contract";
import { addHours } from "@marinho-gestao/domain";
import { mockNow } from "@/data/mock/clock";
import { getDb } from "@/data/mock/db";
import { readJson, removeKey, writeJson } from "@/data/mock/storage";
import { type AuthGateway, InvalidCredentialsError } from "./types";

const SESSION_KEY = "marinho:mock:session";
const SESSION_HOURS = 24 * 90;

type StoredSession = { userId: string; expiresAt: string };

function readStored(): StoredSession | null {
	return (
		readJson<StoredSession>("session", SESSION_KEY) ??
		readJson<StoredSession>("local", SESSION_KEY)
	);
}

export function readMockSession(): Session | null {
	const stored = readStored();
	if (!stored || Date.parse(stored.expiresAt) <= mockNow().getTime()) {
		return null;
	}
	const user = getDb().users.find((entry) => entry.id === stored.userId);
	if (!user) return null;
	return {
		user: {
			id: user.id,
			name: user.name,
			username: user.username,
			role: user.role,
		},
		expiresAt: stored.expiresAt,
	};
}

export function createMockAuthGateway(): AuthGateway {
	return {
		async getSession() {
			return readMockSession();
		},
		async signIn({ username, password, rememberMe }) {
			const user = getDb().users.find(
				(entry) =>
					entry.username === username.trim().toLowerCase() &&
					entry.password === password,
			);
			if (!user) throw new InvalidCredentialsError();

			const stored: StoredSession = {
				userId: user.id,
				expiresAt: addHours(mockNow(), SESSION_HOURS).toISOString(),
			};
			removeKey("session", SESSION_KEY);
			removeKey("local", SESSION_KEY);
			writeJson(rememberMe ? "local" : "session", SESSION_KEY, stored);

			const session = readMockSession();
			if (!session) throw new InvalidCredentialsError();
			return session;
		},
		async signOut() {
			removeKey("session", SESSION_KEY);
			removeKey("local", SESSION_KEY);
		},
	};
}
