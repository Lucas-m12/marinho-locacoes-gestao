import type { LedgerEntry, Receivable } from "@marinho-gestao/contract";
import {
	depositHeldCents,
	isRentalOverdue,
	LEDGER_IN_CATEGORIES,
	LEDGER_OUT_CATEGORIES,
	type LedgerCategory,
	suggestLateFee,
	sumCents,
	toMs,
} from "@marinho-gestao/domain";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import { getDb, type LedgerRecord, type MockDb, nextId } from "../db";
import { requireRental, requireUnit } from "../queries";
import { itemPrice, rentalBalance, rentalChargesCents } from "../rental-money";
import { requireCustomer } from "../views";

function entryView({
	maintenanceNumber: _order,
	...entry
}: LedgerRecord): LedgerEntry {
	return entry;
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
					.map((entry) => entry.amountCents),
			),
		}))
		.filter((row) => row.amountCents > 0)
		.sort((a, b) => b.amountCents - a.amountCents);
}

export function cashTotals(db: MockDb, from: string, to: string) {
	const entries = db.ledger.filter(
		(entry) => entry.account === "CASH" && inRange(entry, from, to),
	);
	const sum = (direction: LedgerRecord["direction"]) =>
		sumCents(
			entries
				.filter((entry) => entry.direction === direction)
				.map((entry) => entry.amountCents),
		);
	const inCents = sum("IN");
	const outCents = sum("OUT");
	return { inCents, outCents, resultCents: inCents - outCents };
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
		const sum = (direction: LedgerRecord["direction"]) =>
			sumCents(
				entries
					.filter((entry) => entry.direction === direction)
					.map((entry) => entry.amountCents),
			);
		const inCents = sum("IN");
		const outCents = sum("OUT");
		return {
			entries: entries.map(entryView),
			inCents,
			outCents,
			resultCents: inCents - outCents,
		};
	}),

	create: api.ledger.create.handler(({ context, input }) => {
		const user = requirePermission(context, "money:write");
		const db = getDb();
		if (input.rentalNumber) requireRental(db, input.rentalNumber);
		if (input.unitCode) requireUnit(db, input.unitCode);
		const record: LedgerRecord = {
			...input,
			id: nextId(db, "led"),
			account: "CASH",
			recordedBy: user.name,
			maintenanceNumber: null,
		};
		db.ledger.push(record);
		return entryView(record);
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
					.map((entry) => entry.amountCents),
			);
		return {
			...depositsHeld(db),
			receivedCents: sum("DEPOSIT_RECEIVED"),
			refundedCents: sum("DEPOSIT_REFUNDED"),
			retainedCents: sum("DEPOSIT_TO_CASH"),
		};
	}),
};
