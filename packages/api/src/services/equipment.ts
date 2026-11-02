import type {
	AddKnownDamageInput,
	ChangeUnitStatusInput,
	CreateTypeInput,
	CreateUnitInput,
	EquipmentType,
	KnownDamage,
	Lot,
	Unit,
	UnitDetail,
	UnitPhoto,
	UpdateLotInput,
	UpdateTypeInput,
	UpdateUnitInput,
} from "@marinho-gestao/contract";
import type { Transaction } from "@marinho-gestao/db";
import {
	codeSequence,
	type UnitStatus,
	unitStatusMachine,
} from "@marinho-gestao/domain";
import {
	assertUnitTransition,
	DEFAULT_CHECKLIST,
	damageView,
	fileRefOf,
	listUnits as listUnitsView,
	lotView,
	requireUnit,
	typeView,
	unitDetail,
	unitView,
} from "@marinho-gestao/read-model";
import type { z } from "zod";
import { isUniqueViolation, notFound, precondition } from "../errors";
import { nextCodeFromCounter, raiseCounter } from "./counters";
import { inTransaction, type ServiceDeps } from "./deps";
import { recordEvent } from "./events";
import { requireUsableFile } from "./files";
import { lockUnit, requireUuid } from "./lookups";
import { HOLDING_RENTALS } from "./scopes";
import { loadSnapshot } from "./snapshot";

type Input<T extends z.ZodType> = z.output<T>;

function defined<T extends object>(value: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	) as Partial<T>;
}

async function typeOf(
	db: ServiceDeps["db"] | Transaction,
	id: string,
): Promise<EquipmentType> {
	const snapshot = await loadSnapshot(db);
	const type = snapshot.types.find((entry) => entry.id === id);
	if (!type) throw notFound("type", id);
	return typeView(snapshot, type);
}

async function unitOf(
	db: ServiceDeps["db"] | Transaction,
	code: string,
): Promise<Unit> {
	const snapshot = await loadSnapshot(db);
	return unitView(snapshot, requireUnit(snapshot, code));
}

export async function listTypes(deps: ServiceDeps): Promise<EquipmentType[]> {
	const snapshot = await loadSnapshot(deps.db, { activeCatalogOnly: true });
	return snapshot.types.map((type) => typeView(snapshot, type));
}

export async function listUnits(
	deps: ServiceDeps,
	input: { status?: UnitStatus; q?: string },
) {
	const snapshot = await loadSnapshot(deps.db, {
		rentals: HOLDING_RENTALS,
		activeCatalogOnly: true,
	});
	return listUnitsView(snapshot, input, deps.clock());
}

export async function getUnit(
	deps: ServiceDeps,
	code: string,
): Promise<UnitDetail> {
	const snapshot = await loadSnapshot(deps.db, {
		rentals: { items: { some: { unit: { code } } } },
		ledger: { unit: { code }, category: "MAINTENANCE" },
	});
	return unitDetail(snapshot, requireUnit(snapshot, code), deps.clock());
}

export async function createType(
	deps: ServiceDeps,
	input: Input<typeof CreateTypeInput>,
): Promise<EquipmentType> {
	return inTransaction(deps.db, async (tx) => {
		const type = await tx.equipmentType.create({
			data: {
				...input,
				checklist: {
					create: DEFAULT_CHECKLIST.map((item, position) => ({
						key: item.id,
						position,
						label: item.label,
						note: item.note,
						occurrenceKind: item.occurrenceKind,
					})),
				},
			},
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action: "type.created",
			entity: "EquipmentType",
			entityId: type.id,
			at: deps.clock(),
			payload: input,
		});
		return typeOf(tx, type.id);
	});
}

