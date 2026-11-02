import type {
	Customer,
	CustomerDetail,
	Rental,
	RentalListItem,
} from "@marinho-gestao/contract";
import {
	addHours,
	COUNTED_RENTAL_STATUSES,
	type CustomerRentalHistory,
	calendarDaysBetween,
	customerTier,
	type DocumentKind,
	depositHeldCents,
	isRentalOverdue,
	percentOfCents,
	rentalDisplayStatus,
	sumCents,
	toMs,
} from "@marinho-gestao/domain";
import { DOCUMENT_KIND_LABELS } from "@/lib/labels";
import type {
	CustomerRecord,
	MockDb,
	RentalItemRecord,
	RentalRecord,
} from "./db";
import { notFound } from "./errors";
import { fileRefOf } from "./queries";
import {
	activePayments,
	itemPrice,
	rentalBalance,
	rentalChargesCents,
	rentalTotalCents,
	rentalTotals,
} from "./rental-money";

const REQUIRED_DOCUMENTS: readonly DocumentKind[] = ["PHOTO_ID", "TAX_ID"];

export function requireCustomer(db: MockDb, id: string): CustomerRecord {
	const customer = db.customers.find((entry) => entry.id === id);
	if (!customer) throw notFound("customer", id);
	return customer;
}

function wasDelivered(rental: RentalRecord): boolean {
	return ["ON_SITE", "RETURNED", "CLOSED"].includes(rental.status);
}

function lateDaysOf(rental: RentalRecord, now: Date): number {
	if (isRentalOverdue(rental, now)) {
		return Math.max(1, calendarDaysBetween(rental.endAt, now));
	}
	if (rental.returnedAt && toMs(rental.returnedAt) > toMs(rental.endAt)) {
		return calendarDaysBetween(rental.endAt, rental.returnedAt);
	}
	return 0;
}

function rentalsOf(db: MockDb, customerId: string): RentalRecord[] {
	return db.rentals.filter((rental) => rental.customerId === customerId);
}

function countedRentals(db: MockDb, customerId: string): RentalRecord[] {
	return rentalsOf(db, customerId).filter((rental) =>
		COUNTED_RENTAL_STATUSES.includes(rental.status),
	);
}

function historyOf(
	db: MockDb,
	rental: RentalRecord,
	now: Date,
): CustomerRentalHistory {
	return {
		startAt: rental.startAt,
		lateDays: lateDaysOf(rental, now),
		noticeGiven: rental.lateNoticeGiven,
		hadDamage: rental.occurrences.some(
			(occurrence) => occurrence.kind !== "LATE",
		),
		hasDisputedDamage: rental.occurrences.some(
			(occurrence) => occurrence.decision === "DISPUTE",
		),
		openBalanceCents: wasDelivered(rental) ? rentalBalance(db, rental) : 0,
	};
}

export function customerView(
	db: MockDb,
	customer: CustomerRecord,
	now: Date,
): Customer {
	const counted = countedRentals(db, customer.id);
	const histories = counted.map((rental) => historyOf(db, rental, now));
	const overdueBalanceCents = sumCents(
		counted
			.filter(
				(rental) => wasDelivered(rental) && toMs(rental.endAt) < now.getTime(),
			)
			.map((rental) => rentalBalance(db, rental)),
	);
	const last = rentalsOf(db, customer.id)
		.filter((rental) => rental.status !== "QUOTE")
		.sort((a, b) => toMs(b.startAt) - toMs(a.startAt))[0];
	const received = customer.documents.map((document) => document.kind);

	return {
		id: customer.id,
		kind: customer.kind,
		name: customer.name,
		taxId: customer.taxId,
		responsible: customer.responsible,
		authorizedReceivers: customer.authorizedReceivers,
		whatsapp: customer.whatsapp,
		alternatePhone: customer.alternatePhone,
		address: customer.address,
		neighborhood: customer.neighborhood,
		city: customer.city,
		occupation: customer.occupation,
		origin: customer.origin,
		referredBy: customer.referredBy,
		acceptsPromotions: customer.acceptsPromotions,
		notes: customer.notes,
		blockedManually: customer.blockedManually,
		blockReason: customer.blockReason,
		createdAt: customer.createdAt,
		tier: customerTier({
			blockedManually: customer.blockedManually,
			overdueBalanceCents,
			rentals: histories,
			now,
		}),
		stats: {
			rentalCount: counted.length,
			totalSpentCents: sumCents(
				counted.map((rental) => rentalTotalCents(db, rental)),
			),
			lateCount: histories.filter((history) => history.lateDays > 0).length,
			openBalanceCents: sumCents(
				histories.map((history) => history.openBalanceCents),
			),
		},
		lastRental: last
			? {
					number: last.number,
					startAt: last.startAt,
					displayStatus: rentalDisplayStatus(last, now),
				}
			: null,
		missingDocuments: REQUIRED_DOCUMENTS.filter(
			(kind) => !received.includes(kind),
		),
	};
}

