import { addHours, type DateInput, toMs } from "./dates";
import type { UnitStatus } from "./enums";

export type Interval = { start: DateInput; end: DateInput };

export function overlaps(a: Interval, b: Interval): boolean {
	return toMs(a.start) < toMs(b.end) && toMs(b.start) < toMs(a.end);
}

export const UNAVAILABLE_UNIT_STATUSES: readonly UnitStatus[] = [
	"BLOCKED",
	"DAMAGED",
	"NOT_RETURNED",
	"RETIRED",
];

export function isBookable(status: UnitStatus): boolean {
	return !UNAVAILABLE_UNIT_STATUSES.includes(status);
}

export type UnitBooking = Interval;

function withTurnaround(interval: Interval, hours: number): Interval {
	return { start: interval.start, end: addHours(interval.end, hours) };
}

export function findBookingConflicts<T extends UnitBooking>(input: {
	start: DateInput;
	end: DateInput;
	bookings: readonly T[];
	turnaroundHours: number;
}): T[] {
	const requested = withTurnaround(input, input.turnaroundHours);
	return input.bookings.filter((booking) =>
		overlaps(requested, withTurnaround(booking, input.turnaroundHours)),
	);
}

export function isUnitAvailable(input: {
	unit: { status: UnitStatus };
	start: DateInput;
	end: DateInput;
	bookings: readonly UnitBooking[];
	maintenance: { expectedBackAt: DateInput | null } | null;
	turnaroundHours: number;
}): boolean {
	const { unit, maintenance } = input;
	if (!isBookable(unit.status)) return false;
	if (unit.status === "IN_MAINTENANCE") {
		const backAt = maintenance?.expectedBackAt;
		if (!backAt || toMs(backAt) >= toMs(input.start)) return false;
	}
	return findBookingConflicts(input).length === 0;
}

export function firstFreeFrom(input: {
	bookings: readonly UnitBooking[];
	after: DateInput;
	turnaroundHours: number;
}): Date {
	const ordered = [...input.bookings].sort(
		(a, b) => toMs(a.start) - toMs(b.start),
	);
	let cursor = toMs(input.after);
	for (const booking of ordered) {
		const busyUntil = addHours(booking.end, input.turnaroundHours).getTime();
		if (toMs(booking.start) <= cursor && busyUntil > cursor) {
			cursor = busyUntil;
		}
	}
	return new Date(cursor);
}

export type LotBooking = Interval & { quantity: number };

function peakConcurrentUse(
	bookings: readonly LotBooking[],
	window: Interval,
): number {
	const inWindow = bookings.filter((booking) => overlaps(booking, window));
	const events = inWindow.flatMap((booking) => [
		{
			at: Math.max(toMs(booking.start), toMs(window.start)),
			delta: booking.quantity,
		},
		{
			at: Math.min(toMs(booking.end), toMs(window.end)),
			delta: -booking.quantity,
		},
	]);
	events.sort((a, b) => a.at - b.at || a.delta - b.delta);

	let current = 0;
	let peak = 0;
	for (const event of events) {
		current += event.delta;
		peak = Math.max(peak, current);
	}
	return peak;
}

export function availableLotQuantity(input: {
	total: number;
	inMaintenance: number;
	retired: number;
	bookings: readonly LotBooking[];
	start: DateInput;
	end: DateInput;
	turnaroundHours?: number;
}): number {
	const turnaround = input.turnaroundHours ?? 0;
	const usable = input.total - input.inMaintenance - input.retired;
	const window = withTurnaround(input, turnaround);
	const bookings = input.bookings.map((booking) => ({
		...booking,
		...withTurnaround(booking, turnaround),
	}));
	return Math.max(0, usable - peakConcurrentUse(bookings, window));
}
