import type { AppClient } from "@marinho-gestao/contract";
import { createRouterClient } from "@orpc/server";
import { readMockSession } from "@/data/auth/mock";
import { resetDb } from "./db";
import { mockRouter } from "./router";

export function createMockClient(): AppClient {
	return createRouterClient(mockRouter, {
		context: () => ({ session: readMockSession() }),
	}) as unknown as AppClient;
}

export function restoreSampleData(): void {
	resetDb();
}
