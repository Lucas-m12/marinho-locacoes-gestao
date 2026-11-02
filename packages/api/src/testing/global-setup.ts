import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TEST_DATABASE_URL } from "./harness";

export default function setup(): void {
	execFileSync("bunx", ["prisma", "migrate", "deploy"], {
		cwd: fileURLToPath(new URL("../../../db", import.meta.url)),
		env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
		stdio: "inherit",
	});
}
