import type { Role, UploadPurpose } from "./enums";
import type { Permission } from "./permissions";
import { can } from "./permissions";

const MEGABYTE = 1024 * 1024;

export const MAX_IMAGE_BYTES = 10 * MEGABYTE;
export const MAX_DOCUMENT_BYTES = 10 * MEGABYTE;
export const MAX_VIDEO_BYTES = 50 * MEGABYTE;
export const MAX_VIDEO_SECONDS = 30;

const isImage = (type: string) =>
	type.startsWith("image/") && type !== "image/svg+xml";
const isVideo = (type: string) => type.startsWith("video/");
const isDocument = (type: string) =>
	isImage(type) || type === "application/pdf";

const IMAGE_RULE = { accepts: isImage, maxBytes: MAX_IMAGE_BYTES };
const DOCUMENT_RULE = { accepts: isDocument, maxBytes: MAX_DOCUMENT_BYTES };

const UPLOAD_RULES: Record<
	UploadPurpose,
	{ accepts: (contentType: string) => boolean; maxBytes: number }
> = {
	UNIT_PHOTO: IMAGE_RULE,
	DAMAGE_PHOTO: IMAGE_RULE,
	CHECKLIST_PHOTO: IMAGE_RULE,
	CHECKLIST_VIDEO: { accepts: isVideo, maxBytes: MAX_VIDEO_BYTES },
	CUSTOMER_DOCUMENT: DOCUMENT_RULE,
	RECEIPT: DOCUMENT_RULE,
};

export function isUploadAllowed(input: {
	purpose: UploadPurpose;
	contentType: string;
	sizeBytes: number;
}): boolean {
	const rule = UPLOAD_RULES[input.purpose];
	return rule.accepts(input.contentType) && input.sizeBytes <= rule.maxBytes;
}

const FILE_READ_PERMISSION: Partial<Record<UploadPurpose, Permission>> = {
	CUSTOMER_DOCUMENT: "customers:read",
};

export function canReadFile(role: Role, purpose: UploadPurpose): boolean {
	const permission = FILE_READ_PERMISSION[purpose];
	return permission === undefined || can(role, permission);
}

const EXTENSION_PATTERN = /\.([a-zA-Z0-9]{1,8})$/;

export function fileExtension(fileName: string): string {
	return EXTENSION_PATTERN.exec(fileName)?.[1]?.toLowerCase() ?? "bin";
}
