import type { SessionUser } from "@marinho-gestao/contract";
import type { Database, Prisma, Transaction } from "@marinho-gestao/db";
import { inTransaction } from "./deps";

export async function once<T extends Prisma.InputJsonValue>(
	db: Database,
	actor: SessionUser,
	procedure: string,
	key: string,
	run: (tx: Transaction) => Promise<T>,
): Promise<T> {
	return inTransaction(db, async (tx) => {
		const [claimed] = await tx.$queryRaw<{ id: string }[]>`
			insert into idempotency_key (key, user_id, procedure)
			values (${key}, ${actor.id}, ${procedure})
			on conflict (user_id, procedure, key) do nothing
			returning id
		`;
		if (!claimed) {
			const stored = await tx.idempotencyKey.findUniqueOrThrow({
				where: {
					userId_procedure_key: { userId: actor.id, procedure, key },
				},
			});
			return stored.response as T;
		}
		const response = await run(tx);
		await tx.idempotencyKey.update({
			where: { id: claimed.id },
			data: { response },
		});
		return response;
	});
}
