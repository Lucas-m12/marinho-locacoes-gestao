import { createPrismaClient } from "@marinho-gestao/db";
import { BUSINESS_TIME_ZONE } from "@marinho-gestao/domain";
import { Cron } from "croner";
import { ENV } from "../env.server";
import { log } from "../logger";
import { flushSentry, initSentry, reportError } from "../sentry";
import { backupStorage, uploadsStorage } from "../storage";
import { pgDump } from "./backup";
import { findJob, JOBS } from "./definitions";
import { type ReportJobError, runJob } from "./runner";
import type { JobContext } from "./types";

const sentryEnabled = initSentry(ENV, "jobs");
const reportJobError: ReportJobError | undefined = sentryEnabled
	? (error, job) => reportError(error, { job: job.name })
	: undefined;
const db = createPrismaClient(ENV);

const context: JobContext = {
	db,
	storage: uploadsStorage(ENV),
	clock: () => new Date(),
	backup: () => ({
		databaseUrl: ENV.DATABASE_URL,
		target: backupStorage(ENV),
		dump: pgDump,
	}),
};

async function runOnce(name: string): Promise<number> {
	const job = findJob(name);
	if (!job) {
		log("error", "unknown job", {
			job: name,
			available: JOBS.map((entry) => entry.name),
		});
		return 2;
	}
	const outcome = await runJob(job, context, reportJobError);
	return outcome.ok ? 0 : 1;
}

function startScheduler(): void {
	const running = new Set<Promise<unknown>>();
	const crons = JOBS.map(
		(job) =>
			new Cron(
				job.schedule,
				{
					name: job.name,
					timezone: BUSINESS_TIME_ZONE,
					protect: () =>
						log("warn", "job skipped: previous run still going", {
							job: job.name,
						}),
				},
				async () => {
					const run = runJob(job, context, reportJobError);
					running.add(run);
					await run;
					running.delete(run);
				},
			),
	);
	log("info", "scheduler started", {
		timezone: BUSINESS_TIME_ZONE,
		jobs: crons.map((cron) => ({
			job: cron.name,
			nextRun: cron.nextRun()?.toISOString() ?? null,
		})),
	});

	const stop = async (signal: string) => {
		log("info", "scheduler stopping", { signal, running: running.size });
		for (const cron of crons) cron.stop();
		await Promise.allSettled(running);
		await Promise.all([db.$disconnect(), flushSentry()]);
		process.exit(0);
	};
	process.once("SIGTERM", () => void stop("SIGTERM"));
	process.once("SIGINT", () => void stop("SIGINT"));
}

const requested = process.argv[2];
if (requested) {
	const code = await runOnce(requested);
	await Promise.all([db.$disconnect(), flushSentry()]);
	process.exit(code);
} else {
	startScheduler();
}
