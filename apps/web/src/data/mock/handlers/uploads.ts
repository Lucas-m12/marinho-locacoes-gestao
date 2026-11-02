import { addHours, canReadFile, isUploadAllowed } from "@marinho-gestao/domain";
import { fileRefOf, notFound, precondition } from "@marinho-gestao/read-model";
import { isSeedFile } from "@marinho-gestao/read-model/seed";
import { ORPCError } from "@orpc/server";
import { api, requireUser } from "../base";
import { mockNow } from "../clock";
import { getDb, nextId } from "../db";
import { getBlob } from "../file-store";
import { filePurpose } from "../files";

const UPLOAD_URL_MINUTES = 10;
const DOWNLOAD_URL_MINUTES = 10;

function placeholderDocument(fileKey: string): string {
	const label = fileKey.replace("seed/", "").replace(/[^a-zA-Z0-9-]/g, " ");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#F2E8D7"/><text x="240" y="150" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#13294B">Arquivo de exemplo</text><text x="240" y="182" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#5E544C">${label}</text></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function minutesFromNow(minutes: number): string {
	return addHours(mockNow(), minutes / 60).toISOString();
}

export const uploads = {
	requestUpload: api.uploads.requestUpload.handler(({ context, input }) => {
		const user = requireUser(context);
		if (!isUploadAllowed(input)) {
			throw precondition("UPLOAD_INVALID", [input.contentType]);
		}
		const db = getDb();
		const fileKey = `${input.purpose.toLowerCase()}/${nextId(db, "file")}-${input.fileName.replace(/[^a-zA-Z0-9.]+/g, "-")}`;
		db.pendingUploads[fileKey] = {
			purpose: input.purpose,
			userId: user.id,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
		};
		return {
			fileKey,
			uploadUrl: `mock-upload://${fileKey}`,
			method: "PUT" as const,
			headers: { "Content-Type": input.contentType },
			expiresAt: minutesFromNow(UPLOAD_URL_MINUTES),
		};
	}),

	completeUpload: api.uploads.completeUpload.handler(
		async ({ context, input }) => {
			const user = requireUser(context);
			const db = getDb();
			const pending = db.pendingUploads[input.fileKey];
			if (!pending || pending.userId !== user.id) {
				throw notFound("upload", input.fileKey);
			}
			if (!(await getBlob(input.fileKey))) {
				throw precondition("UPLOAD_MISSING", [input.fileKey]);
			}
			const file = {
				fileKey: input.fileKey,
				contentType: pending.contentType,
				sizeBytes: pending.sizeBytes,
				uploadedAt: mockNow().toISOString(),
			};
			db.files[input.fileKey] = file;
			db.fileOwners[input.fileKey] = {
				purpose: pending.purpose,
				userId: pending.userId,
			};
			delete db.pendingUploads[input.fileKey];
			return file;
		},
	),
};

export const files = {
	getDownloadUrl: api.files.getDownloadUrl.handler(
		async ({ context, input }) => {
			const user = requireUser(context);
			const db = getDb();
			const purpose = filePurpose(db, input.fileKey);
			if (!purpose) throw notFound("file", input.fileKey);
			if (!canReadFile(user.role, purpose)) {
				throw new ORPCError("FORBIDDEN");
			}
			const expiresAt = minutesFromNow(DOWNLOAD_URL_MINUTES);
			if (isSeedFile(input.fileKey)) {
				return { url: placeholderDocument(input.fileKey), expiresAt };
			}
			fileRefOf(db, input.fileKey);
			const blob = await getBlob(input.fileKey);
			if (!blob) throw notFound("file", input.fileKey);
			return { url: URL.createObjectURL(blob), expiresAt };
		},
	),
};
