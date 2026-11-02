import type {
	LedgerEntry,
	Receivable,
	SessionUser,
} from "@marinho-gestao/contract";
import {
	depositHeldCents,
	isRentalOverdue,
	LEDGER_IN_CATEGORIES,
	LEDGER_OUT_CATEGORIES,
	type LedgerCategory,
	ledgerCsv,
	ledgerTotals,
	oppositeDirection,
	reversalBlock,
	signedAmountCents,
	suggestLateFee,
	sumCents,
	toMs,
} from "@marinho-gestao/domain";
import { money } from "@/lib/format";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import {
	getDb,
	type LedgerRecord,
	type MockDb,
	type RentalRecord,
} from "../db";
import { notFound, precondition } from "../errors";
import { addEvent, once, postLedger, requireHeldDeposit } from "../flows";
import { requireRental, requireUnit } from "../queries";
import { itemPrice, rentalBalance, rentalChargesCents } from "../rental-money";
import { requireCustomer } from "../views";

function entryView(db: MockDb, record: LedgerRecord): LedgerEntry {
	const {
		maintenanceNumber: _order,
		paymentId: _payment,
		pairId: _pair,
		...entry
	} = record;
	return {
		...entry,
		reversalOfDescription:
			db.ledger.find((other) => other.id === record.reversalOfId)
				?.description ?? null,
		reversedById:
			db.ledger.find((other) => other.reversalOfId === record.id)?.id ?? null,
	};
}

function requireEntry(db: MockDb, id: string): LedgerRecord {
	const entry = db.ledger.find((other) => other.id === id);
	if (!entry) throw notFound("ledgerEntry", id);
	return entry;
}

function assertReversible(db: MockDb, entry: LedgerRecord): void {
	const block = reversalBlock(entry, db.ledger);
	if (block) throw precondition(block);
}

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
		description: `Estorno de ${original.description}: ${reason}`,
		rentalNumber: original.rentalNumber,
		unitCode: original.unitCode,
		receiptFileKey: null,
		recordedBy: user.name,
		maintenanceNumber: original.maintenanceNumber,
		reversalOfId: original.id,
		reversalReason: reason,
	});
}

function inRange(entry: LedgerRecord, from: string, to: string): boolean {
	const at = toMs(entry.occurredAt);
	return at >= toMs(from) && at <= toMs(to);
}

function totalsByCategory(
	entries: LedgerRecord[],
	categories: readonly LedgerCategory[],
) {
	return categories
		.map((category) => ({
			category,
			amountCents: sumCents(
				entries
					.filter((entry) => entry.category === category)
					.map(signedAmountCents),
			),
		}))
		.filter((row) => row.amountCents > 0)
		.sort((a, b) => b.amountCents - a.amountCents);
}

export function cashTotals(db: MockDb, from: string, to: string) {
	const entries = db.ledger.filter(
		(entry) => entry.account === "CASH" && inRange(entry, from, to),
	);
	return ledgerTotals(entries);
}

export function depositsHeld(db: MockDb) {
	const holding = db.rentals.filter(
		(rental) => depositHeldCents(rental.deposit) > 0,
	);
	return {
		heldCents: sumCents(
			holding.map((rental) => depositHeldCents(rental.deposit)),
		),
		heldRentalCount: holding.length,
	};
}

