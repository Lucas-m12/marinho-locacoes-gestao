import type { SessionUser } from "@marinho-gestao/contract";
import type { Database, Transaction } from "@marinho-gestao/db";
import type { ObjectStorage } from "../storage/object-storage";

export type ServiceDeps = {
	db: Database;
	storage: ObjectStorage;
	clock: () => Date;
	actor: SessionUser;
};

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 20_000 };

export function inTransaction<T>(
	db: Database,
	run: (tx: Transaction) => Promise<T>,
): Promise<T> {
	return db.$transaction(run, TRANSACTION_OPTIONS);
}
