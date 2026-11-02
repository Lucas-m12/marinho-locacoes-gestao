import { addHours } from "@marinho-gestao/domain";
import { api, requireUser } from "../base";
import { mockNow } from "../clock";
import { getDb, nextId } from "../db";
import { notFound, precondition } from "../errors";
import { getBlob } from "../file-store";
import { fileRefOf } from "../queries";
import { isSeedFile } from "../seed";

const UPLOAD_URL_HOURS = 1;
const DOWNLOAD_URL_MINUTES = 15;

function placeholderDocument(fileKey: string): string {
	const label = fileKey.replace("seed/", "").replace(/[^a-zA-Z0-9-]/g, " ");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#F2E8D7"/><text x="240" y="150" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#13294B">Arquivo de exemplo</text><text x="240" y="182" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#5E544C">${label}</text></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const uploads = {
	requestUpload: api.uploads.requestUpload.handler(({ context, input }) => {
		requireUser(context);
		const db = getDb();
		const fileKey = `${input.purpose.toLowerCase()}/${nextId(db, "file")}-${input.fileName.replace(/[^a-zA-Z0-9.]+/g, "-")}`;
		db.pendingUploads[fileKey] = {
			purpose: input.purpose,
			contentType: input.contentType,
			sizeBytes: input.sizeBytes,
		};
		return {
			fileKey,
			uploadUrl: `mock-upload://${fileKey}`,
			method: "PUT" as const,
			headers: { "Content-Type": input.contentType },
			expiresAt: addHours(mockNow(), UPLOAD_URL_HOURS).toISOString(),
		};
	}),

	completeUpload: api.uploads.completeUpload.handler(
		async ({ context, input }) => {
			requireUser(context);
			const db = getDb();
			const pending = db.pendingUploads[input.fileKey];
			if (!pending) throw notFound("upload", input.fileKey);
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
			delete db.pendingUploads[input.fileKey];
			return file;
		},
	),
};

export const files = {
	getDownloadUrl: api.files.getDownloadUrl.handler(
		async ({ context, input }) => {
			requireUser(context);
			const expiresAt = addHours(
				mockNow(),
				DOWNLOAD_URL_MINUTES / 60,
			).toISOString();
			if (isSeedFile(input.fileKey)) {
				return { url: placeholderDocument(input.fileKey), expiresAt };
			}
			const db = getDb();
			fileRefOf(db, input.fileKey);
			const blob = await getBlob(input.fileKey);
			if (!blob) throw notFound("file", input.fileKey);
			return { url: URL.createObjectURL(blob), expiresAt };
		},
	),
};