function receivablesOf(db: MockDb, now: Date): Receivable[] {
	return db.rentals.flatMap((rental) => {
		if (
			["QUOTE", "AWAITING_DEPOSIT", "CANCELED", "EXPIRED"].includes(
				rental.status,
			)
		) {
			return [];
		}
		const customer = requireCustomer(db, rental.customerId);
		const base = {
			rentalNumber: rental.number,
			customerId: customer.id,
			customerName: customer.name,
			delivered: rental.deliveredAt !== null,
		};
		const rows: Receivable[] = [];
		const balance = rentalBalance(db, rental);
		const charges = Math.min(
			balance,
			Math.max(0, rentalChargesCents(rental) - rental.deposit.retainedCents),
		);
		if (balance - charges > 0) {
			rows.push({
				...base,
				kind: "BALANCE",
				amountCents: balance - charges,
				provisional: false,
			});
		}
		if (charges > 0) {
			rows.push({
				...base,
				kind: "CHARGE",
				amountCents: charges,
				provisional: false,
			});
		}
		if (isRentalOverdue(rental, now)) {
			const dailyTotalCents = sumCents(
				rental.items.map(
					(item) =>
						(itemPrice(db, rental, item).dailyPriceCents ?? 0) * item.quantity,
				),
			);
			rows.push({
				...base,
				kind: "LATE",
				amountCents: suggestLateFee({
					dueAt: rental.endAt,
					returnedAt: now,
					dailyTotalCents,
				}).amountCents,
				provisional: true,
			});
		}
		return rows;
	});
}

export const ledger = {
	list: api.ledger.list.handler(({ context, input }) => {
		requirePermission(context, "money:read");
		const db = getDb();
		const entries = db.ledger
			.filter(
				(entry) =>
					entry.account === input.account &&
					inRange(entry, input.from, input.to),
			)
			.sort((a, b) => toMs(b.occurredAt) - toMs(a.occurredAt));
		return {
			entries: entries.map((entry) => entryView(db, entry)),
			...ledgerTotals(entries),
		};
	}),

	create: api.ledger.create.handler(({ context, input }) => {
		const user = requirePermission(context, "money:write");
		const db = getDb();
		if (input.rentalNumber) requireRental(db, input.rentalNumber);
		if (input.unitCode) requireUnit(db, input.unitCode);
		const { idempotencyKey, ...entry } = input;
		return once(db, user, "ledger.create", idempotencyKey, () =>
			entryView(
				db,
				postLedger(db, {
					...entry,
					account: "CASH",
					recordedBy: user.name,
					maintenanceNumber: null,
				}),
			),
		);
	}),

	reverse: api.ledger.reverse.handler(({ context, input }) => {
		const user = requirePermission(context, "money:write");
		const db = getDb();
		return once(db, user, "ledger.reverse", input.idempotencyKey, () => {
			const at = mockNow().toISOString();
			const original = requireEntry(db, input.entryId);
			const partners = original.pairId
				? db.ledger.filter(
						(entry) =>
							entry.pairId === original.pairId && entry.id !== original.id,
					)
				: [];
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
					`Estorno de ${money(original.amountCents)}: ${input.reason}`,
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
		return ledgerCsv({
			month: input.month,
			entries: getDb().ledger.filter((entry) => entry.account === "CASH"),
		});
	}),

	byCategory: api.ledger.byCategory.handler(({ context, input }) => {
		requirePermission(context, "money:read");
		const entries = getDb().ledger.filter(
			(entry) =>
				entry.account === "CASH" && inRange(entry, input.from, input.to),
		);
		return {
			in: totalsByCategory(entries, LEDGER_IN_CATEGORIES),
			out: totalsByCategory(entries, LEDGER_OUT_CATEGORIES),
		};
	}),

	receivables: api.ledger.receivables.handler(({ context }) => {
		requirePermission(context, "money:read");
		const items = receivablesOf(getDb(), mockNow());
		return {
			items,
			totalCents: sumCents(
				items
					.filter((item) => !item.provisional)
					.map((item) => item.amountCents),
			),
		};
	}),

	depositSummary: api.ledger.depositSummary.handler(({ context, input }) => {
		requirePermission(context, "money:read");
		const db = getDb();
		const entries = db.ledger.filter(
			(entry) =>
				entry.account === "DEPOSIT" && inRange(entry, input.from, input.to),
		);
		const sum = (category: LedgerCategory) =>
			sumCents(
				entries
					.filter((entry) => entry.category === category)
					.map(signedAmountCents),
			);
		return {
			...depositsHeld(db),
			receivedCents: sum("DEPOSIT_RECEIVED"),
			refundedCents: sum("DEPOSIT_REFUNDED"),
			retainedCents: sum("DEPOSIT_TO_CASH"),
		};
	}),
};
