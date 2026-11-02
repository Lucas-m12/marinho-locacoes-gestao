import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { calendarDay } from "@marinho-gestao/domain";
import type { BackupSetup, DumpDatabase, JobResult } from "./types";

export const BACKUP_CONTENT_TYPE = "application/octet-stream";

export function backupKey(at: Date): string {
	const [year, month, day] = calendarDay(at).split("-");
	const stamp = at
		.toISOString()
		.replace(/\.\d{3}Z$/, "Z")
		.replace(/[-:]/g, "");
	return `postgres/${year}/${month}/${day}/marinho-${stamp}.dump`;
}

export function libpqEnvironment(databaseUrl: string): Record<string, string> {
	const url = new URL(databaseUrl);
	const environment: Record<string, string> = {
		PGHOST: url.hostname,
		PGPORT: url.port || "5432",
		PGUSER: decodeURIComponent(url.username),
		PGPASSWORD: decodeURIComponent(url.password),
		PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
	};
	const sslMode = url.searchParams.get("sslmode");
	if (sslMode) environment.PGSSLMODE = sslMode;
	return environment;
}

export const PG_DUMP_ARGS = [
	"--format=custom",
	"--compress=zstd:9",
	"--no-password",
] as const;

export const pgDump: DumpDatabase = (databaseUrl, outputPath) =>
	new Promise((resolve, reject) => {
		const child = spawn("pg_dump", [...PG_DUMP_ARGS, `--file=${outputPath}`], {
			env: { PATH: process.env.PATH ?? "", ...libpqEnvironment(databaseUrl) },
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) resolve();
			else
				reject(new Error(`pg_dump saiu com código ${code}: ${stderr.trim()}`));
		});
	});

export async function backupDatabase(
	setup: BackupSetup,
	clock: () => Date,
): Promise<JobResult> {
	const key = backupKey(clock());
	const dir = await mkdtemp(join(tmpdir(), "marinho-backup-"));
	const path = join(dir, "marinho.dump");
	try {
		const dumpStarted = performance.now();
		await setup.dump(setup.databaseUrl, path);
		const dumpMs = Math.round(performance.now() - dumpStarted);
		const { size } = await stat(path);
		if (size === 0) throw new Error("pg_dump gerou um arquivo vazio");

		const uploadStarted = performance.now();
		const { parts } = await setup.target.putFile(
			key,
			path,
			BACKUP_CONTENT_TYPE,
		);
		const uploadMs = Math.round(performance.now() - uploadStarted);
		return {
			affected: 1,
			details: { key, sizeBytes: size, parts, dumpMs, uploadMs },
		};
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
