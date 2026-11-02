import type { Inspection, InspectionMedia } from "@marinho-gestao/contract";
import {
	CHECKLIST_MEDIA_SLOTS,
	formatDate,
	type InspectionKind,
	suggestLateFee,
	sumCents,
} from "@marinho-gestao/domain";
import { knownDamagesOf } from "./equipment";
import { notFound, precondition } from "./errors";
import { fileRefOf, requireRental, requireType, requireUnit } from "./queries";
import type {
	InspectionItemRecord,
	InspectionRecord,
	RentalItemRecord,
	RentalRecord,
	Snapshot,
	UnitRecord,
} from "./records";
import { itemPrice, rentalBalance, rentalTotals } from "./rental-money";
import { itemNames, requireCustomer } from "./views";

export function requireItem(
	rental: RentalRecord,
	code: string,
): RentalItemRecord {
	const item = rental.items.find((entry) => entry.code === code);
	if (!item) throw notFound("rentalItem", code);
	return item;
}

export function templateFor(db: Snapshot, item: RentalItemRecord) {
	if (item.kind === "LOT") {
		return {
			checklist: db.lots.find((lot) => lot.code === item.code)?.checklist ?? [],
			typeName: itemNames(db, item).name,
		};
	}
	const type = requireType(db, requireUnit(db, item.code).typeId);
	return { checklist: type.checklist, typeName: type.name };
}

export function preexistingItems(
	unit: UnitRecord | null,
): InspectionItemRecord[] {
	return (unit?.knownDamages ?? []).map((damage) => ({
		id: `dano:${damage.id}`,
		label: `Já tinha: ${damage.description}`,
		note: `Registrado em ${formatDate(damage.recordedAt)} · não se cobra do cliente`,
		occurrenceKind: "DAMAGE",
		answer: "NOT_OK",
		observation: damage.description,
		preexisting: true,
	}));
}

export function findInspection(
	db: Snapshot,
	rentalNumber: string,
	code: string,
	kind: InspectionKind,
): InspectionRecord | undefined {
	return db.inspections.find(
		(entry) =>
			entry.rentalNumber === rentalNumber &&
			entry.itemCode === code &&
			entry.kind === kind,
	);
}

export function requireInspection(db: Snapshot, id: string): InspectionRecord {
	const inspection = db.inspections.find((entry) => entry.id === id);
	if (!inspection) throw notFound("inspection", id);
	return inspection;
}

export function assertInspectionOpen(inspection: InspectionRecord): void {
	if (inspection.completedAt) throw precondition("CHECKLIST_ALREADY_DONE");
}

function mediaView(
	db: Snapshot,
	inspection: InspectionRecord,
	checkout: InspectionRecord | undefined,
): InspectionMedia[] {
	const fileAt = (record: InspectionRecord | undefined, slot: string) => {
		const fileKey = record?.media.find((entry) => entry.slot === slot)?.fileKey;
		return fileKey ? fileRefOf(db, fileKey) : null;
	};
	return CHECKLIST_MEDIA_SLOTS.map((slot) => ({
		slot,
		file: fileAt(inspection, slot),
		checkoutFile: inspection.kind === "RETURN" ? fileAt(checkout, slot) : null,
	}));
}

export function inspectionView(
	db: Snapshot,
	inspection: InspectionRecord,
	now: Date,
): Inspection {
	const rental = requireRental(db, inspection.rentalNumber);
	const item = requireItem(rental, inspection.itemCode);
	const checkout =
		inspection.kind === "RETURN"
			? findInspection(db, rental.number, item.code, "CHECKOUT")
			: undefined;
	const totals = rentalTotals(db, rental);
	const dailyTotalCents = sumCents(
		rental.items.map(
			(entry) =>
				(itemPrice(db, rental, entry).dailyPriceCents ?? 0) * entry.quantity,
		),
	);
	const late = suggestLateFee({
		dueAt: rental.endAt,
		returnedAt: now,
		dailyTotalCents,
	});
	const unit = item.kind === "UNIT" ? requireUnit(db, item.code) : null;

	return {
		id: inspection.id,
		rentalNumber: rental.number,
		itemKind: item.kind,
		unitCode: item.code,
		unitName: itemNames(db, item).name,
		typeName: templateFor(db, item).typeName,
		kind: inspection.kind,
		completedAt: inspection.completedAt,
		customerName: requireCustomer(db, rental.customerId).name,
		siteCity: rental.siteCity,
		items: inspection.items.map((entry) => {
			const before = checkout?.items.find((line) => line.id === entry.id);
			return {
				id: entry.id,
				label: entry.label,
				note: entry.note,
				occurrenceKind: entry.occurrenceKind,
				answer: entry.answer,
				observation: entry.observation,
				preexisting: entry.preexisting,
				checkoutAnswer: before?.answer ?? null,
				checkoutObservation: before?.observation ?? null,
			};
		}),
		media: mediaView(db, inspection, checkout),
		knownDamages: unit ? knownDamagesOf(db, unit) : [],
		dailyPriceCents: itemPrice(db, rental, item).dailyPriceCents,
		balanceCents: rentalBalance(db, rental),
		depositExpectedCents: totals.depositTotalCents,
		depositReceivedCents: rental.deposit.receivedCents,
		termSigned: rental.termSigned,
		lateFee: {
			extraDailies: late.extraDailies,
			suggestedCents: late.amountCents,
		},
	};
}

export function newInspectionLines(
	db: Snapshot,
	item: RentalItemRecord,
): InspectionItemRecord[] {
	const unit = item.kind === "UNIT" ? requireUnit(db, item.code) : null;
	return [
		...preexistingItems(unit),
		...templateFor(db, item).checklist.map((entry) => ({
			id: entry.id,
			label: entry.label,
			note: entry.note,
			occurrenceKind: entry.occurrenceKind,
			answer: null,
			observation: null,
			preexisting: false,
		})),
	];
}

export function allUnitsSeparatedForCheckout(
	db: Snapshot,
	rental: RentalRecord,
): boolean {
	return rental.items.every(
		(entry) =>
			entry.kind === "UNIT" &&
			requireUnit(db, entry.code).status === "SEPARATED",
	);
}
