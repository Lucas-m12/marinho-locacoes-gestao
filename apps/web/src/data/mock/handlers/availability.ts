import type {
	AvailabilityBlock,
	AvailabilityResult,
	CalendarCell,
	CalendarRow,
} from "@marinho-gestao/contract";
import {
	addCalendarDays,
	availableLotQuantity,
	calendarDay,
	countDailies,
	findBookingConflicts,
	firstFreeFrom,
	isBookable,
	isUnitAvailable,
	matchesSearch,
	toMs,
	zonedTimeToIso,
} from "@marinho-gestao/domain";
import { api, requireUser } from "../base";
import { mockNow } from "../clock";
import { getDb, type LotRecord, type MockDb, type UnitRecord } from "../db";
import {
	type Booking,
	bookingsFor,
	openOrderFor,
	requireType,
} from "../queries";

function splitQuery(query: string | undefined): string[] {
	return (query ?? "")
		.split(/\s+ou\s+|,/i)
		.map((part) => part.trim())
		.filter(Boolean);
}

function matchesAny(terms: string[], haystack: (string | null)[]): boolean {
	return (
		terms.length === 0 || terms.some((term) => matchesSearch(term, haystack))
	);
}

function blockOf(booking: Booking, now: Date): AvailabilityBlock {
	if (booking.rental.status === "AWAITING_DEPOSIT") return "AWAITING_DEPOSIT";
	if (booking.rental.status !== "ON_SITE") return "RESERVED";
	return toMs(booking.rental.endAt) < now.getTime() ? "OVERDUE" : "RENTED";
}

function customerName(db: MockDb, id: string): string {
	return db.customers.find((entry) => entry.id === id)?.name ?? "Cliente";
}

function unitResult(
	db: MockDb,
	unit: UnitRecord,
	start: string,
	end: string,
	dailies: number,
	now: Date,
): AvailabilityResult {
	const type = requireType(db, unit.typeId);
	const bookings = bookingsFor(db, unit.code, now);
	const order = openOrderFor(db, unit.code);
	const available = isUnitAvailable({
		unit,
		start,
		end,
		bookings,
		maintenance: order ? { expectedBackAt: order.expectedBackAt } : null,
		turnaroundHours: type.turnaroundHours,
	});
	const conflict = findBookingConflicts({
		start,
		end,
		bookings,
		turnaroundHours: type.turnaroundHours,
	})[0];

	const statusBlock = (): AvailabilityBlock | null => {
		if (unit.status === "IN_MAINTENANCE") return "MAINTENANCE";
		if (!isBookable(unit.status)) {
			return unit.status as AvailabilityBlock;
		}
		return null;
	};

	return {
		kind: "UNIT",
		code: unit.code,
		name: unit.name,
		description: type.description,
		typeId: type.id,
		available,
		dailyPriceCents: type.dailyPriceCents,
		depositCents: type.depositCents,
		perPiece: false,
		periodTotalCents:
			type.dailyPriceCents === null ? null : type.dailyPriceCents * dailies,
		totalQuantity: null,
		freeQuantity: null,
		block: available ? null : conflict ? blockOf(conflict, now) : statusBlock(),
		blockingRental:
			!available && conflict
				? {
						number: conflict.rental.number,
						customerName: customerName(db, conflict.rental.customerId),
						endAt: conflict.rental.endAt,
						status: conflict.rental.status,
					}
				: null,
		freeFrom: available
			? null
			: conflict
				? firstFreeFrom({
						bookings,
						after: conflict.start,
						turnaroundHours: type.turnaroundHours,
					}).toISOString()
				: (order?.expectedBackAt ?? null),
	};
}

function lotResult(
	db: MockDb,
	lot: LotRecord,
	start: string,
	end: string,
	dailies: number,
	now: Date,
): AvailabilityResult {
	const bookings = bookingsFor(db, lot.code, now);
	const free = availableLotQuantity({
		total: lot.total,
		inMaintenance: lot.inMaintenance,
		retired: lot.retired,
		bookings,
		start,
		end,
		turnaroundHours: lot.turnaroundHours,
	});
	const available = free > 0;
	const blocking = bookings[0];
	return {
		kind: "LOT",
		code: lot.code,
		name: lot.name,
		description: lot.pricing === "PER_PIECE" ? "Contado por peça" : null,
		typeId: null,
		available,
		dailyPriceCents: lot.dailyPriceCents,
		depositCents: lot.depositCents,
		perPiece: lot.pricing === "PER_PIECE",
		periodTotalCents:
			lot.dailyPriceCents === null ? null : lot.dailyPriceCents * dailies,
		totalQuantity: lot.total,
		freeQuantity: free,
		block: available ? null : "NO_PIECES",
		blockingRental:
			!available && blocking
				? {
						number: blocking.rental.number,
						customerName: customerName(db, blocking.rental.customerId),
						endAt: blocking.rental.endAt,
						status: blocking.rental.status,
					}
				: null,
		freeFrom: null,
	};
}

