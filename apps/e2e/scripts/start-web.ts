import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { DATA_SOURCE, REPO_ROOT, SERVER_URL, WEB_PORT } from "../support/env";

const webDir = join(REPO_ROOT, "apps/web");
const outDir = `dist/e2e-${DATA_SOURCE}`;
const env = {
	...process.env,
	VITE_DATA_SOURCE: DATA_SOURCE,
	VITE_SERVER_URL: DATA_SOURCE === "http" ? SERVER_URL : "",
	VITE_SENTRY_DSN: "",
};

const build = spawnSync(
	"bunx",
	["vite", "build", "--mode", "e2e", "--outDir", outDir, "--emptyOutDir"],
	{ cwd: webDir, env, stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const preview = spawn(
	"bunx",
	[
		"vite",
		"preview",
		"--mode",
		"e2e",
		"--outDir",
		outDir,
		"--port",
		String(WEB_PORT),
		"--strictPort",
	],
	{ cwd: webDir, env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => preview.kill(signal));
}
preview.on("exit", (code) => process.exit(code ?? 0));
