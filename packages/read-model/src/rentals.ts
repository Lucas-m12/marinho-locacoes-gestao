import type {
	LostDemandGroup,
	Rental,
	RentalTab,
} from "@marinho-gestao/contract";
import {
	countDailies,
	dailiesLabel,
	formatBRLShort,
	formatWeekdayDateTime,
	isRentalOverdue,
	matchesSearch,
	OPEN_RENTAL_STATUSES,
	type RentalStatus,
	rentalStatusMachine,
	toMs,
} from "@marinho-gestao/domain";
import { invalidTransition, precondition } from "./errors";
import { findConflicts } from "./queries";
import type {
	LostDemandRecord,
	RentalItemRecord,
	RentalRecord,
	Snapshot,
} from "./records";
import { itemTablePrice, rentalTotalCents, rentalTotals } from "./rental-money";
import { customerView, rentalListItem, requireCustomer } from "./views";

export function assertCustomerCanRent(
	db: Snapshot,
	customerId: string,
	now: Date,
): void {
	const { tier } = customerView(db, requireCustomer(db, customerId), now);
	if (tier === "BLOCKED") throw precondition("CUSTOMER_BLOCKED");
}

export function assertPriced(
	db: Snapshot,
	items: readonly Pick<RentalItemRecord, "kind" | "code">[],
): void {
	const unpriced = items
		.filter((item) => itemTablePrice(db, item).dailyPriceCents === null)
		.map((item) => item.code);
	if (unpriced.length > 0) throw precondition("UNPRICED_TYPE", unpriced);
}

export function assertAccepts(
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

function listRank(rental: RentalRecord, now: Date): number {
	if (isRentalOverdue(rental, now)) return 0;
	return rental.status === "ON_SITE" ? 1 : 2;
}

function listTime(rental: RentalRecord): number {
	return toMs(rental.status === "ON_SITE" ? rental.endAt : rental.startAt);
}

export function lostDemandGroups(records: readonly LostDemandRecord[]) {
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

export function quoteText(rental: Rental, deadlineHours: number): string {
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

export function listRentals(
	db: Snapshot,
	input: { tab: RentalTab; q?: string },
	now: Date,
) {
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
}

export function listLostDemand(
	db: Snapshot,
	input: { from: string; to: string } | undefined,
) {
	const records = db.lostDemand
		.filter(
			(record) =>
				!input ||
				(record.requestedOn >= input.from.slice(0, 10) &&
					record.requestedOn <= input.to.slice(0, 10)),
		)
		.sort((a, b) => b.requestedOn.localeCompare(a.requestedOn));
	return { records, groups: lostDemandGroups(records) };
}

export function previewExtension(
	db: Snapshot,
	rental: RentalRecord,
	newEndAt: string,
	now: Date,
) {
	if (toMs(newEndAt) <= toMs(rental.endAt)) {
		throw precondition("INVALID_DATE");
	}
	const conflicts = findConflicts(
		db,
		rental.items,
		rental.startAt,
		newEndAt,
		now,
		rental.number,
	);
	const currentTotal = rentalTotalCents(db, rental);
	const totals = rentalTotals(db, { ...rental, endAt: newEndAt });
	return {
		available: conflicts.length === 0,
		conflicts,
		dailies: totals.dailies,
		addedDailies: totals.dailies - countDailies(rental.startAt, rental.endAt),
		newTotalCents: totals.totalCents,
		differenceCents: totals.totalCents - currentTotal,
	};
}

export function assertRentalTransition(
	rental: Pick<RentalRecord, "status">,
	to: RentalStatus,
): void {
	if (!rentalStatusMachine.canTransition(rental.status, to)) {
		throw invalidTransition({
			entity: "RENTAL",
			from: rental.status,
			to,
			allowed: [...rentalStatusMachine.allowedFrom(rental.status)],
		});
	}
}