export async function updateType(
	deps: ServiceDeps,
	input: Input<typeof UpdateTypeInput>,
): Promise<EquipmentType> {
	const { id, ...changes } = input;
	requireUuid("type", id);
	return inTransaction(deps.db, async (tx) => {
		const before = await tx.equipmentType.findUnique({ where: { id } });
		if (!before) throw notFound("type", id);
		await tx.equipmentType.update({ where: { id }, data: defined(changes) });
		await recordEvent(tx, {
			actor: deps.actor,
			action: "type.updated",
			entity: "EquipmentType",
			entityId: id,
			at: deps.clock(),
			payload: {
				changes,
				before: {
					dailyPriceCents: before.dailyPriceCents,
					depositCents: before.depositCents,
					turnaroundHours: before.turnaroundHours,
				},
			},
		});
		return typeOf(tx, id);
	});
}

export async function createUnit(
	deps: ServiceDeps,
	input: Input<typeof CreateUnitInput>,
): Promise<Unit> {
	requireUuid("type", input.typeId);
	try {
		return await inTransaction(deps.db, async (tx) => {
			const type = await tx.equipmentType.findUnique({
				where: { id: input.typeId },
			});
			if (!type) throw notFound("type", input.typeId);
			const code = input.code ?? (await nextCodeFromCounter(tx, "MAR"));
			const sequence = codeSequence("MAR", code);
			if (sequence !== null) await raiseCounter(tx, "MAR", sequence);
			if (await tx.unit.findUnique({ where: { code } })) {
				throw precondition("DUPLICATE", [code]);
			}
			const unit = await tx.unit.create({
				data: {
					code,
					typeId: input.typeId,
					name: input.name,
					shortName: input.shortName ?? input.name,
					voltage: input.voltage,
					serialNumber: input.serialNumber,
					accessories: input.accessories,
					owner: input.owner,
					labelApplied: input.labelApplied,
					purchaseCents: input.purchaseValueCents,
					replacementCents: input.replacementValueCents,
					notes: input.notes,
				},
			});
			await recordEvent(tx, {
				actor: deps.actor,
				action: "unit.created",
				entity: "Unit",
				entityId: unit.id,
				at: deps.clock(),
				payload: { code },
			});
			return unitOf(tx, code);
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw precondition("DUPLICATE", input.code ? [input.code] : []);
		}
		throw error;
	}
}

export async function updateUnit(
	deps: ServiceDeps,
	input: Input<typeof UpdateUnitInput>,
): Promise<Unit> {
	const {
		code,
		dailyPriceCents,
		depositCents,
		purchaseValueCents,
		replacementValueCents,
		shortName,
		...changes
	} = input;
	return inTransaction(deps.db, async (tx) => {
		const unitId = await lockUnit(tx, code);
		const current = await tx.unit.findUniqueOrThrow({ where: { id: unitId } });
		const unit = await tx.unit.update({
			where: { id: unitId },
			data: defined({
				...changes,
				shortName:
					shortName === null ? (changes.name ?? current.name) : shortName,
				purchaseCents: purchaseValueCents,
				replacementCents: replacementValueCents,
			}),
		});
		const priceChanges = defined({ dailyPriceCents, depositCents });
		if (Object.keys(priceChanges).length > 0) {
			await tx.equipmentType.update({
				where: { id: unit.typeId },
				data: priceChanges,
			});
		}
		await recordEvent(tx, {
			actor: deps.actor,
			action: "unit.updated",
			entity: "Unit",
			entityId: unitId,
			at: deps.clock(),
			payload: input,
		});
		return unitOf(tx, code);
	});
}

export async function closeOpenOrders(
	tx: Transaction,
	unitId: string,
	now: Date,
): Promise<void> {
	await tx.maintenanceOrder.updateMany({
		where: { unitId, status: { not: "DONE" } },
		data: { status: "DONE", completedAt: now },
	});
}

export async function moveUnitStatus(
	tx: Transaction,
	unitId: string,
	to: UnitStatus,
	reason: string | null = null,
): Promise<UnitStatus> {
	const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId } });
	assertUnitTransition(unit.status, to);
	await tx.unit.update({
		where: { id: unitId },
		data: { status: to, statusReason: reason },
	});
	return unit.status;
}

