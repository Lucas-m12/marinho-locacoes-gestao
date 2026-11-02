import type { AuthGateway } from "./types";

export type { AuthGateway } from "./types";
export { InvalidCredentialsError } from "./types";

async function createGateway(): Promise<AuthGateway> {
	return import.meta.env.VITE_DATA_SOURCE === "http"
		? (await import("./better-auth")).createBetterAuthGateway()
		: (await import("./mock")).createMockAuthGateway();
}

export const authGateway = await createGateway();
