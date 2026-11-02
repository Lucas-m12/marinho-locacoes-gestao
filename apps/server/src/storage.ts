import { R2Storage } from "@marinho-gestao/api";
import type { CoercedEnvSchema } from "./env";

type StorageEnv = Pick<
	CoercedEnvSchema,
	| "R2_ACCOUNT_ID"
	| "R2_ACCESS_KEY_ID"
	| "R2_SECRET_ACCESS_KEY"
	| "R2_BUCKET"
	| "R2_BACKUP_BUCKET"
	| "R2_BACKUP_ACCESS_KEY_ID"
	| "R2_BACKUP_SECRET_ACCESS_KEY"
>;

export function uploadsStorage(env: StorageEnv): R2Storage {
	return new R2Storage({
		accountId: env.R2_ACCOUNT_ID,
		accessKeyId: env.R2_ACCESS_KEY_ID,
		secretAccessKey: env.R2_SECRET_ACCESS_KEY,
		bucket: env.R2_BUCKET,
	});
}

export function backupStorage(env: StorageEnv): R2Storage {
	const {
		R2_BACKUP_BUCKET,
		R2_BACKUP_ACCESS_KEY_ID,
		R2_BACKUP_SECRET_ACCESS_KEY,
	} = env;
	if (
		!R2_BACKUP_BUCKET ||
		!R2_BACKUP_ACCESS_KEY_ID ||
		!R2_BACKUP_SECRET_ACCESS_KEY
	) {
		throw new Error(
			"Defina R2_BACKUP_BUCKET, R2_BACKUP_ACCESS_KEY_ID e R2_BACKUP_SECRET_ACCESS_KEY para o backup.",
		);
	}
	return new R2Storage({
		accountId: env.R2_ACCOUNT_ID,
		accessKeyId: R2_BACKUP_ACCESS_KEY_ID,
		secretAccessKey: R2_BACKUP_SECRET_ACCESS_KEY,
		bucket: R2_BACKUP_BUCKET,
	});
}
