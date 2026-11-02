import type { LostDemandGroup, Rental } from "@marinho-gestao/contract";
import {
	countDailies,
	formatBRLShort,
	isRentalOverdue,
	matchesSearch,
	nextCode,
	OPEN_RENTAL_STATUSES,
	type RentalStatus,
	toMs,
} from "@marinho-gestao/domain";
import { dailiesLabel, formatWeekdayDateTime } from "@/lib/format";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import {
	getDb,
	type MockDb,
	nextId,
	type RentalItemRecord,
	type RentalRecord,
} from "../db";
import { conflict, invalidTransition, precondition } from "../errors";
import { addEvent, holdUnits, moveRental, recordPayment } from "../flows";
import {
	findConflicts,
	requireLot,
	requireRental,
	requireUnit,
} from "../queries";
import {
	itemTablePrice,
	rentalTotalCents,
	rentalTotals,
} from "../rental-money";
import {
	customerView,
	rentalListItem,
	rentalView,
	requireCustomer,
} from "../views";
import { moveUnit } from "./equipment";

function assertCustomerCanRent(
	db: MockDb,
	customerId: string,
	now: Date,
): void {
	const { tier } = customerView(db, requireCustomer(db, customerId), now);
	if (tier === "BLOCKED") throw precondition("CUSTOMER_BLOCKED");
}

function assertPriced(db: MockDb, items: RentalItemRecord[]): void {
	const unpriced = items
		.filter((item) => itemTablePrice(db, item).dailyPriceCents === null)
		.map((item) => item.code);
	if (unpriced.length > 0) throw precondition("UNPRICED_TYPE", unpriced);
}

function assertFree(db: MockDb, rental: RentalRecord, now: Date): void {
	const conflicts = findConflicts(
		db,
		rental.items,
		rental.startAt,
		rental.endAt,
		now,
		rental.number,
	);
	if (conflicts.length > 0) throw conflict(conflicts);
}

function assertAccepts(
	rental: RentalRecord,
	statuses: readonly RentalStatus[],
	to: RentalStatus,
): void {
	if (!statuses.includes(rental.status)) {
		throw invalidTransition({
			entity: "RENTAL",
			from: rental.status,
			to,
			allowed: [...statuses],
		});
	}
}

const EXTENDABLE: readonly RentalStatus[] = [
	"CONFIRMED",
	"SEPARATED",
	"ON_SITE",
];
const PAYABLE: readonly RentalStatus[] = [
	"AWAITING_DEPOSIT",
	"CONFIRMED",
	"SEPARATED",
	"ON_SITE",
	"RETURNED",
	"CLOSED",
];

function listRank(rental: RentalRecord, now: Date): number {
	if (isRentalOverdue(rental, now)) return 0;
	return rental.status === "ON_SITE" ? 1 : 2;
}

function listTime(rental: RentalRecord): number {
	return toMs(rental.status === "ON_SITE" ? rental.endAt : rental.startAt);
}

function lostDemandGroups(records: MockDb["lostDemand"]) {
	const groups = new Map<string, LostDemandGroup>();
	for (const record of records) {
		const key = `${record.item}|${record.reason}`;
		const group = groups.get(key) ?? {
			item: record.item,
			reason: record.reason,
			count: 0,
			cities: [],
		};
		group.count += 1;
		if (record.city && !group.cities.includes(record.city)) {
			group.cities.push(record.city);
		}
		groups.set(key, group);
	}
	return [...groups.values()].sort((a, b) => b.count - a.count);
}

function quoteText(rental: Rental, deadlineHours: number): string {
	const lines = rental.items.map((item) => {
		const value =
			item.subtotalCents === null
				? "a definir"
				: formatBRLShort(item.subtotalCents);
		const daily =
			item.dailyPriceCents === null
				? "a definir"
				: formatBRLShort(item.dailyPriceCents);
		return item.perPiece
			? `• ${item.name}, ${item.quantity} peças: ${daily} × ${item.quantity} × ${rental.dailies} = ${value}`
			: `• ${item.name}: ${daily} × ${rental.dailies} = ${value}`;
	});
	const fee =
		rental.deliveryMode === "PICKUP"
			? "Cliente busca e devolve"
			: `Entrega e coleta: ${rental.deliveryFeeCents === null ? "a definir" : formatBRLShort(rental.deliveryFeeCents)}`;
	const total = `Total: ${formatBRLShort(rental.totalCents)}${rental.deliveryMode === "DELIVERY" && rental.deliveryFeeCents === null ? " + taxa de entrega" : ""}`;
	const signal = `Sinal para reservar: ${rental.signalRequiredCents === null ? "a definir" : formatBRLShort(rental.signalRequiredCents)}`;
	const deposit = `Caução, devolvida depois: ${rental.deposit.expectedCents === null ? "a definir" : formatBRLShort(rental.deposit.expectedCents)}`;

	return [
		`Orçamento ${rental.number} · Marinho Locações`,
		`Cliente: ${rental.customerName}`,
		`Saída: ${formatWeekdayDateTime(rental.startAt)}`,
		`Devolução: ${formatWeekdayDateTime(rental.endAt)} (${dailiesLabel(rental.dailies)})`,
		"",
		...lines,
		fee,
		...(rental.discountCents > 0
			? [`Desconto: ${formatBRLShort(rental.discountCents)}`]
			: []),
		total,
		"",
		signal,
		deposit,
		`Os equipamentos ficam seguros por ${deadlineHours} horas depois deste orçamento.`,
	].join("\n");
}

