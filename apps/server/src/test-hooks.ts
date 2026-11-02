import type { ObjectStorage } from "@marinho-gestao/api";
import type { Database } from "@marinho-gestao/db";
import type { Hono } from "hono";

export type TestHooksEnv = {
	NODE_ENV: "development" | "production" | "test";
	E2E_TEST_HOOKS?: boolean;
};

export class TestHooksInProductionError extends Error {
	constructor() {
		super(
			"E2E_TEST_HOOKS=1 não pode ser usado com NODE_ENV=production: o servidor não sobe.",
		);
		this.name = "TestHooksInProductionError";
	}
}

export function testHooksEnabled(env: TestHooksEnv): boolean {
	if (!env.E2E_TEST_HOOKS) return false;
	if (env.NODE_ENV === "production") throw new TestHooksInProductionError();
	return true;
}

export type TestClock = {
	now: () => Date;
	set: (at: Date) => void;
};

export function createTestClock(start: Date = new Date()): TestClock {
	let offsetMs = start.getTime() - Date.now();
	return {
		now: () => new Date(Date.now() + offsetMs),
		set(at) {
			offsetMs = at.getTime() - Date.now();
		},
	};
}

export type TestHooks = { clock: TestClock; routes: Hono };

export async function loadTestHooks(
	env: TestHooksEnv,
	services: { db: Database; storage: ObjectStorage },
): Promise<TestHooks | null> {
	if (!testHooksEnabled(env)) return null;
	const { createTestRoutes } = await import("./test-routes");
	const clock = createTestClock();
	return { clock, routes: createTestRoutes({ ...services, clock }) };
}
