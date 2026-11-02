import type { FileRef } from "@marinho-gestao/contract";
import type { UploadPurpose } from "@marinho-gestao/domain";

export type UploadOptions = {
	purpose: UploadPurpose;
	onProgress?: (fraction: number) => void;
	signal?: AbortSignal;
};

export interface UploadService {
	upload(file: File, options: UploadOptions): Promise<FileRef>;
	getUrl(fileKey: string): Promise<string>;
}

export class UploadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UploadError";
	}
}
