import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const E2E_ROOT = fileURLToPath(new URL("../", import.meta.url));

export const REFERENCE_NOW = "2026-11-02T07:30:00-03:00";

export type DataSource = "http" | "mock";
export const DATA_SOURCE: DataSource =
	process.env.E2E_DATA_SOURCE === "mock" ? "mock" : "http";
export const IS_MOCK = DATA_SOURCE === "mock";

export const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 3100);
export const WEB_PORT = Number(
	process.env.E2E_WEB_PORT ?? (IS_MOCK ? 3102 : 3101),
);
export const SERVER_URL = `http://localhost:${SERVER_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

export const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5433/marinho_test";

export const S3 = {
	endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
	accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin",
	secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin-secret",
	bucket: process.env.S3_BUCKET ?? "marinho-e2e",
};

export const ALLOWED_HOSTS = new Set([
	"localhost",
	"127.0.0.1",
	new URL(S3.endpoint).hostname,
]);

export const DEMO_PASSWORD = "marinho123";

export const USERS = {
	lucas: { name: "Lucas", role: "MANAGER" },
	atendimento: { name: "Atendimento", role: "ATTENDANT" },
	equipamentos: { name: "Equipamentos", role: "EQUIPMENT" },
} as const;
export type Username = keyof typeof USERS;

export function storageStateOf(username: Username): string {
	return `${E2E_ROOT}.auth/${DATA_SOURCE}-${username}.json`;
}
