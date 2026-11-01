import { client } from "@/data/client";
import { prepareFile } from "./prepare";
import { putWithProgress } from "./transfer";
import type { UploadOptions, UploadService } from "./types";

export { UploadError } from "./types";

const MOCK_SCHEME = "mock-upload://";
const SAFETY_MARGIN_MS = 30_000;

async function storeInMock(
	url: string,
	file: File,
	onProgress?: (fraction: number) => void,
): Promise<void> {
	if (import.meta.env.VITE_DATA_SOURCE !== "http") {
		const { putBlob } = await import("@/data/mock/file-store");
		onProgress?.(0.5);
		await putBlob(url.slice(MOCK_SCHEME.length), file);
		onProgress?.(1);
	}
}

const urlCache = new Map<string, { url: string; expiresAt: number }>();

export const uploadService: UploadService = {
	async upload(file: File, options: UploadOptions) {
		const prepared = await prepareFile(file, options.purpose);
		const ticket = await client.uploads.requestUpload({
			purpose: options.purpose,
			fileName: prepared.name,
			contentType: prepared.type,
			sizeBytes: prepared.size,
		});

		if (ticket.uploadUrl.startsWith(MOCK_SCHEME)) {
			await storeInMock(ticket.uploadUrl, prepared, options.onProgress);
		} else {
			await putWithProgress({
				url: ticket.uploadUrl,
				file: prepared,
				headers: ticket.headers,
				onProgress: options.onProgress,
				signal: options.signal,
			});
		}

		return client.uploads.completeUpload({ fileKey: ticket.fileKey });
	},

	async getUrl(fileKey: string) {
		const cached = urlCache.get(fileKey);
		if (cached && cached.expiresAt - SAFETY_MARGIN_MS > Date.now()) {
			return cached.url;
		}
		const { url, expiresAt } = await client.files.getDownloadUrl({ fileKey });
		urlCache.set(fileKey, { url, expiresAt: Date.parse(expiresAt) });
		return url;
	},
};
