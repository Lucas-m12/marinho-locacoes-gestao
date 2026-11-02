import type { ConflictingItem, FileRef, Lot } from "@marinho-gestao/contract";
import {
	availableLotQuantity,
	endOfZonedDay,
	findBookingConflicts,
	firstFreeFrom,
	holdsBooking,
	isUnitAvailable,
	startOfZonedDay,
	toMs,
} from "@marinho-gestao/domain";
import { notFound } from "./errors";
import type {
	LotRecord,
	MaintenanceRecord,
	RentalRecord,
	Snapshot,
	TypeRecord,
	UnitRecord,
} from "./records";

export type Booking = {
	start: string;
	end: string;
	quantity: number;
	rental: RentalRecord;
};

export function requireUnit(db: Snapshot, code: string): UnitRecord {
	const unit = db.units.find((entry) => entry.code === code);
	if (!unit) throw notFound("unit", code);
	return unit;
}

export function requireLot(db: Snapshot, code: string): LotRecord {
	const lot = db.lots.find((entry) => entry.code === code);
	if (!lot) throw notFound("lot", code);
	return lot;
}

export function requireType(db: Snapshot, id: string): TypeRecord {
	const type = db.types.find((entry) => entry.id === id);
	if (!type) throw notFound("type", id);
	return type;
}

export function requireRental(db: Snapshot, number: string): RentalRecord {
	const rental = db.rentals.find((entry) => entry.number === number);
	if (!rental) throw notFound("rental", number);
	return rental;
}

export function bookingsFor(
	db: Snapshot,
	code: string,
	now: Date,
	excludeRental?: string,
): Booking[] {
	return db.rentals.flatMap((rental) => {
		if (!holdsBooking(rental.status) || rental.number === excludeRental) {
			return [];
		}
		const item = rental.items.find(
			(entry) => entry.code === code && entry.returnDoneAt === null,
		);
		if (!item) return [];
		const overdue =
			rental.status === "ON_SITE" && toMs(rental.endAt) < now.getTime();
		return [
			{
				start: rental.startAt,
				end: overdue ? now.toISOString() : rental.endAt,
				quantity: item.quantity,
				rental,
			},
		];
	});
}

export function openOrderFor(
	db: Snapshot,
	code: string,
): MaintenanceRecord | null {
	return (
		db.maintenance.find(
			(order) => order.unitCode === code && order.status !== "DONE",
		) ?? null
	);
}

type RequestedItem = {
	kind: "UNIT" | "LOT";
	code: string;
	quantity: number;
};

function unitConflict(
	db: Snapshot,
	item: RequestedItem,
	start: string,
	end: string,
	now: Date,
	excludeRental?: string,
): ConflictingItem | null {
	const unit = requireUnit(db, item.code);
	const type = requireType(db, unit.typeId);
	const bookings = bookingsFor(db, item.code, now, excludeRental);
	const order = openOrderFor(db, item.code);
	const available = isUnitAvailable({
		unit,
		start,
		end,
		bookings,
		maintenance: order ? { expectedBackAt: order.expectedBackAt } : null,
		turnaroundHours: type.turnaroundHours,
	});
	if (available) return null;

	const conflicts = findBookingConflicts({
		start,
		end,
		bookings,
		turnaroundHours: type.turnaroundHours,
	});
	const first = conflicts[0];
	return {
		code: unit.code,
		name: unit.name,
		rentalNumber: first?.rental.number ?? null,
		freeFrom: first
			? firstFreeFrom({
					bookings,
					after: first.start,
					turnaroundHours: type.turnaroundHours,
				}).toISOString()
			: (order?.expectedBackAt ?? null),
		requestedQuantity: null,
		freeQuantity: null,
	};
}

function lotConflict(
	db: Snapshot,
	item: RequestedItem,
	start: string,
	end: string,
	now: Date,
	excludeRental?: string,
): ConflictingItem | null {
	const lot = requireLot(db, item.code);
	const bookings = bookingsFor(db, item.code, now, excludeRental);
	const free = availableLotQuantity({
		total: lot.total,
		inMaintenance: lot.inMaintenance,
		retired: lot.retired,
		bookings,
		start,
		end,
		turnaroundHours: lot.turnaroundHours,
	});
	if (free >= item.quantity) return null;
	return {
		code: lot.code,
		name: lot.name,
		rentalNumber: bookings[0]?.rental.number ?? null,
		freeFrom: null,
		requestedQuantity: item.quantity,
		freeQuantity: free,
	};
}

export function findConflicts(
	db: Snapshot,
	items: readonly RequestedItem[],
	start: string,
	end: string,
	now: Date,
	excludeRental?: string,
): ConflictingItem[] {
	return items.flatMap((item) => {
		const found =
			item.kind === "UNIT"
				? unitConflict(db, item, start, end, now, excludeRental)
				: lotConflict(db, item, start, end, now, excludeRental);
		return found ? [found] : [];
	});
}

export function fileRefOf(db: Snapshot, fileKey: string): FileRef {
	return (
		db.files[fileKey] ?? {
			fileKey,
			contentType: "image/svg+xml",
			sizeBytes: 0,
			uploadedAt: new Date(0).toISOString(),
		}
	);
}

export function lotView(db: Snapshot, lot: LotRecord, now: Date): Lot {
	const bookings = bookingsFor(db, lot.code, now);
	const usable = lot.total - lot.inMaintenance - lot.retired;
	const freeToday = availableLotQuantity({
		total: lot.total,
		inMaintenance: lot.inMaintenance,
		retired: lot.retired,
		bookings,
		start: startOfZonedDay(now),
		end: endOfZonedDay(now),
	});
	const next = bookings
		.filter((booking) => toMs(booking.start) > now.getTime())
		.sort((a, b) => toMs(a.start) - toMs(b.start))[0];
	return {
		id: lot.id,
		code: lot.code,
		name: lot.name,
		nicknames: lot.nicknames,
		pricing: lot.pricing,
		total: lot.total,
		inMaintenance: lot.inMaintenance,
		retired: lot.retired,
		dailyPriceCents: lot.dailyPriceCents,
		depositCents: lot.depositCents,
		kitComposition: lot.kitComposition,
		assetCode: lot.assetCode,
		turnaroundHours: lot.turnaroundHours,
		checklist: lot.checklist,
		freeToday,
		reservedToday: usable - freeToday,
		nextBooking: next
			? {
					rentalNumber: next.rental.number,
					startAt: next.start,
					displayStatus: next.rental.status,
					quantity: next.quantity,
				}
			: null,
	};
}