export function customerDocumentView(
	db: MockDb,
	document: CustomerRecord["documents"][number],
) {
	return {
		id: document.id,
		kind: document.kind,
		label: DOCUMENT_KIND_LABELS[document.kind],
		receivedAt: document.receivedAt,
		file: fileRefOf(db, document.fileKey),
	};
}

export function customerDetail(
	db: MockDb,
	customer: CustomerRecord,
	now: Date,
): CustomerDetail {
	return {
		...customerView(db, customer, now),
		documents: customer.documents.map((document) =>
			customerDocumentView(db, document),
		),
		rentals: rentalsOf(db, customer.id)
			.sort((a, b) => toMs(b.startAt) - toMs(a.startAt))
			.map((rental) => ({
				number: rental.number,
				equipmentSummary: equipmentSummary(db, rental),
				startAt: rental.startAt,
				endAt: rental.endAt,
				totalCents: rentalTotalCents(db, rental),
				displayStatus: rentalDisplayStatus(rental, now),
			})),
	};
}

export function itemNames(
	db: MockDb,
	item: Pick<RentalItemRecord, "kind" | "code">,
): {
	name: string;
	shortName: string;
	accessories: string | null;
	perPiece: boolean;
} {
	if (item.kind === "LOT") {
		const lot = db.lots.find((entry) => entry.code === item.code);
		return {
			name: lot?.name ?? item.code,
			shortName: lot?.name ?? item.code,
			accessories: lot?.kitComposition ?? null,
			perPiece: lot?.pricing === "PER_PIECE",
		};
	}
	const unit = db.units.find((entry) => entry.code === item.code);
	const type = db.types.find((entry) => entry.id === unit?.typeId);
	return {
		name: unit?.name ?? item.code,
		shortName: unit?.shortName ?? item.code,
		accessories: unit?.accessories ?? type?.accessories ?? null,
		perPiece: false,
	};
}

export function itemLabel(db: MockDb, item: RentalItemRecord): string {
	const names = itemNames(db, item);
	if (item.kind === "UNIT") return `${item.code} · ${names.name}`;
	return names.perPiece ? `${names.name} · ${item.quantity} peças` : names.name;
}

export function equipmentSummary(db: MockDb, rental: RentalRecord): string {
	const [first, ...others] = rental.items;
	if (!first) return "";
	const names = itemNames(db, first);
	if (others.length === 0) {
		if (first.kind === "UNIT") return `${first.code} ${names.shortName}`;
		return names.perPiece
			? `${names.name}, ${first.quantity} peças`
			: names.name;
	}
	return rental.items
		.map((item, index) => {
			const short = itemNames(db, item).shortName;
			return index === 0
				? short
				: short.charAt(0).toLowerCase() + short.slice(1);
		})
		.join(" e ");
}

export function rentalListItem(
	db: MockDb,
	rental: RentalRecord,
	now: Date,
): RentalListItem {
	const customer = requireCustomer(db, rental.customerId);
	return {
		number: rental.number,
		status: rental.status,
		displayStatus: rentalDisplayStatus(rental, now),
		customerId: customer.id,
		customerName: customer.name,
		customerCity: customer.city,
		equipmentSummary: equipmentSummary(db, rental),
		startAt: rental.startAt,
		endAt: rental.endAt,
		totalCents: rentalTotalCents(db, rental),
	};
}

function signalRequired(db: MockDb, totalCents: number): number | null {
	const { mode, valueCents, percent } = db.settings.signal;
	if (mode === "FIXED") return valueCents;
	if (mode === "PERCENT" && percent !== null) {
		return percentOfCents(totalCents, percent);
	}
	return null;
}

