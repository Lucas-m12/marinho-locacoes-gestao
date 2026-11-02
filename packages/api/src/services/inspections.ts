import type {
	CompleteInspectionInput,
	Inspection,
	InspectionItem,
	InspectionMedia,
	SaveInspectionItemInput,
} from "@marinho-gestao/contract";
import type { DbClient, Transaction } from "@marinho-gestao/db";
import {
	detectDivergences,
	type InspectionKind,
	isChecklistComplete,
	isRentalOverdue,
	type RentalStatus,
	suggestOccurrenceAmount,
	type UnitStatus,
} from "@marinho-gestao/domain";
import {
	allUnitsSeparatedForCheckout,
	assertInspectionOpen,
	assertRentalTransition,
	findInspection,
	type InspectionRecord,
	inspectionView,
	itemPrice,
	newInspectionLines,
	RENTAL_EVENTS,
	RETURN_TEXTS,
	type RentalRecord,
	rentalView,
	requireInspection,
	requireItem,
	requireRental,
	requireUnit,
	type Snapshot,
} from "@marinho-gestao/read-model";
import type { z } from "zod";
import { isUniqueViolation, notFound, precondition } from "../errors";
import { inTransaction, type ServiceDeps } from "./deps";
import { moveUnitStatus } from "./equipment";
import { recordEvent } from "./events";
import { requireUsableFile } from "./files";
import { lockRental, requireUuid } from "./lookups";
import { openRepairOrder } from "./maintenance";
import { postDepositReceived } from "./money";
import { postPayment } from "./rentals";
import { loadSnapshot } from "./snapshot";

async function inspectionSnapshot(
	db: DbClient,
	rentalCode: string,
): Promise<Snapshot> {
	return loadSnapshot(db, {
		rentals: { customer: { rentals: { some: { code: rentalCode } } } },
		history: true,
		inspections: { rentalItem: { rental: { code: rentalCode } } },
	});
}

async function rentalCodeOfInspection(
	db: DbClient,
	inspectionId: string,
): Promise<string> {
	requireUuid("inspection", inspectionId);
	const row = await db.inspection.findUnique({
		where: { id: inspectionId },
		select: { rentalItem: { select: { rental: { select: { code: true } } } } },
	});
	if (!row) throw notFound("inspection", inspectionId);
	return row.rentalItem.rental.code;
}

async function lockInspection(tx: Transaction, inspectionId: string) {
	await tx.$queryRaw`select id from inspection where id = ${inspectionId}::uuid for update`;
}

export async function getInspection(
	deps: ServiceDeps,
	input: { rentalNumber: string; unitCode: string; kind: InspectionKind },
): Promise<Inspection> {
	const now = deps.clock();
	const create = async (tx: Transaction) => {
		const snapshot = await inspectionSnapshot(tx, input.rentalNumber);
		const rental = requireRental(snapshot, input.rentalNumber);
		const item = requireItem(rental, input.unitCode);
		const existing = findInspection(
			snapshot,
			rental.number,
			item.code,
			input.kind,
		);
		if (existing) return inspectionView(snapshot, existing, now);
		const lines = newInspectionLines(snapshot, item);
		const created = await tx.inspection.create({
			data: {
				rentalItemId: item.id,
				kind: input.kind,
				answers: {
					create: lines.map((line, position) => ({
						key: line.id,
						position,
						label: line.label,
						note: line.note,
						occurrenceKind: line.occurrenceKind,
						answer: line.answer,
						observation: line.observation,
						preexisting: line.preexisting,
					})),
				},
			},
		});
		const record: InspectionRecord = {
			id: created.id,
			rentalNumber: rental.number,
			itemCode: item.code,
			kind: input.kind,
			completedAt: null,
			items: lines,
			media: [],
		};
		return inspectionView(
			{ ...snapshot, inspections: [...snapshot.inspections, record] },
			record,
			now,
		);
	};
	try {
		return await inTransaction(deps.db, create);
	} catch (error) {
		if (!isUniqueViolation(error)) throw error;
		return inTransaction(deps.db, create);
	}
}

async function viewOf(db: DbClient, rentalCode: string, id: string, now: Date) {
	const snapshot = await inspectionSnapshot(db, rentalCode);
	return inspectionView(snapshot, requireInspection(snapshot, id), now);
}

export async function saveInspectionItem(
	deps: ServiceDeps,
	input: z.output<typeof SaveInspectionItemInput>,
): Promise<InspectionItem> {
	const rentalCode = await rentalCodeOfInspection(deps.db, input.inspectionId);
	return inTransaction(deps.db, async (tx) => {
		await lockInspection(tx, input.inspectionId);
		const inspection = await tx.inspection.findUniqueOrThrow({
			where: { id: input.inspectionId },
		});
		if (inspection.completedAt) throw precondition("CHECKLIST_ALREADY_DONE");
		const updated = await tx.inspectionAnswer.updateMany({
			where: { inspectionId: input.inspectionId, key: input.itemId },
			data: { answer: input.answer, observation: input.observation },
		});
		if (updated.count === 0) throw notFound("inspectionItem", input.itemId);
		await recordEvent(tx, {
			actor: deps.actor,
			action: "inspection.itemSaved",
			entity: "Inspection",
			entityId: input.inspectionId,
			at: deps.clock(),
			payload: { itemId: input.itemId, answer: input.answer },
		});
		const view = await viewOf(tx, rentalCode, input.inspectionId, deps.clock());
		const item = view.items.find((entry) => entry.id === input.itemId);
		if (!item) throw notFound("inspectionItem", input.itemId);
		return item;
	});
}

