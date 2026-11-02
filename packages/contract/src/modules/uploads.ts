import { z } from "zod";
import { base } from "../base";
import { FileKey, FileRef, IsoDateTime, UploadPurpose } from "../common";

export const RequestUploadInput = z.object({
	purpose: UploadPurpose,
	fileName: z.string().min(1),
	contentType: z.string().min(1),
	sizeBytes: z.number().int().positive(),
});
export type RequestUploadInput = z.infer<typeof RequestUploadInput>;

export const RequestUploadOutput = z.object({
	fileKey: FileKey,
	uploadUrl: z.string(),
	method: z.literal("PUT"),
	headers: z.record(z.string(), z.string()),
	expiresAt: IsoDateTime,
});
export type RequestUploadOutput = z.infer<typeof RequestUploadOutput>;

export const DownloadUrl = z.object({
	url: z.string(),
	expiresAt: IsoDateTime,
});
export type DownloadUrl = z.infer<typeof DownloadUrl>;

export const uploads = {
	requestUpload: base.input(RequestUploadInput).output(RequestUploadOutput),
	completeUpload: base.input(z.object({ fileKey: FileKey })).output(FileRef),
};

export const files = {
	getDownloadUrl: base
		.input(z.object({ fileKey: FileKey }))
		.output(DownloadUrl),
};
