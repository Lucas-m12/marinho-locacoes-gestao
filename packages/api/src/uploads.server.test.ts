import { SCENARIO_NOW } from "@marinho-gestao/scenarios";
import { ORPCError } from "@orpc/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createServerHarness } from "./testing/harness";

const harness = createServerHarness();

async function errorOf(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ORPCError) return error;
		throw error;
	}
	throw new Error("deveria ter falhado");
}

const photo = {
	purpose: "UNIT_PHOTO" as const,
	fileName: "frente.jpg",
	contentType: "image/jpeg",
	sizeBytes: 4,
};

beforeEach(() => harness.reset(SCENARIO_NOW));

describe("uploads", () => {
	it("gera a chave por finalidade e mês e a URL de PUT por 10 minutos", async () => {
		const ticket = await harness
			.clientAs("EQUIPMENT")
			.uploads.requestUpload(photo);
		expect(ticket.fileKey).toMatch(
			/^unit_photo\/2026\/11\/[0-9a-f-]{36}\.jpg$/,
		);
		expect(ticket.method).toBe("PUT");
		expect(ticket.headers).toEqual({ "Content-Type": "image/jpeg" });
		expect(Date.parse(ticket.expiresAt) - SCENARIO_NOW.getTime()).toBe(600_000);
		expect(ticket.uploadUrl).toContain("expires=600");
	});

	it("confere o objeto e marca como concluído", async () => {
		const client = harness.clientAs("EQUIPMENT");
		const ticket = await client.uploads.requestUpload(photo);
		harness
			.storage()
			.put(ticket.fileKey, new Uint8Array([1, 2, 3, 4]), "image/jpeg");
		const file = await client.uploads.completeUpload({
			fileKey: ticket.fileKey,
		});
		expect(file).toMatchObject({
			fileKey: ticket.fileKey,
			contentType: "image/jpeg",
			sizeBytes: 4,
		});
		const unit = await client.equipment.addUnitPhoto({
			code: "MAR-003",
			slot: "MAIN",
			fileKey: ticket.fileKey,
		});
		expect(unit.file.sizeBytes).toBe(4);
		const url = await client.files.getDownloadUrl({ fileKey: ticket.fileKey });
		expect(url.url).toContain(ticket.fileKey);
	});

	it("recusa tamanho diferente do pedido e apaga o objeto", async () => {
		const client = harness.clientAs("EQUIPMENT");
		const ticket = await client.uploads.requestUpload(photo);
		harness
			.storage()
			.put(ticket.fileKey, new Uint8Array([1, 2, 3, 4, 5, 6]), "image/jpeg");
		const error = await errorOf(
			client.uploads.completeUpload({ fileKey: ticket.fileKey }),
		);
		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.data).toMatchObject({ reason: "UPLOAD_INVALID" });
		expect(harness.storage().has(ticket.fileKey)).toBe(false);
	});

	it("recusa tipo diferente do pedido", async () => {
		const client = harness.clientAs("EQUIPMENT");
		const ticket = await client.uploads.requestUpload(photo);
		harness
			.storage()
			.put(ticket.fileKey, new Uint8Array([1, 2, 3, 4]), "image/png");
		const error = await errorOf(
			client.uploads.completeUpload({ fileKey: ticket.fileKey }),
		);
		expect(error.data).toMatchObject({ reason: "UPLOAD_INVALID" });
	});

	it("avisa quando o objeto não chegou", async () => {
		const client = harness.clientAs("EQUIPMENT");
		const ticket = await client.uploads.requestUpload(photo);
		const error = await errorOf(
			client.uploads.completeUpload({ fileKey: ticket.fileKey }),
		);
		expect(error.data).toMatchObject({ reason: "UPLOAD_MISSING" });
	});

	it("recusa tipo e tamanho fora dos limites", async () => {
		const client = harness.clientAs("EQUIPMENT");
		const video = await errorOf(
			client.uploads.requestUpload({
				...photo,
				contentType: "video/mp4",
				fileName: "teste.mp4",
			}),
		);
		expect(video.data).toMatchObject({ reason: "UPLOAD_INVALID" });
		const huge = await errorOf(
			client.uploads.requestUpload({ ...photo, sizeBytes: 11 * 1024 * 1024 }),
		);
		expect(huge.data).toMatchObject({ reason: "UPLOAD_INVALID" });
	});

	it("só aceita upload concluído, do próprio usuário e com a finalidade certa", async () => {
		const equipment = harness.clientAs("EQUIPMENT");
		const manager = harness.clientAs("MANAGER");
		const pending = await equipment.uploads.requestUpload(photo);
		const notDone = await errorOf(
			equipment.equipment.addUnitPhoto({
				code: "MAR-003",
				slot: "MAIN",
				fileKey: pending.fileKey,
			}),
		);
		expect(notDone.data).toMatchObject({ reason: "UPLOAD_MISSING" });

		harness
			.storage()
			.put(pending.fileKey, new Uint8Array([1, 2, 3, 4]), "image/jpeg");
		await equipment.uploads.completeUpload({ fileKey: pending.fileKey });
		const otherUser = await errorOf(
			manager.equipment.addUnitPhoto({
				code: "MAR-003",
				slot: "MAIN",
				fileKey: pending.fileKey,
			}),
		);
		expect(otherUser.data).toMatchObject({ reason: "UPLOAD_MISSING" });

		const wrongPurpose = await errorOf(
			equipment.equipment.addKnownDamage({
				code: "MAR-003",
				description: "Risco novo",
				fileKey: pending.fileKey,
			}),
		);
		expect(wrongPurpose.data).toMatchObject({ reason: "UPLOAD_MISSING" });

		const notMine = await errorOf(
			manager.uploads.completeUpload({ fileKey: pending.fileKey }),
		);
		expect(notMine.code).toBe("NOT_FOUND");
	});

	it("documento de cliente só para gestão e atendimento", async () => {
		const attendant = harness.clientAs("ATTENDANT");
		const ticket = await attendant.uploads.requestUpload({
			purpose: "CUSTOMER_DOCUMENT",
			fileName: "rg.pdf",
			contentType: "application/pdf",
			sizeBytes: 3,
		});
		harness
			.storage()
			.put(ticket.fileKey, new Uint8Array([1, 2, 3]), "application/pdf");
		await attendant.uploads.completeUpload({ fileKey: ticket.fileKey });
		expect(
			(await attendant.files.getDownloadUrl({ fileKey: ticket.fileKey })).url,
		).toContain(ticket.fileKey);
		const error = await errorOf(
			harness
				.clientAs("EQUIPMENT")
				.files.getDownloadUrl({ fileKey: ticket.fileKey }),
		);
		expect(error.code).toBe("FORBIDDEN");
	});
});