function coveringBooking(bookings: Booking[], day: string): Booking | null {
	return (
		bookings.find(
			(booking) =>
				calendarDay(booking.start) <= day && day <= calendarDay(booking.end),
		) ?? null
	);
}

function unitCell(
	unit: UnitRecord,
	bookings: Booking[],
	expectedBackDay: string | null,
	day: string,
	today: string,
): CalendarCell {
	const empty = { date: day, rentalNumber: null, freeQuantity: null };

	if (!isBookable(unit.status)) {
		return { ...empty, state: "BLOCKED" };
	}
	if (unit.status === "IN_MAINTENANCE") {
		if (!expectedBackDay || day <= expectedBackDay) {
			return { ...empty, state: "MAINTENANCE" };
		}
	}
	if (unit.status === "IN_INSPECTION" && day === today) {
		return { ...empty, state: "INSPECTION" };
	}

	const booking = coveringBooking(bookings, day);
	if (!booking) return { ...empty, state: "FREE" };

	const { rental } = booking;
	const base = { ...empty, rentalNumber: rental.number };
	if (rental.status === "AWAITING_DEPOSIT") {
		return { ...base, state: "AWAITING_DEPOSIT" };
	}
	if (rental.status === "ON_SITE") {
		const overdue = calendarDay(rental.endAt) < today;
		return { ...base, state: overdue && day === today ? "OVERDUE" : "RENTED" };
	}
	if (rental.status === "SEPARATED" || unit.status === "SEPARATED") {
		return { ...base, state: "RENTED" };
	}
	return { ...base, state: "RESERVED" };
}

function lotCell(
	lot: LotRecord,
	bookings: Booking[],
	day: string,
): CalendarCell {
	const start = zonedTimeToIso(day, "00:00");
	const end = zonedTimeToIso(addCalendarDays(day, 1), "00:00");
	const free = availableLotQuantity({
		total: lot.total,
		inMaintenance: lot.inMaintenance,
		retired: lot.retired,
		bookings,
		start,
		end,
	});
	const cell = {
		date: day,
		rentalNumber: null,
		freeQuantity: free,
	};
	if (free > 0) return { ...cell, state: "FREE" };

	const covering = bookings.filter(
		(booking) =>
			calendarDay(booking.start) <= day && day <= calendarDay(booking.end),
	);
	const last = covering[covering.length - 1];
	const awaiting = covering.some(
		(booking) => booking.rental.status === "AWAITING_DEPOSIT",
	);
	return {
		...cell,
		rentalNumber: last?.rental.number ?? null,
		state: awaiting ? "AWAITING_DEPOSIT" : "RESERVED",
	};
}

export const availability = {
	search: api.availability.search.handler(({ context, input }) => {
		requireUser(context);
		const db = getDb();
		const now = mockNow();
		const { start, end } = input;
		const dailies = countDailies(start, end);
		const terms = splitQuery(input.query);

		const units = db.units
			.filter((unit) => unit.status !== "RETIRED")
			.filter((unit) => !input.typeId || unit.typeId === input.typeId)
			.filter((unit) => {
				const type = requireType(db, unit.typeId);
				return matchesAny(terms, [
					unit.code,
					unit.name,
					type.name,
					type.description,
					...type.nicknames,
				]);
			})
			.map((unit) => unitResult(db, unit, start, end, dailies, now));

		const lots = db.lots
			.filter(() => !input.typeId)
			.filter((lot) =>
				matchesAny(terms, [lot.code, lot.name, ...lot.nicknames]),
			)
			.map((lot) => lotResult(db, lot, start, end, dailies, now));

		return { start, end, dailies, results: [...units, ...lots] };
	}),

	calendar: api.availability.calendar.handler(({ context, input }) => {
		requireUser(context);
		const db = getDb();
		const now = mockNow();
		const today = calendarDay(now);
		const days = Array.from({ length: input.days }, (_, index) =>
			addCalendarDays(input.start, index),
		);

		const unitRows: CalendarRow[] = db.units
			.filter((unit) => unit.status !== "RETIRED")
			.map((unit) => {
				const bookings = bookingsFor(db, unit.code, now);
				const order = openOrderFor(db, unit.code);
				const expectedBackDay = order?.expectedBackAt
					? calendarDay(order.expectedBackAt)
					: null;
				return {
					kind: "UNIT",
					code: unit.code,
					label: unit.code,
					name: unit.shortName,
					perPiece: false,
					totalQuantity: null,
					cells: days.map((day) =>
						unitCell(unit, bookings, expectedBackDay, day, today),
					),
				};
			});

		const lotRows: CalendarRow[] = db.lots.map((lot) => {
			const bookings = bookingsFor(db, lot.code, now);
			const perPiece = lot.pricing === "PER_PIECE";
			return {
				kind: "LOT",
				code: lot.code,
				label: lot.name,
				name: perPiece ? `${lot.total} peças` : "reboque",
				perPiece,
				totalQuantity: lot.total,
				cells: days.map((day) => lotCell(lot, bookings, day)),
			};
		});

		return { days, rows: [...unitRows, ...lotRows] };
	}),
};
