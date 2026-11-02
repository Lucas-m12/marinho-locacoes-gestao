// Alchemy validates deployment inputs with Varlock; Workers use native env bindings.
import type { PublicCoercedEnvSchema } from "./env";

export const ENV = {
	VITE_DATA_SOURCE: (import.meta.env.VITE_DATA_SOURCE ??
		"mock") as PublicCoercedEnvSchema["VITE_DATA_SOURCE"],
	VITE_SERVER_URL: import.meta.env.VITE_SERVER_URL ?? "",
};