export async function attachInspectionMedia(
	deps: ServiceDeps,
	input: {
		inspectionId: string;
		slot: InspectionMedia["slot"];
		fileKey: string;
	},
): Promise<InspectionMedia> {
	const rentalCode = await rentalCodeOfInspection(deps.db, input.inspectionId);
	return inTransaction(deps.db, async (tx) => {
		await lockInspection(tx, input.inspectionId);
		const inspection = await tx.inspection.findUniqueOrThrow({
			where: { id: input.inspectionId },
		});
		if (inspection.completedAt) throw precondition("CHECKLIST_ALREADY_DONE");
		await requireUsableFile(tx, deps.actor.id, input.fileKey, [
			"CHECKLIST_PHOTO",
			"CHECKLIST_VIDEO",
		]);
		await tx.inspectionMedia.upsert({
			where: {
				inspectionId_slot: {
					inspectionId: input.inspectionId,
					slot: input.slot,
				},
			},
			update: { fileKey: input.fileKey },
			create: {
				inspectionId: input.inspectionId,
				slot: input.slot,
				fileKey: input.fileKey,
			},
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action: "inspection.mediaAttached",
			entity: "Inspection",
			entityId: input.inspectionId,
			at: deps.clock(),
			payload: { slot: input.slot, fileKey: input.fileKey },
		});
		const view = await viewOf(tx, rentalCode, input.inspectionId, deps.clock());
		const media = view.media.find((entry) => entry.slot === input.slot);
		if (!media) throw notFound("inspectionMedia", input.slot);
		return media;
	});
}

async function moveRentalStatus(
	tx: Transaction,
	rental: RentalRecord,
	from: RentalStatus,
	to: RentalStatus,
	stamp: "separatedAt" | "deliveredAt" | "returnedAt",
	at: Date,
): Promise<RentalStatus> {
	assertRentalTransition({ status: from }, to);
	await tx.rental.update({
		where: { id: rental.id },
		data: { status: to, [stamp]: at },
	});
	return to;
}

async function completeCheckout(
	tx: Transaction,
	deps: ServiceDeps,
	snapshot: Snapshot,
	rental: RentalRecord,
	itemId: string,
	unitId: string | null,
	input: z.output<typeof CompleteInspectionInput>,
	at: Date,
): Promise<void> {
	if (!input.termSigned) throw precondition("TERM_NOT_SIGNED");
	let status = rental.status;
	if (status === "CONFIRMED") {
		if (!allUnitsSeparatedForCheckout(snapshot, rental)) {
			throw precondition("UNITS_NOT_SEPARATED");
		}
		status = await moveRentalStatus(
			tx,
			rental,
			status,
			"SEPARATED",
			"separatedAt",
			at,
		);
	}
	if (status !== "SEPARATED") assertRentalTransition({ status }, "ON_SITE");
	if (unitId) await moveUnitStatus(tx, unitId, "RENTED");
	await tx.rentalItem.update({
		where: { id: itemId },
		data: { checkoutDoneAt: at },
	});
	const allOut = rental.items.every(
		(entry) => entry.id === itemId || entry.checkoutDoneAt !== null,
	);
	if (allOut) {
		await moveRentalStatus(tx, rental, status, "ON_SITE", "deliveredAt", at);
	}
	await tx.rental.update({
		where: { id: rental.id },
		data: { termSigned: true },
	});
	if (input.balance) {
		await postPayment(tx, deps, snapshot, rental, {
			kind: "BALANCE",
			amountCents: input.balance.amountCents,
			method: input.balance.method,
			paidAt: at,
			receiptFileKey: null,
		});
	}
	if (input.deposit) {
		await postDepositReceived(
			tx,
			deps,
			snapshot,
			rental,
			input.deposit.amountCents,
			input.deposit.method,
			at,
		);
	}
}

