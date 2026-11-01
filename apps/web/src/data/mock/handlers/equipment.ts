import type {
	EquipmentType,
	KnownDamage,
	Unit,
	UnitDetail,
	UnitListItem,
	UnitLocation,
} from "@marinho-gestao/contract";
import {
	countDailies,
	matchesSearch,
	nextCode,
	sumCents,
	toMs,
	unitStatusMachine,
} from "@marinho-gestao/domain";
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
import { invalidTransition, notFound, precondition } from "../errors";
import {
	bookingsFor,
	fileRefOf,
	lotView,
	openOrderFor,
	requireType,
	requireUnit,
} from "../queries";
import { rentalTotalCents } from "../rental-money";

function typeView(db: MockDb, type: TypeRecord): EquipmentType {
	return {
		...type,
		unitCount: db.units.filter((unit) => unit.typeId === type.id).length,
	};
}

export function unitView(db: MockDb, unit: UnitRecord): Unit {
	const type = requireType(db, unit.typeId);
	return {
		id: unit.id,
		code: unit.code,
		typeId: unit.typeId,
		typeName: type.name,
		name: unit.name,
		shortName: unit.shortName,
		status: unit.status,
		statusReason: unit.statusReason,
		dailyPriceCents: type.dailyPriceCents,
		depositCents: type.depositCents,
		voltage: unit.voltage,
		serialNumber: unit.serialNumber,
		accessories: unit.accessories ?? type.accessories,
		owner: unit.owner,
		labelApplied: unit.labelApplied,
		purchaseValueCents: unit.purchaseValueCents,
		replacementValueCents: unit.replacementValueCents,
		notes: unit.notes,
		nicknames: type.nicknames,
	};
}

function locationOf(db: MockDb, unit: UnitRecord, now: Date): UnitLocation {
	const bookings = bookingsFor(db, unit.code, now).sort(
		(a, b) => toMs(a.start) - toMs(b.start),
	);

	if (unit.status === "RENTED") {
		const current = bookings.find(
			(booking) => booking.rental.status === "ON_SITE",
		);
		if (current) {
			const customer = db.customers.find(
				(entry) => entry.id === current.rental.customerId,
			);
			return {
				kind: "WITH_CUSTOMER",
				rentalNumber: current.rental.number,
				customerName: customer?.name ?? "Cliente",
				dueAt: current.rental.endAt,
				overdue: toMs(current.rental.endAt) < now.getTime(),
			};
		}
	}
	if (unit.status === "IN_MAINTENANCE") {
		const order = openOrderFor(db, unit.code);
		return {
			kind: "IN_MAINTENANCE",
			reason: order?.reason ?? unit.statusReason ?? "Manutenção",
			expectedBackAt: order?.expectedBackAt ?? null,
		};
	}
	if (unit.status === "IN_INSPECTION") {
		return { kind: "IN_INSPECTION", returnedAt: unit.returnedAt };
	}
	if (unit.status !== "AVAILABLE" && unit.status !== "SEPARATED") {
		return { kind: "OTHER", reason: unit.statusReason };
	}

	const next = bookings[0];
	if (!next) return { kind: "BASE" };
	if (next.rental.status === "AWAITING_DEPOSIT") {
		return {
			kind: "QUOTED",
			rentalNumber: next.rental.number,
			startAt: next.rental.startAt,
			endAt: next.rental.endAt,
		};
	}
	return {
		kind: "LEAVING",
		rentalNumber: next.rental.number,
		startAt: next.rental.startAt,
	};
}

function unitListItem(db: MockDb, unit: UnitRecord, now: Date): UnitListItem {
	return { ...unitView(db, unit), location: locationOf(db, unit, now) };
}

function damageView(db: MockDb, damage: KnownDamageRecord): KnownDamage {
	return {
		id: damage.id,
		description: damage.description,
		recordedAt: damage.recordedAt,
		recordedBy: damage.recordedBy,
		photo: damage.fileKey ? fileRefOf(db, damage.fileKey) : null,
	};
}

export function knownDamagesOf(db: MockDb, unit: UnitRecord): KnownDamage[] {
	return unit.knownDamages.map((damage) => damageView(db, damage));
}

