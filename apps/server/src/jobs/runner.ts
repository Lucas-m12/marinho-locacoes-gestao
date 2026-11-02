import { recordEvent } from "@marinho-gestao/api";
import { errorFields, log } from "../logger";
import type { Job, JobContext } from "./types";

export type JobOutcome =
	| { ok: true; affected: number; durationMs: number }
	| { ok: false; durationMs: number };

export type ReportJobError = (error: unknown, job: Job) => void;

export async function runJob(
	job: Job,
	context: JobContext,
	reportError?: ReportJobError,
): Promise<JobOutcome> {
	const runId = crypto.randomUUID();
	const started = performance.now();
	const elapsed = () => Math.round(performance.now() - started);
	log("info", "job started", { job: job.name, runId });
	try {
		const { affected, details = {} } = await job.run(context);
		const durationMs = elapsed();
		if (affected > 0 || job.recordEveryRun) {
			await recordEvent(context.db, {
				actor: null,
				action: "job.completed",
				entity: "Job",
				entityId: job.name,
				at: context.clock(),
				payload: { runId, affected, durationMs, ...details },
			});
		}
		log("info", "job finished", {
			job: job.name,
			runId,
			affected,
			durationMs,
			...details,
		});
		return { ok: true, affected, durationMs };
	} catch (error) {
		const durationMs = elapsed();
		log("error", "job failed", {
			job: job.name,
			runId,
			durationMs,
			...errorFields(error),
		});
		reportError?.(error, job);
		return { ok: false, durationMs };
	}
}