export const rentals = {
	list: api.rentals.list.handler(({ context, input }) => {
		requirePermission(context, "rentals:read");
		const db = getDb();
		const now = mockNow();
		const isOpen = (status: RentalStatus) =>
			OPEN_RENTAL_STATUSES.includes(status);
		const matching = db.rentals.filter((rental) => {
			const item = rentalListItem(db, rental, now);
			return matchesSearch(input.q ?? "", [
				item.number,
				item.customerName,
				item.customerCity,
				item.equipmentSummary,
				...rental.items.map((entry) => entry.code),
			]);
		});
		const open = matching.filter((rental) => isOpen(rental.status));
		const closed = matching.filter((rental) => !isOpen(rental.status));
		const selected =
			input.tab === "OPEN"
				? [...open].sort(
						(a, b) =>
							listRank(a, now) - listRank(b, now) || listTime(a) - listTime(b),
					)
				: [...closed].sort((a, b) => toMs(b.startAt) - toMs(a.startAt));
		return {
			rentals: selected.map((rental) => rentalListItem(db, rental, now)),
			counts: {
				OPEN: open.length,
				CLOSED: closed.length,
				LOST: lostDemandGroups(db.lostDemand).length,
			},
		};
	}),

	get: api.rentals.get.handler(({ context, input }) => {
		requirePermission(context, "rentals:read");
		const db = getDb();
		return rentalView(db, requireRental(db, input.number), mockNow());
	}),

	createQuote: api.rentals.createQuote.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const at = now.toISOString();
		requireCustomer(db, input.customerId);

		const items = input.items.map((item): RentalItemRecord => {
			if (item.kind === "UNIT") requireUnit(db, item.code);
			else requireLot(db, item.code);
			return {
				id: nextId(db, "item"),
				kind: item.kind,
				code: item.code,
				quantity: item.quantity,
				frozenDailyPriceCents: null,
				frozenDepositCents: null,
				checkoutDoneAt: null,
				returnDoneAt: null,
			};
		});
		assertPriced(db, items);

		const rental: RentalRecord = {
			id: nextId(db, "r"),
			number: nextCode(
				"LOC",
				db.rentals.map((entry) => entry.number),
			),
			status: "QUOTE",
			customerId: input.customerId,
			startAt: input.startAt,
			endAt: input.endAt,
			items,
			deliveryMode: input.deliveryMode,
			siteAddress: input.siteAddress,
			siteCity: input.siteCity,
			sitePinUrl: input.sitePinUrl,
			receiverName: requireCustomer(db, input.customerId).name,
			termSigned: false,
			notes: input.notes,
			deliveryFeeCents:
				input.deliveryMode === "PICKUP" ? 0 : input.deliveryFeeCents,
			discountCents: input.discountCents,
			payments: [],
			deposit: {
				receivedCents: 0,
				receivedAt: null,
				receivedMethod: null,
				refundedCents: 0,
				refundedAt: null,
				refundedMethod: null,
				retainedCents: 0,
				retentionReason: null,
				retainedAt: null,
			},
			occurrences: [],
			history: [],
			signalDueAt: null,
			priceFrozenAt: null,
			cancelReason: null,
			lateNoticeGiven: false,
			createdAt: at,
			sentAt: null,
			confirmedAt: null,
			separatedAt: null,
			deliveredAt: null,
			returnedAt: null,
			closedAt: null,
		};

		if (input.send) {
			assertCustomerCanRent(db, rental.customerId, now);
			assertFree(db, rental, now);
			holdUnits(db, rental, now);
			addEvent(db, rental, user, "Orçamento enviado ao cliente", at);
		} else {
			addEvent(db, rental, user, "Rascunho de orçamento criado", at);
		}
		db.rentals.push(rental);
		return rentalView(db, rental, now);
	}),

	sendQuote: api.rentals.sendQuote.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		assertCustomerCanRent(db, rental.customerId, now);
		assertFree(db, rental, now);
		holdUnits(db, rental, now);
		addEvent(
			db,
			rental,
			user,
			"Orçamento enviado ao cliente",
			now.toISOString(),
		);
		return rentalView(db, rental, now);
	}),

	recordPayment: api.rentals.recordPayment.handler(({ context, input }) => {
		const user = requirePermission(context, "money:write");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		assertAccepts(rental, PAYABLE, rental.status);
		recordPayment(db, rental, user, {
			kind: input.kind,
			amountCents: input.amountCents,
			method: input.method,
			paidAt: input.paidAt ?? now.toISOString(),
			receiptFileKey: input.receiptFileKey,
		});
		return rentalView(db, rental, now);
	}),

	confirm: api.rentals.confirm.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		if (!rental.payments.some((payment) => payment.kind === "SIGNAL")) {
			throw precondition("SIGNAL_REQUIRED");
		}
		moveRental(rental, "CONFIRMED");
		rental.confirmedAt = now.toISOString();
		addEvent(db, rental, user, "Reserva confirmada", rental.confirmedAt);
		return rentalView(db, rental, now);
	}),

	markSeparated: api.rentals.markSeparated.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:separate");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		moveRental(rental, "SEPARATED");
		for (const item of rental.items) {
			if (item.kind !== "UNIT") continue;
			const unit = requireUnit(db, item.code);
			if (unit.status !== "SEPARATED") moveUnit(unit, "SEPARATED");
		}
		rental.separatedAt = now.toISOString();
		addEvent(db, rental, user, "Separado e conferido", rental.separatedAt);
		return rentalView(db, rental, now);
	}),

	previewExtend: api.rentals.previewExtend.handler(({ context, input }) => {
		requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		if (toMs(input.newEndAt) <= toMs(rental.endAt)) {
			throw precondition("INVALID_DATE");
		}
		const conflicts = findConflicts(
			db,
			rental.items,
			rental.startAt,
			input.newEndAt,
			now,
			rental.number,
		);
		const currentTotal = rentalTotalCents(db, rental);
		const totals = rentalTotals(db, { ...rental, endAt: input.newEndAt });
		return {
			available: conflicts.length === 0,
			conflicts,
			dailies: totals.dailies,
			addedDailies: totals.dailies - countDailies(rental.startAt, rental.endAt),
			newTotalCents: totals.totalCents,
			differenceCents: totals.totalCents - currentTotal,
		};
	}),

	extend: api.rentals.extend.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		assertAccepts(rental, EXTENDABLE, rental.status);
		if (toMs(input.newEndAt) <= toMs(rental.endAt)) {
			throw precondition("INVALID_DATE");
		}
		const conflicts = findConflicts(
			db,
			rental.items,
			rental.startAt,
			input.newEndAt,
			now,
			rental.number,
		);
		if (conflicts.length > 0) throw conflict(conflicts);
		const previous = rentalTotalCents(db, rental);
		rental.endAt = input.newEndAt;
		const difference = rentalTotalCents(db, rental) - previous;
		addEvent(
			db,
			rental,
			user,
			`Prorrogada até ${formatWeekdayDateTime(input.newEndAt)}, mais ${formatBRLShort(difference)}`,
			now.toISOString(),
		);
		return rentalView(db, rental, now);
	}),

	cancel: api.rentals.cancel.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		moveRental(rental, "CANCELED");
		rental.cancelReason = input.reason;
		for (const item of rental.items) {
			const unit = db.units.find((entry) => entry.code === item.code);
			if (unit?.status === "SEPARATED") moveUnit(unit, "AVAILABLE");
		}
		addEvent(db, rental, user, `Cancelada: ${input.reason}`, now.toISOString());
		return rentalView(db, rental, now);
	}),

	close: api.rentals.close.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:close");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		const { receivedCents, refundedCents, retainedCents } = rental.deposit;
		if (receivedCents - refundedCents - retainedCents > 0) {
			throw precondition("DEPOSIT_NOT_SETTLED");
		}
		moveRental(rental, "CLOSED");
		rental.closedAt = now.toISOString();
		addEvent(db, rental, user, "Locação encerrada", rental.closedAt);
		return rentalView(db, rental, now);
	}),

	copyQuoteText: api.rentals.copyQuoteText.handler(({ context, input }) => {
		requirePermission(context, "rentals:read");
		const db = getDb();
		const rental = requireRental(db, input.number);
		return {
			text: quoteText(
				rentalView(db, rental, mockNow()),
				db.settings.signalDeadlineHours,
			),
		};
	}),

	recordLostDemand: api.rentals.recordLostDemand.handler(
		({ context, input }) => {
			const user = requirePermission(context, "lostDemand:write");
			const db = getDb();
			const record = {
				...input,
				id: nextId(db, "lost"),
				recordedBy: user.name,
			};
			db.lostDemand.push(record);
			return record;
		},
	),

	listLostDemand: api.rentals.listLostDemand.handler(({ context, input }) => {
		requirePermission(context, "rentals:read");
		const db = getDb();
		const records = db.lostDemand
			.filter(
				(record) =>
					!input ||
					(record.requestedOn >= input.from.slice(0, 10) &&
						record.requestedOn <= input.to.slice(0, 10)),
			)
			.sort((a, b) => b.requestedOn.localeCompare(a.requestedOn));
		return { records, groups: lostDemandGroups(records) };
	}),
};
