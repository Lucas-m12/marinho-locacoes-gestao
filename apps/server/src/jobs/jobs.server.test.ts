import { writeFile } from "node:fs/promises";
import { createServerHarness } from "@marinho-gestao/api/testing/harness";
import { beforeEach, describe, expect, it } from "vitest";
import { findJob } from "./definitions";
import { runJob } from "./runner";
import type { BackupSetup, Job, JobContext } from "./types";

const NOW = new Date("2026-11-02T13:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;

const harness = createServerHarness();
let now = NOW;

function context(backup: Partial<BackupSetup> = {}): JobContext {
	return {
		db: harness.db,
		storage: harness.storage(),
		clock: () => now,
		backup: () => ({
			databaseUrl: "postgresql://u:p@localhost:5432/marinho",
			target: { putFile: async () => ({ sizeBytes: 5, parts: 1 }) },
			dump: (_, outputPath) => writeFile(outputPath, "PGDMP"),
			...backup,
		}),
	};
}

function job(name: string): Job {
	const found = findJob(name);
	if (!found) throw new Error(`tarefa ${name} não existe`);
	return found;
}

function jobEvents(name: string) {
	return harness.db.event.findMany({
		where: { entity: "Job", entityId: name },
		orderBy: { createdAt: "asc" },
	});
}

const ago = (ms: number) => new Date(NOW.getTime() - ms);

beforeEach(async () => {
	now = NOW;
	await harness.reset(NOW);
});

describe("expire-quotes", () => {
	it("expira orçamentos com sinal vencido, registra o sistema e não repete", async () => {
		now = new Date(NOW.getTime() + DAY);
		const awaiting = await harness.db.rental.count({
			where: { status: "AWAITING_DEPOSIT" },
		});
		expect(awaiting).toBeGreaterThan(0);

		const first = await runJob(job("expire-quotes"), context());
		expect(first).toMatchObject({ ok: true, affected: awaiting });
		expect(
			await harness.db.rental.count({ where: { status: "AWAITING_DEPOSIT" } }),
		).toBe(0);

		const events = await jobEvents("expire-quotes");
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			action: "job.completed",
			actorId: null,
			actorName: "Sistema",
			actorRole: null,
		});
		expect(events[0]?.payload).toMatchObject({ affected: awaiting });

		const second = await runJob(job("expire-quotes"), context());
		expect(second).toMatchObject({ ok: true, affected: 0 });
		expect(await jobEvents("expire-quotes")).toHaveLength(1);
	});
});

describe("cleanup-uploads", () => {
	async function upload(
		fileKey: string,
		status: "PENDING" | "COMPLETED",
		createdAt: Date,
	) {
		await harness.db.upload.create({
			data: {
				fileKey,
				purpose: "UNIT_PHOTO",
				contentType: "image/jpeg",
				sizeBytes: 3,
				status,
				uploadedById: "user-equipamentos",
				createdAt,
				completedAt: status === "COMPLETED" ? createdAt : null,
			},
		});
		harness.storage().put(fileKey, new Uint8Array([1, 2, 3]), "image/jpeg");
	}

	it("apaga do bucket e do banco só os pendentes com mais de 24 h", async () => {
		await upload("unit_photo/2026/10/velho.jpg", "PENDING", ago(25 * HOUR));
		await upload("unit_photo/2026/11/novo.jpg", "PENDING", ago(HOUR));
		await upload("unit_photo/2026/10/pronto.jpg", "COMPLETED", ago(48 * HOUR));

		const outcome = await runJob(job("cleanup-uploads"), context());
		expect(outcome).toMatchObject({ ok: true, affected: 1 });

		const storage = harness.storage();
		expect(storage.has("unit_photo/2026/10/velho.jpg")).toBe(false);
		expect(storage.has("unit_photo/2026/11/novo.jpg")).toBe(true);
		expect(storage.has("unit_photo/2026/10/pronto.jpg")).toBe(true);
		const remaining = await harness.db.upload.findMany({
			where: { fileKey: { startsWith: "unit_photo/" } },
			select: { fileKey: true },
		});
		expect(remaining.map((row) => row.fileKey).sort()).toEqual([
			"unit_photo/2026/10/pronto.jpg",
			"unit_photo/2026/11/novo.jpg",
		]);

		const again = await runJob(job("cleanup-uploads"), context());
		expect(again).toMatchObject({ ok: true, affected: 0 });
		expect(await jobEvents("cleanup-uploads")).toHaveLength(1);
	});
});

