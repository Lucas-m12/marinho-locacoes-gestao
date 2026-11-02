import type { SessionUser } from "@marinho-gestao/contract";
import { oppositeDirection } from "@marinho-gestao/domain";
import {
	assertReversible,
	dashboardSummary,
	depositSummary,
	entryView,
	exportCashCsv,
	LEDGER_DESCRIPTIONS,
	ledgerByCategory,
	listLedger,
	pairedEntries,
	RENTAL_EVENTS,
	receivables,
	requireEntry,
	requireRental,
	requireUnit,
} from "@marinho-gestao/read-model";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import {
	getDb,
	type LedgerRecord,
	type MockDb,
	type RentalRecord,
} from "../db";
import { requireUsableFile } from "../files";
import { addEvent, once, postLedger, requireHeldDeposit } from "../flows";

export { dashboardSummary };

function undoDeposit(rental: RentalRecord, entry: LedgerRecord): void {
	const { deposit } = rental;
	if (entry.category === "DEPOSIT_RECEIVED") {
		requireHeldDeposit(rental, entry.amountCents);
		deposit.receivedCents -= entry.amountCents;
		if (deposit.receivedCents === 0) {
			deposit.receivedAt = null;
			deposit.receivedMethod = null;
		}
	}
	if (entry.category === "DEPOSIT_REFUNDED") {
		deposit.refundedCents -= entry.amountCents;
		if (deposit.refundedCents === 0) {
			deposit.refundedAt = null;
			deposit.refundedMethod = null;
		}
	}
	if (
		entry.category === "DEPOSIT_TO_CASH" ||
		entry.category === "DEPOSIT_RETAINED"
	) {
		deposit.retainedCents -= entry.amountCents;
		if (deposit.retainedCents === 0) {
			deposit.retentionReason = null;
			deposit.retainedAt = null;
		}
	}
}

function postReversal(
	db: MockDb,
	original: LedgerRecord,
	user: SessionUser,
	reason: string,
	at: string,
): LedgerRecord {
	return postLedger(db, {
		account: original.account,
		direction: oppositeDirection(original.direction),
		category: original.category,
		amountCents: original.amountCents,
		occurredAt: at,
		method: original.method,
		description: LEDGER_DESCRIPTIONS.reversal(original.description, reason),
		rentalNumber: original.rentalNumber,
		unitCode: original.unitCode,
		receiptFileKey: null,
		recordedBy: user.name,
		maintenanceNumber: original.maintenanceNumber,
		reversalOfId: original.id,
		reversalReason: reason,
	});
}

export const ledger = {
	list: api.ledger.list.handler(({ context, input }) => {
		requirePermission(context, "money:read");
		return listLedger(getDb(), input);
	}),

	create: api.ledger.create.handler(({ context, input }) => {
		const user = requirePermission(context, "money:write");
		const db = getDb();
		if (input.rentalNumber) requireRental(db, input.rentalNumber);
		if (input.unitCode) requireUnit(db, input.unitCode);
		const { idempotencyKey, ...entry } = input;
		return once(db, user, "ledger.create", idempotencyKey, () => {
			if (entry.receiptFileKey) {
				requireUsableFile(db, user.id, entry.receiptFileKey, ["RECEIPT"]);
			}
			return entryView(
				db,
				postLedger(db, {
					...entry,
					account: "CASH",
					recordedBy: user.name,
					maintenanceNumber: null,
				}),
			);
		});
	}),

	reverse: api.ledger.reverse.handler(({ context, input }) => {
		const user = requirePermission(context, "money:write");
		const db = getDb();
		return once(db, user, "ledger.reverse", input.idempotencyKey, () => {
			const at = mockNow().toISOString();
			const original = requireEntry(db, input.entryId);
			const partners = pairedEntries(db, original);
			for (const entry of [original, ...partners]) assertReversible(db, entry);

			const rental = db.rentals.find(
				(entry) => entry.number === original.rentalNumber,
			);
			if (rental) {
				undoDeposit(rental, original);
				const payment = rental.payments.find(
					(entry) => entry.id === original.paymentId,
				);
				if (payment) payment.reversedAt = at;
				addEvent(
					db,
					rental,
					user,
					RENTAL_EVENTS.reversed(original.amountCents, input.reason),
					at,
				);
			}

			const reversal = postReversal(db, original, user, input.reason, at);
			for (const entry of partners) {
				postReversal(db, entry, user, input.reason, at);
			}
			return entryView(db, reversal);
		});
	}),

	exportCsv: api.ledger.exportCsv.handler(({ context, input }) => {
		requirePermission(context, "money:read");
		return exportCashCsv(getDb(), input.month);
	}),

	byCategory: api.ledger.byCategory.handler(({ context, input }) => {
		requirePermission(context, "money:read");
		return ledgerByCategory(getDb(), input);
	}),

	receivables: api.ledger.receivables.handler(({ context }) => {
		requirePermission(context, "money:read");
		return receivables(getDb(), mockNow());
	}),

	depositSummary: api.ledger.depositSummary.handler(({ context, input }) => {
		requirePermission(context, "money:read");
		return depositSummary(getDb(), input);
	}),
};