function unitDetail(db: MockDb, unit: UnitRecord, now: Date): UnitDetail {
	const related = db.rentals
		.filter((rental) => rental.items.some((item) => item.code === unit.code))
		.filter(
			(rental) => !["QUOTE", "CANCELED", "EXPIRED"].includes(rental.status),
		)
		.sort((a, b) => toMs(b.startAt) - toMs(a.startAt));
	const finished = related.filter(
		(rental) => rental.status === "CLOSED" || rental.status === "RETURNED",
	);

	return {
		...unitListItem(db, unit, now),
		photos: unit.photos.map((photo) => ({
			slot: photo.slot,
			file: fileRefOf(db, photo.fileKey),
		})),
		knownDamages: knownDamagesOf(db, unit),
		allowedTransitions: [...unitStatusMachine.allowedFrom(unit.status)],
		stats: {
			rentalCount: finished.length,
			rentedDays: sumCents(
				finished.map((rental) => countDailies(rental.startAt, rental.endAt)),
			),
			revenueCents: sumCents(
				finished.map((rental) => {
					const item = rental.items.find((entry) => entry.code === unit.code);
					return (
						(item?.frozenDailyPriceCents ?? 0) *
						(item?.quantity ?? 1) *
						countDailies(rental.startAt, rental.endAt)
					);
				}),
			),
			maintenanceCents: sumCents(
				db.ledger
					.filter(
						(entry) =>
							entry.unitCode === unit.code && entry.category === "MAINTENANCE",
					)
					.map((entry) => entry.amountCents),
			),
		},
		rentals: related.map((rental) => ({
			number: rental.number,
			customerName:
				db.customers.find((entry) => entry.id === rental.customerId)?.name ??
				"Cliente",
			startAt: rental.startAt,
			endAt: rental.endAt,
			valueCents: rentalTotalCents(db, rental),
			displayStatus: rental.status,
		})),
	};
}

export function closeOpenOrders(db: MockDb, code: string, now: Date): void {
	for (const order of db.maintenance) {
		if (order.unitCode === code && order.status !== "DONE") {
			order.status = "DONE";
			order.completedAt = now.toISOString();
		}
	}
}

export function moveUnit(
	unit: UnitRecord,
	to: UnitRecord["status"],
	reason: string | null = null,
): void {
	if (!unitStatusMachine.canTransition(unit.status, to)) {
		throw invalidTransition({
			entity: "UNIT",
			from: unit.status,
			to,
			allowed: [...unitStatusMachine.allowedFrom(unit.status)],
		});
	}
	unit.status = to;
	unit.statusReason = reason;
}

export const equipment = {
	listTypes: api.equipment.listTypes.handler(({ context }) => {
		requireUser(context);
		const db = getDb();
		return db.types.map((type) => typeView(db, type));
	}),

	listUnits: api.equipment.listUnits.handler(({ context, input }) => {
		requirePermission(context, "units:read");
		const db = getDb();
		const now = mockNow();
		const matching = db.units.filter((unit) => {
			const type = requireType(db, unit.typeId);
			return matchesSearch(input.q ?? "", [
				unit.code,
				unit.name,
				type.name,
				...type.nicknames,
			]);
		});
		const counts: Record<string, number> = {};
		for (const unit of matching) {
			counts[unit.status] = (counts[unit.status] ?? 0) + 1;
		}
		return {
			units: matching
				.filter((unit) => !input.status || unit.status === input.status)
				.map((unit) => unitListItem(db, unit, now)),
			counts,
			total: matching.length,
		};
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
			checklist: [
				{
					id: "liga",
					label: "Liga e funciona",
					note: "Testado na frente do cliente",
					occurrenceKind: "DAMAGE",
				},
				{
					id: "carcaca",
					label: "Carcaça",
					note: "Sem trinca ou peça solta",
					occurrenceKind: "DAMAGE",
				},
				{
					id: "acessorios",
					label: "Acessórios",
					note: "Conferidos",
					occurrenceKind: "MISSING_PART",
				},
				{
					id: "limpo",
					label: "Limpo",
					note: "Sem pó ou massa",
					occurrenceKind: "DIRT",
				},
			],
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
		const { code: _code, dailyPriceCents, depositCents, ...changes } = input;
		Object.assign(
			unit,
			Object.fromEntries(
				Object.entries(changes).filter(([, value]) => value !== undefined),
			),
		);
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
		requirePermission(context, "units:operate");
		const db = getDb();
		const unit = requireUnit(db, input.code);
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
