import type { ObjectStorage } from "@marinho-gestao/api";
import type { Database } from "@marinho-gestao/db";
import { reloadDemoData } from "@marinho-gestao/db/demo";
import {
	buildSeed,
	DEMO_PASSWORD,
	type DemoSeed,
	SEED_FILE_CONTENT_TYPE,
	seedFileSvg,
} from "@marinho-gestao/read-model/seed";
import { hashPassword } from "better-auth/crypto";
import { Hono } from "hono";
import { z } from "zod";
import { log } from "./logger";
import type { TestClock } from "./test-hooks";

const InstantBody = z.object({ now: z.iso.datetime({ offset: true }) });

async function readInstant(request: Request): Promise<Date | null> {
	const parsed = InstantBody.safeParse(await request.json().catch(() => null));
	return parsed.success ? new Date(parsed.data.now) : null;
}

async function storeSeedFiles(
	storage: ObjectStorage,
	seed: DemoSeed,
): Promise<void> {
	const fileKeys = seed.customers.flatMap((customer) =>
		customer.documents.map((document) => document.fileKey),
	);
	await Promise.all(
		fileKeys.map(async (fileKey) => {
			const url = await storage.presignPut(fileKey, SEED_FILE_CONTENT_TYPE, 60);
			const response = await fetch(url, {
				method: "PUT",
				headers: { "Content-Type": SEED_FILE_CONTENT_TYPE },
				body: seedFileSvg(fileKey),
			});
			if (!response.ok) {
				throw new Error(
					`O storage recusou o arquivo de exemplo ${fileKey}: ${response.status}`,
				);
			}
		}),
	);
}

export function createTestRoutes({
	db,
	storage,
	clock,
}: {
	db: Database;
	storage: ObjectStorage;
	clock: TestClock;
}): Hono {
	let passwordHash: Promise<string> | null = null;
	let queue: Promise<unknown> = Promise.resolve();
	const app = new Hono();

	app.post("/reset", async (c) => {
		const now = await readInstant(c.req.raw);
		if (!now) return c.json({ error: "INFORME_NOW" }, 400);
		passwordHash ??= hashPassword(DEMO_PASSWORD);
		const hash = await passwordHash;
		const run = queue.then(async () => {
			clock.set(now);
			const seed = buildSeed(now);
			await reloadDemoData(db, seed, hash, now);
			await storeSeedFiles(storage, seed);
		});
		queue = run.catch(() => undefined);
		await run;
		log("info", "test reset", { now: now.toISOString() });
		return c.json({ ok: true, now: now.toISOString() });
	});

	app.post("/clock", async (c) => {
		const now = await readInstant(c.req.raw);
		if (!now) return c.json({ error: "INFORME_NOW" }, 400);
		clock.set(now);
		return c.json({ ok: true, now: now.toISOString() });
	});

	app.get("/clock", (c) => c.json({ now: clock.now().toISOString() }));

	return app;
}
