import type { UploadPurpose } from "@marinho-gestao/domain";
import { precondition } from "@marinho-gestao/read-model";
import { isSeedFile } from "@marinho-gestao/read-model/seed";
import type { MockDb } from "./db";

export function requireUsableFile(
	db: MockDb,
	userId: string,
	fileKey: string,
	purposes: readonly UploadPurpose[],
): void {
	const owner = db.fileOwners[fileKey];
	const usable =
		owner !== undefined &&
		owner.userId === userId &&
		purposes.includes(owner.purpose);
	if (!usable) throw precondition("UPLOAD_MISSING", [fileKey]);
}

export function filePurpose(db: MockDb, fileKey: string): UploadPurpose | null {
	if (isSeedFile(fileKey)) return "CUSTOMER_DOCUMENT";
	return db.fileOwners[fileKey]?.purpose ?? null;
}
