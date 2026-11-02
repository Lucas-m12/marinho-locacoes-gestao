import type { Session } from "@marinho-gestao/contract";
import { addHours, type Role } from "@marinho-gestao/domain";
import { defineScenarios } from "@marinho-gestao/scenarios";
import { createRouterClient } from "@orpc/server";
import { afterAll } from "vitest";
import { createMockAuthGateway } from "@/data/auth/mock";
import { setMockLatency } from "./base";
import { mockNow, resetMockClock, setMockClock } from "./clock";
import { getDb, resetDb } from "./db";
import { mockRouter } from "./router";

function sessionOf(role: Role): Session {
	const user = getDb().users.find((entry) => entry.role === role);
	if (!user) throw new Error(`sem usuário ${role}`);
	return {
		user: { id: user.id, name: user.name, username: user.username, role },
		expiresAt: addHours(mockNow(), 24 * 30).toISOString(),
	};
}

afterAll(resetMockClock);

defineScenarios({
	async reset(now) {
		setMockLatency(false);
		setMockClock(() => now);
		resetDb();
	},
	setNow(now) {
		setMockClock(() => now);
	},
	clientAs(role) {
		return createRouterClient(mockRouter, {
			context: { session: sessionOf(role) },
		});
	},
	anonymous() {
		return createRouterClient(mockRouter, { context: { session: null } });
	},
	signIn(username, password) {
		return createMockAuthGateway().signIn({
			username,
			password,
			rememberMe: false,
		});
	},
});
