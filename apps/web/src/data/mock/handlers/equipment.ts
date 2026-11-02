import { nextCode, unitStatusMachine } from "@marinho-gestao/domain";
import {
	DEFAULT_CHECKLIST,
	damageView,
	fileRefOf,
	listUnits,
	lotView,
	moveUnit,
	notFound,
	openOrdersOf,
	precondition,
	requireType,
	requireUnit,
	typeView,
	unitDetail,
	unitView,
} from "@marinho-gestao/read-model";
import { api, requirePermission, requireUser } from "../base";
import { mockNow } from "../clock";
import {
	getDb,
	type KnownDamageRecord,
	type MockDb,
	nextId,
	type TypeRecord,
	type UnitRecord,
} from "../db";
import { requireUsableFile } from "../files";

export function closeOpenOrders(db: MockDb, code: string, now: Date): void {
	for (const order of openOrdersOf(db, code)) {
		order.status = "DONE";
		order.completedAt = now.toISOString();
	}
}

export const equipment = {
	listTypes: api.equipment.listTypes.handler(({ context }) => {
		requireUser(context);
		const db = getDb();
		return db.types.map((type) => typeView(db, type));
	}),

	listUnits: api.equipment.listUnits.handler(({ context, input }) => {
		requirePermission(context, "units:read");
		return listUnits(getDb(), input, mockNow());
	}),

	getUnit: api.equipment.getUnit.handler(({ context, input }) => {
		requirePermission(context, "units:read");
		const db = getDb();
		return unitDetail(db, requireUnit(db, input.code), mockNow());
	}),

	createType: api.equipment.createType.handler(({ context, input }) => {
		requirePermission(context, "catalog:manage");
		const db = getDb();
		const type: TypeRecord = {
			id: nextId(db, "t"),
			name: input.name,
			nicknames: input.nicknames,
			description: input.description,
			dailyPriceCents: input.dailyPriceCents,
			depositCents: input.depositCents,
			turnaroundHours: input.turnaroundHours,
			accessories: input.accessories,
			checklist: DEFAULT_CHECKLIST.map((item) => ({ ...item })),
		};
		db.types.push(type);
		return typeView(db, type);
	}),

	updateType: api.equipment.updateType.handler(({ context, input }) => {
		requirePermission(context, "catalog:manage");
		const db = getDb();
		const type = requireType(db, input.id);
		const { id: _id, ...changes } = input;
		Object.assign(
			type,
			Object.fromEntries(
				Object.entries(changes).filter(([, value]) => value !== undefined),
			),
		);
		return typeView(db, type);
	}),

	createUnit: api.equipment.createUnit.handler(({ context, input }) => {
		requirePermission(context, "catalog:manage");
		const db = getDb();
		requireType(db, input.typeId);
		const code =
			input.code ??
			nextCode(
				"MAR",
				db.units.map((unit) => unit.code),
			);
		if (db.units.some((unit) => unit.code === code)) {
			throw precondition("DUPLICATE", [code]);
		}
		const unit: UnitRecord = {
			id: nextId(db, "u"),
			code,
			typeId: input.typeId,
			name: input.name,
			shortName: input.shortName ?? input.name,
			status: "AVAILABLE",
			statusReason: null,
			voltage: input.voltage,
			serialNumber: input.serialNumber,
			accessories: input.accessories,
			owner: input.owner,
			labelApplied: input.labelApplied,
			purchaseValueCents: input.purchaseValueCents,
			replacementValueCents: input.replacementValueCents,
			notes: input.notes,
			returnedAt: null,
			photos: [],
			knownDamages: [],
		};
		db.units.push(unit);
		return unitView(db, unit);
	}),

	updateUnit: api.equipment.updateUnit.handler(({ context, input }) => {
		requirePermission(context, "catalog:manage");
		const db = getDb();
		const unit = requireUnit(db, input.code);
		const {
			code: _code,
			dailyPriceCents,
			depositCents,
			shortName,
			...changes
		} = input;
		Object.assign(
			unit,
			Object.fromEntries(
				Object.entries(changes).filter(([, value]) => value !== undefined),
			),
		);
		if (shortName !== undefined) unit.shortName = shortName ?? unit.name;
		const type = requireType(db, unit.typeId);
		if (dailyPriceCents !== undefined) type.dailyPriceCents = dailyPriceCents;
		if (depositCents !== undefined) type.depositCents = depositCents;
		return unitView(db, unit);
	}),

	changeUnitStatus: api.equipment.changeUnitStatus.handler(
		({ context, input }) => {
			requirePermission(context, "units:operate");
			const db = getDb();
			const unit = requireUnit(db, input.code);
			const reason = input.reason?.trim() || null;
			if (unitStatusMachine.requiresReason(input.to) && !reason) {
				throw precondition("REASON_REQUIRED", [input.to]);
			}
			const leaving = unit.status;
			moveUnit(unit, input.to, reason);
			if (leaving === "IN_INSPECTION" || leaving === "IN_MAINTENANCE") {
				closeOpenOrders(db, unit.code, mockNow());
			}
			return unitView(db, unit);
		},
	),

	addUnitPhoto: api.equipment.addUnitPhoto.handler(({ context, input }) => {
		const user = requirePermission(context, "units:operate");
		const db = getDb();
		const unit = requireUnit(db, input.code);
		requireUsableFile(db, user.id, input.fileKey, ["UNIT_PHOTO"]);
		unit.photos = [
			...unit.photos.filter((photo) => photo.slot !== input.slot),
			{ slot: input.slot, fileKey: input.fileKey },
		];
		return { slot: input.slot, file: fileRefOf(db, input.fileKey) };
	}),

	addKnownDamage: api.equipment.addKnownDamage.handler(({ context, input }) => {
		const user = requirePermission(context, "units:operate");
		const db = getDb();
		const unit = requireUnit(db, input.code);
		if (input.fileKey) {
			requireUsableFile(db, user.id, input.fileKey, ["DAMAGE_PHOTO"]);
		}
		const damage: KnownDamageRecord = {
			id: nextId(db, "dano"),
			description: input.description,
			recordedAt: mockNow().toISOString(),
			recordedBy: user.name,
			fileKey: input.fileKey,
		};
		unit.knownDamages.push(damage);
		return damageView(db, damage);
	}),

	listLots: api.equipment.listLots.handler(({ context }) => {
		requireUser(context);
		const db = getDb();
		const now = mockNow();
		return db.lots.map((lot) => lotView(db, lot, now));
	}),

	updateLot: api.equipment.updateLot.handler(({ context, input }) => {
		requirePermission(context, "catalog:manage");
		const db = getDb();
		const lot = db.lots.find((entry) => entry.id === input.id);
		if (!lot) throw notFound("lot", input.id);
		const { id: _id, ...changes } = input;
		Object.assign(
			lot,
			Object.fromEntries(
				Object.entries(changes).filter(([, value]) => value !== undefined),
			),
		);
		return lotView(db, lot, mockNow());
	}),
};
