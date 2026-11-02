import type {
	DownloadUrl,
	FileRef,
	RequestUploadInput,
	RequestUploadOutput,
} from "@marinho-gestao/contract";
import {
	addHours,
	calendarDay,
	canReadFile,
	fileExtension,
	isUploadAllowed,
} from "@marinho-gestao/domain";
import { ORPCError } from "@orpc/server";
import { notFound, precondition } from "../errors";
import { inTransaction, type ServiceDeps } from "./deps";
import { recordEvent } from "./events";

const URL_VALIDITY_SECONDS = 10 * 60;

function expiresAt(now: Date): string {
	return addHours(now, URL_VALIDITY_SECONDS / 3600).toISOString();
}

function sameType(stored: string | null, expected: string): boolean {
	const normalized = (stored ?? "").split(";")[0]?.trim().toLowerCase();
	return normalized === expected.toLowerCase();
}

export function uploadKey(
	purpose: RequestUploadInput["purpose"],
	fileName: string,
	now: Date,
): string {
	const [year, month] = calendarDay(now).split("-");
	return `${purpose.toLowerCase()}/${year}/${month}/${crypto.randomUUID()}.${fileExtension(fileName)}`;
}

export async function requestUpload(
	deps: ServiceDeps,
	input: RequestUploadInput,
): Promise<RequestUploadOutput> {
	if (!isUploadAllowed(input)) {
		throw precondition("UPLOAD_INVALID", [input.contentType]);
	}
	const now = deps.clock();
	const fileKey = uploadKey(input.purpose, input.fileName, now);
	await inTransaction(deps.db, async (tx) => {
		const upload = await tx.upload.create({
			data: {
				fileKey,
				purpose: input.purpose,
				contentType: input.contentType,
				sizeBytes: input.sizeBytes,
				uploadedById: deps.actor.id,
				createdAt: now,
			},
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action: "upload.requested",
			entity: "Upload",
			entityId: upload.id,
			at: now,
			payload: { purpose: input.purpose, sizeBytes: input.sizeBytes },
		});
	});
	return {
		fileKey,
		uploadUrl: await deps.storage.presignPut(
			fileKey,
			input.contentType,
			URL_VALIDITY_SECONDS,
		),
		method: "PUT",
		headers: { "Content-Type": input.contentType },
		expiresAt: expiresAt(now),
	};
}

export async function completeUpload(
	deps: ServiceDeps,
	fileKey: string,
): Promise<FileRef> {
	const upload = await deps.db.upload.findUnique({ where: { fileKey } });
	if (!upload || upload.uploadedById !== deps.actor.id) {
		throw notFound("upload", fileKey);
	}
	if (upload.status === "COMPLETED" && upload.completedAt) {
		return {
			fileKey,
			contentType: upload.contentType,
			sizeBytes: upload.sizeBytes,
			uploadedAt: upload.completedAt.toISOString(),
		};
	}
	const head = await deps.storage.head(fileKey);
	if (!head) throw precondition("UPLOAD_MISSING", [fileKey]);
	if (
		head.sizeBytes !== upload.sizeBytes ||
		!sameType(head.contentType, upload.contentType)
	) {
		await deps.storage.delete(fileKey);
		throw precondition("UPLOAD_INVALID", [fileKey]);
	}
	const now = deps.clock();
	await inTransaction(deps.db, async (tx) => {
		await tx.upload.update({
			where: { id: upload.id },
			data: { status: "COMPLETED", completedAt: now },
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action: "upload.completed",
			entity: "Upload",
			entityId: upload.id,
			at: now,
		});
	});
	return {
		fileKey,
		contentType: upload.contentType,
		sizeBytes: upload.sizeBytes,
		uploadedAt: now.toISOString(),
	};
}

export async function getDownloadUrl(
	deps: ServiceDeps,
	fileKey: string,
): Promise<DownloadUrl> {
	const upload = await deps.db.upload.findUnique({ where: { fileKey } });
	if (!upload || upload.status !== "COMPLETED") throw notFound("file", fileKey);
	if (!canReadFile(deps.actor.role, upload.purpose)) {
		throw new ORPCError("FORBIDDEN");
	}
	const now = deps.clock();
	return {
		url: await deps.storage.presignGet(fileKey, URL_VALIDITY_SECONDS),
		expiresAt: expiresAt(now),
	};
}