describe("purge-customer-documents", () => {
	let sequence = 0;

	async function customerWithDocument(name: string, since: Date) {
		const customer = await harness.db.customer.create({
			data: { kind: "INDIVIDUAL", name, createdAt: since },
		});
		const fileKey = `customer_document/${crypto.randomUUID()}.jpg`;
		await harness.db.customerDocument.create({
			data: {
				customerId: customer.id,
				kind: "PHOTO_ID",
				fileKey,
				receivedAt: since,
			},
		});
		await harness.db.upload.create({
			data: {
				fileKey,
				purpose: "CUSTOMER_DOCUMENT",
				contentType: "image/jpeg",
				sizeBytes: 3,
				status: "COMPLETED",
				uploadedById: "user-atendimento",
				createdAt: since,
				completedAt: since,
			},
		});
		harness.storage().put(fileKey, new Uint8Array([1, 2, 3]), "image/jpeg");
		return { id: customer.id, fileKey };
	}

	async function rentalEndingAt(customerId: string, endsAt: Date) {
		sequence += 1;
		await harness.db.rental.create({
			data: {
				code: `LOC-9${String(sequence).padStart(3, "0")}`,
				customerId,
				status: "CLOSED",
				deliveryMode: "PICKUP",
				startsAt: new Date(endsAt.getTime() - 2 * DAY),
				endsAt,
				closedAt: endsAt,
				createdAt: new Date(endsAt.getTime() - 3 * DAY),
			},
		});
	}

	it("apaga os documentos de quem está sem locação além do prazo, sem dados pessoais no evento", async () => {
		const inactive = await customerWithDocument(
			"Cliente Antigo",
			ago(30 * MONTH),
		);
		const active = await customerWithDocument(
			"Cliente Recente",
			ago(30 * MONTH),
		);
		await rentalEndingAt(active.id, ago(6 * MONTH));
		const otherDocuments = await harness.db.customerDocument.count();

		const outcome = await runJob(job("purge-customer-documents"), context());
		expect(outcome).toMatchObject({ ok: true, affected: 1 });

		expect(
			await harness.db.customerDocument.count({
				where: { customerId: inactive.id },
			}),
		).toBe(0);
		expect(
			await harness.db.upload.findUnique({
				where: { fileKey: inactive.fileKey },
			}),
		).toBeNull();
		expect(harness.storage().has(inactive.fileKey)).toBe(false);
		expect(harness.storage().has(active.fileKey)).toBe(true);
		expect(await harness.db.customerDocument.count()).toBe(otherDocuments - 1);

		const purged = await harness.db.event.findFirstOrThrow({
			where: { action: "customer.documentsPurged", entityId: inactive.id },
		});
		expect(purged).toMatchObject({ actorId: null, actorName: "Sistema" });
		const payload = JSON.stringify(purged.payload);
		expect(payload).toContain("PHOTO_ID");
		expect(payload).not.toContain("Cliente Antigo");
		expect(payload).not.toContain(inactive.fileKey);
		expect(
			(await jobEvents("purge-customer-documents"))[0]?.payload,
		).toMatchObject({ affected: 1, customers: 1, retentionMonths: 24 });

		const again = await runJob(job("purge-customer-documents"), context());
		expect(again).toMatchObject({ ok: true, affected: 0 });
	});

	it("usa o prazo das configurações", async () => {
		const customer = await customerWithDocument("Cliente", ago(30 * MONTH));
		await rentalEndingAt(customer.id, ago(6 * MONTH));
		await harness.db.settings.update({
			where: { id: 1 },
			data: { documentRetentionMonths: 3 },
		});

		const outcome = await runJob(job("purge-customer-documents"), context());
		expect(outcome).toMatchObject({ ok: true, affected: 1 });
		expect(harness.storage().has(customer.fileKey)).toBe(false);
	});
});

describe("backup-database", () => {
	it("registra todo backup no histórico do sistema", async () => {
		const sent: string[] = [];
		const outcome = await runJob(
			job("backup-database"),
			context({
				target: {
					async putFile(key) {
						sent.push(key);
						return { sizeBytes: 5, parts: 1 };
					},
				},
			}),
		);
		expect(outcome).toMatchObject({ ok: true, affected: 1 });
		expect(sent).toEqual(["postgres/2026/11/02/marinho-20261102T130000Z.dump"]);
		const [event] = await jobEvents("backup-database");
		expect(event?.payload).toMatchObject({
			key: "postgres/2026/11/02/marinho-20261102T130000Z.dump",
			sizeBytes: 5,
			parts: 1,
		});
	});

	it("falha sem gravar evento e avisa quem reporta erros", async () => {
		const reported: string[] = [];
		const outcome = await runJob(
			job("backup-database"),
			context({
				dump: async () => {
					throw new Error("pg_dump saiu com código 1");
				},
			}),
			(_, failed) => reported.push(failed.name),
		);
		expect(outcome.ok).toBe(false);
		expect(reported).toEqual(["backup-database"]);
		expect(await jobEvents("backup-database")).toHaveLength(0);
	});
});
