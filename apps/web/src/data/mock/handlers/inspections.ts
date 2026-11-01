import type { Inspection, InspectionMedia } from "@marinho-gestao/contract";
import {
	CHECKLIST_MEDIA_SLOTS,
	detectDivergences,
	type InspectionKind,
	isChecklistComplete,
	isRentalOverdue,
	nextCode,
	rentalStatusMachine,
	suggestLateFee,
	suggestOccurrenceAmount,
	sumCents,
} from "@marinho-gestao/domain";
import { formatDate } from "@/lib/format";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import {
	getDb,
	type InspectionItemRecord,
	type InspectionRecord,
	type MockDb,
	nextId,
	type RentalItemRecord,
	type RentalRecord,
	type UnitRecord,
} from "../db";
import { invalidTransition, notFound, precondition } from "../errors";
import { addEvent, moveRental, receiveDeposit, recordPayment } from "../flows";
import { fileRefOf, requireRental, requireType, requireUnit } from "../queries";
import { itemPrice, rentalBalance, rentalTotals } from "../rental-money";
import { itemNames, rentalView, requireCustomer } from "../views";
import { knownDamagesOf, moveUnit } from "./equipment";

function requireItem(rental: RentalRecord, code: string): RentalItemRecord {
	const item = rental.items.find((entry) => entry.code === code);
	if (!item) throw notFound("rentalItem", code);
	return item;
}

function templateFor(db: MockDb, item: RentalItemRecord) {
	if (item.kind === "LOT") {
		return {
			checklist: db.lots.find((lot) => lot.code === item.code)?.checklist ?? [],
			typeName: itemNames(db, item).name,
		};
	}
	const type = requireType(db, requireUnit(db, item.code).typeId);
	return { checklist: type.checklist, typeName: type.name };
}

