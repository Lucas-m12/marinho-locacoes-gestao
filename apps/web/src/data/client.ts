import type { AppClient } from "@marinho-gestao/contract";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

async function createClient(): Promise<AppClient> {
	return import.meta.env.VITE_DATA_SOURCE === "http"
		? (await import("./http")).createHttpClient()
		: (await import("./mock")).createMockClient();
}

export const client = await createClient();
export const orpc = createTanstackQueryUtils(client);
