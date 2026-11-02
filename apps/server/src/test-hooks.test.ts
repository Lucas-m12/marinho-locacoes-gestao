import { describe, expect, it, vi } from "vitest";
import {
	createTestClock,
	loadTestHooks,
	TestHooksInProductionError,
	testHooksEnabled,
} from "./test-hooks";

describe("ganchos de teste do E2E", () => {
	it("ficam desligados sem E2E_TEST_HOOKS", () => {
		expect(testHooksEnabled({ NODE_ENV: "development" })).toBe(false);
		expect(testHooksEnabled({ NODE_ENV: "production" })).toBe(false);
		expect(testHooksEnabled({ NODE_ENV: "test", E2E_TEST_HOOKS: false })).toBe(
			false,
		);
	});

	it("ligam fora de produção", () => {
		expect(
			testHooksEnabled({ NODE_ENV: "development", E2E_TEST_HOOKS: true }),
		).toBe(true);
		expect(testHooksEnabled({ NODE_ENV: "test", E2E_TEST_HOOKS: true })).toBe(
			true,
		);
	});

	it("impedem o servidor de subir em produção", async () => {
		expect(() =>
			testHooksEnabled({ NODE_ENV: "production", E2E_TEST_HOOKS: true }),
		).toThrow(TestHooksInProductionError);
		await expect(
			loadTestHooks(
				{ NODE_ENV: "production", E2E_TEST_HOOKS: true },
				{ db: {} as never, storage: {} as never },
			),
		).rejects.toThrow(TestHooksInProductionError);
	});

	it("o relógio de teste anda a partir do instante informado", () => {
		vi.useFakeTimers({ now: new Date("2030-01-01T00:00:00Z") });
		try {
			const clock = createTestClock(new Date("2026-11-02T10:30:00Z"));
			expect(clock.now().toISOString()).toBe("2026-11-02T10:30:00.000Z");
			vi.advanceTimersByTime(60_000);
			expect(clock.now().toISOString()).toBe("2026-11-02T10:31:00.000Z");
			clock.set(new Date("2026-11-03T11:31:00Z"));
			expect(clock.now().toISOString()).toBe("2026-11-03T11:31:00.000Z");
		} finally {
			vi.useRealTimers();
		}
	});
});