function preexistingItems(unit: UnitRecord | null): InspectionItemRecord[] {
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

function findInspection(
	db: MockDb,
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

function requireInspection(db: MockDb, id: string): InspectionRecord {
	const inspection = db.inspections.find((entry) => entry.id === id);
	if (!inspection) throw notFound("inspection", id);
	return inspection;
}

function mediaView(
	db: MockDb,
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

function inspectionView(
	db: MockDb,
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

function completeCheckout(
	db: MockDb,
	rental: RentalRecord,
	item: RentalItemRecord,
	unit: UnitRecord | null,
	at: string,
): void {
	const allSeparated = rental.items.every(
		(entry) =>
			entry.kind === "UNIT" &&
			requireUnit(db, entry.code).status === "SEPARATED",
	);
	if (rental.status === "CONFIRMED") {
		if (!allSeparated) throw precondition("UNITS_NOT_SEPARATED");
		moveRental(rental, "SEPARATED");
		rental.separatedAt = at;
	}
	if (rental.status !== "SEPARATED") {
		throw invalidTransition({
			entity: "RENTAL",
			from: rental.status,
			to: "ON_SITE",
			allowed: [...rentalStatusMachine.allowedFrom(rental.status)],
		});
	}
	if (unit) moveUnit(unit, "RENTED");
	item.checkoutDoneAt = at;
	if (rental.items.every((entry) => entry.checkoutDoneAt !== null)) {
		moveRental(rental, "ON_SITE");
		rental.deliveredAt = at;
	}
}

function openRepairOrder(
	db: MockDb,
	unit: UnitRecord,
	rental: RentalRecord,
	at: string,
): void {
	db.maintenance.push({
		id: nextId(db, "os"),
		number: nextCode(
			"OS",
			db.maintenance.map((order) => order.number),
		),
		unitCode: unit.code,
		reason: `Conserto depois da ${rental.number}`,
		location: "BASE",
		locationName: null,
		estimatedCostCents: null,
		finalCostCents: null,
		expectedBackAt: null,
		status: "IN_REPAIR",
		openedAt: at,
		completedAt: null,
	});
}

export const inspections = {
	get: api.inspections.get.handler(({ context, input }) => {
		requirePermission(context, "inspections:run");
		const db = getDb();
		const rental = requireRental(db, input.rentalNumber);
		const item = requireItem(rental, input.unitCode);
		let inspection = findInspection(db, rental.number, item.code, input.kind);
		if (!inspection) {
			const unit = item.kind === "UNIT" ? requireUnit(db, item.code) : null;
			inspection = {
				id: nextId(db, "insp"),
				rentalNumber: rental.number,
				itemCode: item.code,
				kind: input.kind,
				completedAt: null,
				items: [
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
				],
				media: [],
			};
			db.inspections.push(inspection);
		}
		return inspectionView(db, inspection, mockNow());
	}),

	saveItem: api.inspections.saveItem.handler(({ context, input }) => {
		requirePermission(context, "inspections:run");
		const db = getDb();
		const inspection = requireInspection(db, input.inspectionId);
		const line = inspection.items.find((entry) => entry.id === input.itemId);
		if (!line) throw notFound("inspectionItem", input.itemId);
		line.answer = input.answer;
		line.observation = input.observation;
		const view = inspectionView(db, inspection, mockNow()).items.find(
			(entry) => entry.id === line.id,
		);
		if (!view) throw notFound("inspectionItem", input.itemId);
		return view;
	}),

	attachMedia: api.inspections.attachMedia.handler(({ context, input }) => {
		requirePermission(context, "inspections:run");
		const db = getDb();
		const inspection = requireInspection(db, input.inspectionId);
		inspection.media = [
			...inspection.media.filter((entry) => entry.slot !== input.slot),
			{ slot: input.slot, fileKey: input.fileKey },
		];
		const view = inspectionView(db, inspection, mockNow()).media.find(
			(entry) => entry.slot === input.slot,
		);
		if (!view) throw notFound("inspectionMedia", input.slot);
		return view;
	}),

	complete: api.inspections.complete.handler(({ context, input }) => {
		const user = requirePermission(context, "inspections:run");
		const db = getDb();
		const now = mockNow();
		const at = now.toISOString();
		const inspection = requireInspection(db, input.inspectionId);
		const rental = requireRental(db, inspection.rentalNumber);
		const item = requireItem(rental, inspection.itemCode);
		const unit = item.kind === "UNIT" ? requireUnit(db, item.code) : null;

		if (!isChecklistComplete(inspection.items)) {
			throw precondition("CHECKLIST_INCOMPLETE");
		}

		if (inspection.kind === "CHECKOUT") {
			if (!input.termSigned) throw precondition("TERM_NOT_SIGNED");
			completeCheckout(db, rental, item, unit, at);
			rental.termSigned = true;
			if (input.balance) {
				recordPayment(db, rental, user, {
					kind: "BALANCE",
					amountCents: input.balance.amountCents,
					method: input.balance.method,
					paidAt: at,
				});
			}
			if (input.deposit) {
				receiveDeposit(
					db,
					rental,
					user,
					input.deposit.amountCents,
					input.deposit.method,
					at,
				);
			}
			addEvent(db, rental, user, `${item.code} entregue, termo assinado`, at);
		} else {
			if (rental.status !== "ON_SITE") {
				throw invalidTransition({
					entity: "RENTAL",
					from: rental.status,
					to: "RETURNED",
					allowed: [...rentalStatusMachine.allowedFrom(rental.status)],
				});
			}
			const checkout = findInspection(db, rental.number, item.code, "CHECKOUT");
			const divergences = detectDivergences(
				checkout?.items ?? [],
				inspection.items,
			);
			const dailyPriceCents = itemPrice(db, rental, item).dailyPriceCents;

			for (const divergence of divergences) {
				const suggestedCents = suggestOccurrenceAmount({ dailyPriceCents });
				const resolution = input.resolutions.find(
					(entry) => entry.itemId === divergence.itemId,
				);
				rental.occurrences.push({
					id: nextId(db, "occ"),
					itemCode: item.code,
					kind: resolution?.kind ?? divergence.kind,
					description: resolution?.description ?? divergence.label,
					suggestedCents,
					amountCents: resolution?.amountCents ?? suggestedCents,
					decision: resolution?.decision ?? "DISPUTE",
					createdAt: at,
				});
			}

			if (input.lateFee && isRentalOverdue(rental, now)) {
				const view = inspectionView(db, inspection, now);
				rental.occurrences.push({
					id: nextId(db, "occ"),
					itemCode: item.code,
					kind: "LATE",
					description: `Atraso de ${view.lateFee.extraDailies} dia(s)`,
					suggestedCents: view.lateFee.suggestedCents,
					amountCents: input.lateFee.amountCents,
					decision: input.lateFee.decision,
					createdAt: at,
				});
			}

			if (unit) {
				moveUnit(unit, "IN_INSPECTION");
				unit.returnedAt = at;
				if (input.outcome === "DAMAGED") {
					moveUnit(unit, "DAMAGED", `Voltou com dano da ${rental.number}`);
				} else {
					moveUnit(unit, input.outcome);
				}
				if (input.outcome === "IN_MAINTENANCE") {
					openRepairOrder(db, unit, rental, at);
				}
			}
			item.returnDoneAt = at;
			if (rental.items.every((entry) => entry.returnDoneAt !== null)) {
				moveRental(rental, "RETURNED");
				rental.returnedAt = at;
			}
			addEvent(
				db,
				rental,
				user,
				divergences.length > 0
					? `${item.code} voltou com ${divergences.length} ocorrência(s)`
					: `${item.code} voltou sem ocorrências`,
				at,
			);
		}

		inspection.completedAt = at;
		return {
			inspection: inspectionView(db, inspection, now),
			rental: rentalView(db, rental, now),
			unitStatus: unit?.status ?? null,
		};
	}),
};
