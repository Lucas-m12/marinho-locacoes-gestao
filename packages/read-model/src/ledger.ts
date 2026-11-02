import type {
	LedgerAccount,
	LedgerEntry,
	Receivable,
} from "@marinho-gestao/contract";
import {
	depositHeldCents,
	isRentalOverdue,
	LEDGER_IN_CATEGORIES,
	LEDGER_OUT_CATEGORIES,
	type LedgerCategory,
	ledgerCsv,
	ledgerTotals,
	reversalBlock,
	signedAmountCents,
	suggestLateFee,
	sumCents,
	toMs,
} from "@marinho-gestao/domain";
import type { z } from "zod";
import { notFound, precondition } from "./errors";
import type { LedgerRecord, Snapshot } from "./records";
import { itemPrice, rentalBalance, rentalChargesCents } from "./rental-money";
import { requireCustomer } from "./views";

type Range = { from: string; to: string };

export function entryView(db: Snapshot, record: LedgerRecord): LedgerEntry {
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

export function requireEntry(db: Snapshot, id: string): LedgerRecord {
	const entry = db.ledger.find((other) => other.id === id);
	if (!entry) throw notFound("ledgerEntry", id);
	return entry;
}

export function assertReversible(db: Snapshot, entry: LedgerRecord): void {
	const block = reversalBlock(entry, db.ledger);
	if (block) throw precondition(block);
}

export function pairedEntries(
	db: Snapshot,
	original: LedgerRecord,
): LedgerRecord[] {
	return original.pairId
		? db.ledger.filter(
				(entry) => entry.pairId === original.pairId && entry.id !== original.id,
			)
		: [];
}

function inRange(entry: LedgerRecord, range: Range): boolean {
	const at = toMs(entry.occurredAt);
	return at >= toMs(range.from) && at <= toMs(range.to);
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

function cashEntries(db: Snapshot, range: Range): LedgerRecord[] {
	return db.ledger.filter(
		(entry) => entry.account === "CASH" && inRange(entry, range),
	);
}

export function cashTotals(db: Snapshot, range: Range) {
	return ledgerTotals(cashEntries(db, range));
}

export function depositsHeld(db: Snapshot) {
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

function receivablesOf(db: Snapshot, now: Date): Receivable[] {
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

export function listLedger(
	db: Snapshot,
	input: Range & { account: z.infer<typeof LedgerAccount> },
) {
	const entries = db.ledger
		.filter((entry) => entry.account === input.account && inRange(entry, input))
		.sort((a, b) => toMs(b.occurredAt) - toMs(a.occurredAt));
	return {
		entries: entries.map((entry) => entryView(db, entry)),
		...ledgerTotals(entries),
	};
}

export function ledgerByCategory(db: Snapshot, range: Range) {
	const entries = cashEntries(db, range);
	return {
		in: totalsByCategory(entries, LEDGER_IN_CATEGORIES),
		out: totalsByCategory(entries, LEDGER_OUT_CATEGORIES),
	};
}

export function receivables(db: Snapshot, now: Date) {
	const items = receivablesOf(db, now);
	return {
		items,
		totalCents: sumCents(
			items.filter((item) => !item.provisional).map((item) => item.amountCents),
		),
	};
}

export function depositSummary(db: Snapshot, range: Range) {
	const entries = db.ledger.filter(
		(entry) => entry.account === "DEPOSIT" && inRange(entry, range),
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
}

export function exportCashCsv(db: Snapshot, month: string) {
	return ledgerCsv({
		month,
		entries: db.ledger.filter((entry) => entry.account === "CASH"),
	});
}

export function dashboardSummary(db: Snapshot, range: Range) {
	const held = depositsHeld(db);
	return {
		...cashTotals(db, range),
		depositHeldCents: held.heldCents,
		depositHeldRentalCount: held.heldRentalCount,
	};
}