function allUnitsSeparated(db: MockDb, rental: RentalRecord): boolean {
	if (rental.status === "SEPARATED") return true;
	return rental.items.every((item) => {
		if (item.kind !== "UNIT") return false;
		return (
			db.units.find((unit) => unit.code === item.code)?.status === "SEPARATED"
		);
	});
}

export function rentalView(
	db: MockDb,
	rental: RentalRecord,
	now: Date,
): Rental {
	const customer = requireCustomer(db, rental.customerId);
	const summary = customerView(db, customer, now);
	const totals = rentalTotals(db, rental);
	const held = depositHeldCents(rental.deposit);

	return {
		...rentalListItem(db, rental, now),
		customer: {
			id: customer.id,
			name: customer.name,
			kind: customer.kind,
			occupation: customer.occupation,
			city: customer.city,
			tier: summary.tier,
			rentalCount: summary.stats.rentalCount,
		},
		items: rental.items.map((item, index) => {
			const names = itemNames(db, item);
			const price = itemPrice(db, rental, item);
			return {
				id: item.id,
				kind: item.kind,
				code: item.code,
				name: names.name,
				shortName: names.shortName,
				accessories: names.accessories,
				quantity: item.quantity,
				perPiece: names.perPiece,
				dailyPriceCents: price.dailyPriceCents,
				depositCents: price.depositCents,
				subtotalCents: totals.lines[index]?.subtotalCents ?? null,
				unitStatus:
					db.units.find((unit) => unit.code === item.code)?.status ?? null,
				checkoutDoneAt: item.checkoutDoneAt,
				returnDoneAt: item.returnDoneAt,
			};
		}),
		dailies: totals.dailies,
		deliveryMode: rental.deliveryMode,
		siteAddress: rental.siteAddress,
		siteCity: rental.siteCity,
		sitePinUrl: rental.sitePinUrl,
		receiverName: rental.receiverName,
		termSigned: rental.termSigned,
		notes: rental.notes,
		subtotalCents: totals.subtotalCents,
		deliveryFeeCents: rental.deliveryFeeCents,
		discountCents: rental.discountCents,
		chargesCents: rentalChargesCents(rental),
		paidCents: sumCents(
			activePayments(rental).map((payment) => payment.amountCents),
		),
		balanceCents: rentalBalance(db, rental),
		signalRequiredCents: signalRequired(db, totals.totalCents),
		signalPaidCents: sumCents(
			activePayments(rental)
				.filter((payment) => payment.kind === "SIGNAL")
				.map((payment) => payment.amountCents),
		),
		signalDueAt: rental.signalDueAt,
		priceFrozenAt: rental.priceFrozenAt,
		cancelReason: rental.cancelReason,
		createdAt: rental.createdAt,
		sentAt: rental.sentAt,
		confirmedAt: rental.confirmedAt,
		separatedAt: rental.separatedAt,
		deliveredAt: rental.deliveredAt,
		returnedAt: rental.returnedAt,
		closedAt: rental.closedAt,
		payments: [...rental.payments].sort(
			(a, b) => toMs(a.paidAt) - toMs(b.paidAt),
		),
		deposit: {
			expectedCents: totals.depositTotalCents,
			receivedCents: rental.deposit.receivedCents,
			receivedAt: rental.deposit.receivedAt,
			receivedMethod: rental.deposit.receivedMethod,
			refundedCents: rental.deposit.refundedCents,
			refundedAt: rental.deposit.refundedAt,
			refundedMethod: rental.deposit.refundedMethod,
			retainedCents: rental.deposit.retainedCents,
			retentionReason: rental.deposit.retentionReason,
			retainedAt: rental.deposit.retainedAt,
			heldCents: held,
			refundDueAt:
				held > 0 && rental.returnedAt
					? addHours(rental.returnedAt, 24).toISOString()
					: null,
		},
		occurrences: rental.occurrences.map((occurrence) => ({
			...occurrence,
			rentalNumber: rental.number,
		})),
		history: [...rental.history].sort((a, b) => toMs(b.at) - toMs(a.at)),
		allUnitsSeparated: allUnitsSeparated(db, rental),
		pendingCheckouts: rental.items
			.filter((item) => item.checkoutDoneAt === null)
			.map((item) => item.code),
		pendingReturns: rental.items
			.filter((item) => item.returnDoneAt === null)
			.map((item) => item.code),
	};
}
