import type { DbClient } from "@marinho-gestao/db";
import type { UploadPurpose } from "@marinho-gestao/domain";
import { precondition } from "../errors";

export async function requireUsableFile(
	db: DbClient,
	actorId: string,
	fileKey: string,
	purposes: readonly UploadPurpose[],
): Promise<void> {
	const upload = await db.upload.findUnique({ where: { fileKey } });
	const usable =
		upload !== null &&
		upload.status === "COMPLETED" &&
		upload.uploadedById === actorId &&
		purposes.includes(upload.purpose);
	if (!usable) throw precondition("UPLOAD_MISSING", [fileKey]);
}
