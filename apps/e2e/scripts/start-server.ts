import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import {
	REPO_ROOT,
	S3,
	SERVER_PORT,
	SERVER_URL,
	TEST_DATABASE_URL,
	WEB_URL,
} from "../support/env";
import { setupMinio } from "./minio";

function run(
	command: string,
	args: string[],
	options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
	const result = spawnSync(command, args, {
		cwd: options.cwd ?? REPO_ROOT,
		env: { ...process.env, ...options.env },
		stdio: "inherit",
	});
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(" ")} terminou com ${result.status}`,
		);
	}
}

if (process.env.E2E_SKIP_DOCKER !== "1") {
	run("docker", [
		"compose",
		"--profile",
		"test",
		"up",
		"-d",
		"--wait",
		"postgres-test",
		"minio",
	]);
}

await setupMinio({ ...S3, allowedOrigins: [WEB_URL] });

run("bunx", ["prisma", "migrate", "deploy"], {
	cwd: join(REPO_ROOT, "packages/db"),
	env: { DATABASE_URL: TEST_DATABASE_URL },
});

const server = spawn("bun", ["src/index.ts"], {
	cwd: join(REPO_ROOT, "apps/server"),
	stdio: "inherit",
	env: {
		...process.env,
		NODE_ENV: "test",
		PORT: String(SERVER_PORT),
		E2E_TEST_HOOKS: "true",
		DATABASE_URL: TEST_DATABASE_URL,
		BETTER_AUTH_SECRET: "segredo-do-e2e-com-mais-de-32-caracteres",
		BETTER_AUTH_URL: SERVER_URL,
		CORS_ORIGIN: WEB_URL,
		R2_ACCOUNT_ID: "minio",
		R2_ACCESS_KEY_ID: S3.accessKeyId,
		R2_SECRET_ACCESS_KEY: S3.secretAccessKey,
		R2_BUCKET: S3.bucket,
		R2_ENDPOINT: S3.endpoint,
		SENTRY_DSN: "",
	},
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