export async function changeUnitStatus(
	deps: ServiceDeps,
	input: Input<typeof ChangeUnitStatusInput>,
): Promise<Unit> {
	const reason = input.reason?.trim() || null;
	return inTransaction(deps.db, async (tx) => {
		const unitId = await lockUnit(tx, input.code);
		if (unitStatusMachine.requiresReason(input.to) && !reason) {
			throw precondition("REASON_REQUIRED", [input.to]);
		}
		const leaving = await moveUnitStatus(tx, unitId, input.to, reason);
		if (leaving === "IN_INSPECTION" || leaving === "IN_MAINTENANCE") {
			await closeOpenOrders(tx, unitId, deps.clock());
		}
		await recordEvent(tx, {
			actor: deps.actor,
			action: "unit.statusChanged",
			entity: "Unit",
			entityId: unitId,
			at: deps.clock(),
			payload: { from: leaving, to: input.to, reason },
		});
		return unitOf(tx, input.code);
	});
}

export async function addUnitPhoto(
	deps: ServiceDeps,
	input: { code: string; slot: UnitPhoto["slot"]; fileKey: string },
): Promise<UnitPhoto> {
	return inTransaction(deps.db, async (tx) => {
		const unitId = await lockUnit(tx, input.code);
		await requireUsableFile(tx, deps.actor.id, input.fileKey, ["UNIT_PHOTO"]);
		await tx.unitPhoto.upsert({
			where: { unitId_slot: { unitId, slot: input.slot } },
			update: { fileKey: input.fileKey },
			create: { unitId, slot: input.slot, fileKey: input.fileKey },
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action: "unit.photoAdded",
			entity: "Unit",
			entityId: unitId,
			at: deps.clock(),
			payload: { slot: input.slot, fileKey: input.fileKey },
		});
		const snapshot = await loadSnapshot(tx);
		return { slot: input.slot, file: fileRefOf(snapshot, input.fileKey) };
	});
}

export async function addKnownDamage(
	deps: ServiceDeps,
	input: Input<typeof AddKnownDamageInput>,
): Promise<KnownDamage> {
	return inTransaction(deps.db, async (tx) => {
		const unitId = await lockUnit(tx, input.code);
		if (input.fileKey) {
			await requireUsableFile(tx, deps.actor.id, input.fileKey, [
				"DAMAGE_PHOTO",
			]);
		}
		const damage = await tx.knownDamage.create({
			data: {
				unitId,
				description: input.description,
				fileKey: input.fileKey,
				recordedById: deps.actor.id,
				recordedByName: deps.actor.name,
				recordedAt: deps.clock(),
			},
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action: "unit.damageRecorded",
			entity: "Unit",
			entityId: unitId,
			at: deps.clock(),
			payload: { damageId: damage.id, description: input.description },
		});
		const snapshot = await loadSnapshot(tx);
		return damageView(snapshot, {
			id: damage.id,
			description: damage.description,
			recordedAt: damage.recordedAt.toISOString(),
			recordedBy: damage.recordedByName,
			fileKey: damage.fileKey,
		});
	});
}

export async function listLots(deps: ServiceDeps): Promise<Lot[]> {
	const snapshot = await loadSnapshot(deps.db, {
		rentals: HOLDING_RENTALS,
		activeCatalogOnly: true,
	});
	return snapshot.lots.map((lot) => lotView(snapshot, lot, deps.clock()));
}

export async function updateLot(
	deps: ServiceDeps,
	input: Input<typeof UpdateLotInput>,
): Promise<Lot> {
	const { id, ...changes } = input;
	requireUuid("lot", id);
	return inTransaction(deps.db, async (tx) => {
		const before = await tx.lot.findUnique({ where: { id } });
		if (!before) throw notFound("lot", id);
		await tx.lot.update({ where: { id }, data: defined(changes) });
		await recordEvent(tx, {
			actor: deps.actor,
			action: "lot.updated",
			entity: "Lot",
			entityId: id,
			at: deps.clock(),
			payload: { changes },
		});
		const snapshot = await loadSnapshot(tx, { rentals: HOLDING_RENTALS });
		const lot = snapshot.lots.find((entry) => entry.id === id);
		if (!lot) throw notFound("lot", id);
		return lotView(snapshot, lot, deps.clock());
	});
}