async function completeReturn(
	tx: Transaction,
	snapshot: Snapshot,
	rental: RentalRecord,
	inspection: InspectionRecord,
	itemId: string,
	unitId: string | null,
	input: z.output<typeof CompleteInspectionInput>,
	now: Date,
): Promise<number> {
	if (rental.status !== "ON_SITE") assertRentalTransition(rental, "RETURNED");
	const item = requireItem(rental, inspection.itemCode);
	const checkout = findInspection(
		snapshot,
		rental.number,
		item.code,
		"CHECKOUT",
	);
	const divergences = detectDivergences(
		checkout?.items ?? [],
		inspection.items,
	);
	const dailyPriceCents = itemPrice(snapshot, rental, item).dailyPriceCents;

	for (const divergence of divergences) {
		const suggestedCents = suggestOccurrenceAmount({ dailyPriceCents });
		const resolution = input.resolutions.find(
			(entry) => entry.itemId === divergence.itemId,
		);
		await tx.occurrence.create({
			data: {
				rentalId: rental.id,
				rentalItemId: itemId,
				kind: resolution?.kind ?? divergence.kind,
				description: resolution?.description ?? divergence.label,
				suggestedCents,
				amountCents: resolution?.amountCents ?? suggestedCents,
				decision: resolution?.decision ?? "DISPUTE",
				createdAt: now,
			},
		});
	}

	if (input.lateFee && isRentalOverdue(rental, now)) {
		const view = inspectionView(snapshot, inspection, now);
		await tx.occurrence.create({
			data: {
				rentalId: rental.id,
				rentalItemId: itemId,
				kind: "LATE",
				description: RETURN_TEXTS.lateOccurrence(view.lateFee.extraDailies),
				suggestedCents: view.lateFee.suggestedCents,
				amountCents: input.lateFee.amountCents,
				decision: input.lateFee.decision,
				createdAt: now,
			},
		});
	}

	if (unitId) {
		await moveUnitStatus(tx, unitId, "IN_INSPECTION");
		await tx.unit.update({ where: { id: unitId }, data: { returnedAt: now } });
		if (input.outcome === "DAMAGED") {
			await moveUnitStatus(
				tx,
				unitId,
				"DAMAGED",
				RETURN_TEXTS.damagedReason(rental.number),
			);
		} else if (input.outcome !== "IN_INSPECTION") {
			await moveUnitStatus(tx, unitId, input.outcome);
		}
		if (input.outcome === "IN_MAINTENANCE") {
			await openRepairOrder(tx, {
				unitId,
				reason: RETURN_TEXTS.repairReason(rental.number),
				location: "BASE",
				locationName: null,
				estimatedCostCents: null,
				expectedBackAt: null,
				openedAt: now,
			});
		}
	}

	await tx.rentalItem.update({
		where: { id: itemId },
		data: { returnDoneAt: now, holdsCalendar: false },
	});
	const allBack = rental.items.every(
		(entry) => entry.id === itemId || entry.returnDoneAt !== null,
	);
	if (allBack) {
		await moveRentalStatus(
			tx,
			rental,
			"ON_SITE",
			"RETURNED",
			"returnedAt",
			now,
		);
		await tx.rentalItem.updateMany({
			where: { rentalId: rental.id },
			data: { holdsCalendar: false },
		});
	}
	return divergences.length;
}

export async function completeInspection(
	deps: ServiceDeps,
	input: z.output<typeof CompleteInspectionInput>,
) {
	const rentalCode = await rentalCodeOfInspection(deps.db, input.inspectionId);
	const now = deps.clock();
	return inTransaction(deps.db, async (tx) => {
		await lockRental(tx, rentalCode);
		await lockInspection(tx, input.inspectionId);
		const snapshot = await inspectionSnapshot(tx, rentalCode);
		const inspection = requireInspection(snapshot, input.inspectionId);
		assertInspectionOpen(inspection);
		const rental = requireRental(snapshot, rentalCode);
		const item = requireItem(rental, inspection.itemCode);
		const unitId =
			item.kind === "UNIT" ? requireUnit(snapshot, item.code).id : null;

		if (!isChecklistComplete(inspection.items)) {
			throw precondition("CHECKLIST_INCOMPLETE");
		}

		if (inspection.kind === "CHECKOUT") {
			await completeCheckout(
				tx,
				deps,
				snapshot,
				rental,
				item.id,
				unitId,
				input,
				now,
			);
			await recordEvent(tx, {
				actor: deps.actor,
				action: "rental.checkedOut",
				entity: "Rental",
				entityId: rental.id,
				message: RENTAL_EVENTS.checkedOut(item.code),
				at: now,
				payload: { inspectionId: inspection.id },
			});
		} else {
			const occurrences = await completeReturn(
				tx,
				snapshot,
				rental,
				inspection,
				item.id,
				unitId,
				input,
				now,
			);
			await recordEvent(tx, {
				actor: deps.actor,
				action: "rental.returned",
				entity: "Rental",
				entityId: rental.id,
				message: RENTAL_EVENTS.returned(item.code, occurrences),
				at: now,
				payload: { inspectionId: inspection.id, outcome: input.outcome },
			});
		}

		await tx.inspection.update({
			where: { id: inspection.id },
			data: { completedAt: now },
		});

		const after = await inspectionSnapshot(tx, rentalCode);
		const unitStatus: UnitStatus | null = unitId
			? requireUnit(after, item.code).status
			: null;
		return {
			inspection: inspectionView(
				after,
				requireInspection(after, inspection.id),
				now,
			),
			rental: rentalView(after, requireRental(after, rentalCode), now),
			unitStatus,
		};
	});
}
