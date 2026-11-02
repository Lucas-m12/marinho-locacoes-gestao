import type { DbClient } from "@marinho-gestao/db";
import { RENTAL_EVENTS } from "@marinho-gestao/read-model";
import { recordEvent } from "./events";

export async function expireStaleQuotes(
	db: DbClient,
	now: Date,
): Promise<string[]> {
	const expired = await db.$queryRaw<{ id: string }[]>`
		update rental set status = 'EXPIRED', updated_at = ${now}
		where status = 'AWAITING_DEPOSIT'
			and deposit_deadline_at < ${now}
			and not exists (
				select 1 from ledger_entry signal
				where signal.rental_id = rental.id
					and signal.payment_kind = 'SIGNAL'
					and signal.reversal_of_id is null
					and not exists (
						select 1 from ledger_entry reversal
						where reversal.reversal_of_id = signal.id
					)
			)
		returning id
	`;
	if (expired.length === 0) return [];
	const ids = expired.map((row) => row.id);
	await db.rentalItem.updateMany({
		where: { rentalId: { in: ids } },
		data: { holdsCalendar: false },
	});
	for (const id of ids) {
		await recordEvent(db, {
			actor: null,
			action: "rental.expired",
			entity: "Rental",
			entityId: id,
			message: RENTAL_EVENTS.quoteExpired,
			at: now,
		});
	}
	return ids;
}
