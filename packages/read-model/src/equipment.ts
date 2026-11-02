import type {
	ChecklistTemplateItem,
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
	signedAmountCents,
	sumCents,
	toMs,
	unitStatusMachine,
} from "@marinho-gestao/domain";
import { invalidTransition } from "./errors";
import { bookingsFor, fileRefOf, openOrderFor, requireType } from "./queries";
import type {
	KnownDamageRecord,
	MaintenanceRecord,
	Snapshot,
	TypeRecord,
	UnitRecord,
} from "./records";
import { rentalTotalCents } from "./rental-money";

export function typeView(db: Snapshot, type: TypeRecord): EquipmentType {
	return {
		...type,
		unitCount: db.units.filter((unit) => unit.typeId === type.id).length,
	};
}

export function unitView(db: Snapshot, unit: UnitRecord): Unit {
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

function locationOf(db: Snapshot, unit: UnitRecord, now: Date): UnitLocation {
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

export function unitListItem(
	db: Snapshot,
	unit: UnitRecord,
	now: Date,
): UnitListItem {
	return { ...unitView(db, unit), location: locationOf(db, unit, now) };
}

export function damageView(
	db: Snapshot,
	damage: KnownDamageRecord,
): KnownDamage {
	return {
		id: damage.id,
		description: damage.description,
		recordedAt: damage.recordedAt,
		recordedBy: damage.recordedBy,
		photo: damage.fileKey ? fileRefOf(db, damage.fileKey) : null,
	};
}

export function knownDamagesOf(db: Snapshot, unit: UnitRecord): KnownDamage[] {
	return unit.knownDamages.map((damage) => damageView(db, damage));
}

export function unitDetail(
	db: Snapshot,
	unit: UnitRecord,
	now: Date,
): UnitDetail {
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
					.map(signedAmountCents),
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

export function openOrdersOf(db: Snapshot, code: string): MaintenanceRecord[] {
	return db.maintenance.filter(
		(order) => order.unitCode === code && order.status !== "DONE",
	);
}

export function assertUnitTransition(
	from: UnitRecord["status"],
	to: UnitRecord["status"],
): void {
	if (!unitStatusMachine.canTransition(from, to)) {
		throw invalidTransition({
			entity: "UNIT",
			from,
			to,
			allowed: [...unitStatusMachine.allowedFrom(from)],
		});
	}
}

export function moveUnit(
	unit: UnitRecord,
	to: UnitRecord["status"],
	reason: string | null = null,
): void {
	assertUnitTransition(unit.status, to);
	unit.status = to;
	unit.statusReason = reason;
}

export function listUnits(
	db: Snapshot,
	input: { status?: UnitRecord["status"]; q?: string },
	now: Date,
) {
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
}

export const DEFAULT_CHECKLIST: readonly ChecklistTemplateItem[] = [
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
];
