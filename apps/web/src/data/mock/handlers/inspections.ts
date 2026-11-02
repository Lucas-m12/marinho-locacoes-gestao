import {
	detectDivergences,
	isChecklistComplete,
	isRentalOverdue,
	nextCode,
	suggestOccurrenceAmount,
} from "@marinho-gestao/domain";
import {
	allUnitsSeparatedForCheckout,
	assertInspectionOpen,
	assertRentalTransition,
	findInspection,
	inspectionView,
	itemPrice,
	moveUnit,
	newInspectionLines,
	notFound,
	precondition,
	RENTAL_EVENTS,
	RETURN_TEXTS,
	rentalView,
	requireInspection,
	requireItem,
	requireRental,
	requireUnit,
} from "@marinho-gestao/read-model";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import {
	getDb,
	type MockDb,
	nextId,
	type RentalItemRecord,
	type RentalRecord,
	type UnitRecord,
} from "../db";
import { requireUsableFile } from "../files";
import { addEvent, moveRental, receiveDeposit, recordPayment } from "../flows";

function completeCheckout(
	db: MockDb,
	rental: RentalRecord,
	item: RentalItemRecord,
	unit: UnitRecord | null,
	at: string,
): void {
	if (rental.status === "CONFIRMED") {
		if (!allUnitsSeparatedForCheckout(db, rental)) {
			throw precondition("UNITS_NOT_SEPARATED");
		}
		moveRental(rental, "SEPARATED");
		rental.separatedAt = at;
	}
	if (rental.status !== "SEPARATED") assertRentalTransition(rental, "ON_SITE");
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
		reason: RETURN_TEXTS.repairReason(rental.number),
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
			inspection = {
				id: nextId(db, "insp"),
				rentalNumber: rental.number,
				itemCode: item.code,
				kind: input.kind,
				completedAt: null,
				items: newInspectionLines(db, item),
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
		assertInspectionOpen(inspection);
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
		const user = requirePermission(context, "inspections:run");
		const db = getDb();
		const inspection = requireInspection(db, input.inspectionId);
		assertInspectionOpen(inspection);
		requireUsableFile(db, user.id, input.fileKey, [
			"CHECKLIST_PHOTO",
			"CHECKLIST_VIDEO",
		]);
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
		assertInspectionOpen(inspection);
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
			addEvent(db, rental, user, RENTAL_EVENTS.checkedOut(item.code), at);
		} else {
			if (rental.status !== "ON_SITE") {
				assertRentalTransition(rental, "RETURNED");
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
					description: RETURN_TEXTS.lateOccurrence(view.lateFee.extraDailies),
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
					moveUnit(unit, "DAMAGED", RETURN_TEXTS.damagedReason(rental.number));
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
				RENTAL_EVENTS.returned(item.code, divergences.length),
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
