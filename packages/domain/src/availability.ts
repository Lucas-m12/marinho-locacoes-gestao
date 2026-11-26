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

function byStart(a: Interval, b: Interval): number {
	return toMs(a.start) - toMs(b.start);
}

/** Reservas que cruzam o período (com a folga), da que começa antes. */
export function findBookingConflicts<T extends UnitBooking>(input: {
	start: DateInput;
	end: DateInput;
	bookings: readonly T[];
	turnaroundHours: number;
}): T[] {
	const requested = withTurnaround(input, input.turnaroundHours);
	return input.bookings
		.filter((booking) =>
			overlaps(requested, withTurnaround(booking, input.turnaroundHours)),
		)
		.sort(byStart);
}

/**
 * Unidade fora da agenda na saída: status que não aluga, ou manutenção sem
 * previsão de volta antes da saída. Nesse caso não importa o que está marcado.
 */
export function isUnitOffSchedule(input: {
	unit: { status: UnitStatus };
	start: DateInput;
	maintenance: { expectedBackAt: DateInput | null } | null;
}): boolean {
	if (!isBookable(input.unit.status)) return true;
	if (input.unit.status !== "IN_MAINTENANCE") return false;
	const backAt = input.maintenance?.expectedBackAt;
	return !backAt || toMs(backAt) >= toMs(input.start);
}

export function isUnitAvailable(input: {
	unit: { status: UnitStatus };
	start: DateInput;
	end: DateInput;
	bookings: readonly UnitBooking[];
	maintenance: { expectedBackAt: DateInput | null } | null;
	turnaroundHours: number;
}): boolean {
	return !isUnitOffSchedule(input) && findBookingConflicts(input).length === 0;
}

/**
 * Reserva vista pelas janelas da agenda. `quantity` é o número de peças
 * (unidade: 1). `overdue` marca a locação na obra que já passou da devolução:
 * o fim dela é "agora", uma data que ninguém garante.
 */
export type ScheduledBooking = Interval & {
	quantity?: number;
	overdue?: boolean;
};

/**
 * Pedido de agenda. Para unidade, `usable` e `quantity` ficam em 1 (o padrão).
 * Para lote, `usable` é o total menos manutenção e aposentadas, e `quantity`
 * as peças pedidas. Assim a carrocinha, com uma peça, dá o mesmo que uma
 * unidade.
 */
export type ScheduleRequest<T extends ScheduledBooking> = {
	start: DateInput;
	end: DateInput;
	bookings: readonly T[];
	turnaroundHours: number;
	usable?: number;
	quantity?: number;
};

type Hold<T> = { start: number; end: number; quantity: number; booking: T };

const HOUR_MS = 3_600_000;

/** Cada reserva segura as peças da saída até a devolução mais a folga. */
function holdsOf<T extends ScheduledBooking>(
	bookings: readonly T[],
	turnaroundHours: number,
): Hold<T>[] {
	return bookings
		.map((booking) => ({
			start: toMs(booking.start),
			end: addHours(booking.end, turnaroundHours).getTime(),
			quantity: booking.quantity ?? 1,
			booking,
		}))
		.sort((a, b) => a.start - b.start);
}

function inUseAt<T>(holds: readonly Hold<T>[], at: number): number {
	let used = 0;
	for (const hold of holds) {
		if (hold.start <= at && at < hold.end) used += hold.quantity;
	}
	return used;
}

/** Primeiro instante em [from, until) em que as peças em uso passam de `limit`. */
function firstShortage<T>(
	holds: readonly Hold<T>[],
	from: number,
	until: number,
	limit: number,
): number | null {
	if (from >= until) return null;
	const moments = [
		from,
		...holds
			.map((hold) => hold.start)
			.filter((start) => start > from && start < until),
	];
	return moments.find((at) => inUseAt(holds, at) > limit) ?? null;
}

/** Peças que podem ficar ocupadas sem faltar para o pedido. */
function spareOf(request: { usable?: number; quantity?: number }): number {
	return (request.usable ?? 1) - (request.quantity ?? 1);
}

/**
 * A reserva que cruza o período e faz faltar peça; se mais de uma, a que
 * começa antes. `null` se o período está livre ou se o pedido passa do
 * estoque (aí nenhuma locação é a culpada).
 */
export function blockingBooking<T extends ScheduledBooking>(
	request: ScheduleRequest<T>,
): T | null {
	const spare = spareOf(request);
	if (spare < 0) return null;
	const holds = holdsOf(request.bookings, request.turnaroundHours);
	const shortage = firstShortage(
		holds,
		toMs(request.start),
		addHours(request.end, request.turnaroundHours).getTime(),
		spare,
	);
	if (shortage === null) return null;
	return (
		holds.find((hold) => hold.start <= shortage && shortage < hold.end)
			?.booking ?? null
	);
}

/**
 * Saindo em `start`, até quando dá para ficar: a saída da próxima reserva que
 * faz faltar peça, menos a folga. `null` se não dá para sair em `start` ou se
 * nada marcado depois atrapalha.
 */
export function freeUntil<T extends ScheduledBooking>(
	request: Omit<ScheduleRequest<T>, "end">,
): Date | null {
	const spare = spareOf(request);
	if (spare < 0) return null;
	const start = toMs(request.start);
	const holds = holdsOf(request.bookings, request.turnaroundHours);
	const shortage = firstShortage(holds, start, Number.POSITIVE_INFINITY, spare);
	if (shortage === null) return null;
	const until = shortage - request.turnaroundHours * HOUR_MS;
	return until > start ? new Date(until) : null;
}

/**
 * Primeiro horário, depois do conflito, em que a quantidade pedida fica livre:
 * o fim de uma reserva mais a folga, com as reservas encadeadas (inclusive a
 * que começa dentro da folga seguinte, que não deixaria sair). Locação
 * atrasada que ainda segura peças no conflito não tem volta garantida: se só
 * a volta dela liberaria, devolve `null`. Também `null` se o período está
 * livre.
 */
export function freeFrom<T extends ScheduledBooking>(
	request: ScheduleRequest<T>,
): Date | null {
	const spare = spareOf(request);
	if (spare < 0) return null;
	const turnaround = request.turnaroundHours * HOUR_MS;
	const holds = holdsOf(request.bookings, request.turnaroundHours);
	const shortage = firstShortage(
		holds,
		toMs(request.start),
		toMs(request.end) + turnaround,
		spare,
	);
	if (shortage === null) return null;

	const guaranteed = holds.map((hold) =>
		hold.booking.overdue && hold.end > shortage
			? { ...hold, end: Number.POSITIVE_INFINITY }
			: hold,
	);
	const releases = [...new Set(guaranteed.map((hold) => hold.end))]
		.filter((at) => Number.isFinite(at) && at >= shortage)
		.sort((a, b) => a - b);
	// Sair em `at` exige a quantidade livre também durante a folga seguinte.
	const departure = releases.find(
		(at) => firstShortage(guaranteed, at, at + turnaround + 1, spare) === null,
	);
	return departure === undefined ? null : new Date(departure);
}

/** A primeira reserva que começa a partir de `after` (pode ser a que atrapalha). */
export function nextBooking<T extends Interval>(
	bookings: readonly T[],
	after: DateInput,
): T | null {
	const from = toMs(after);
	return (
		bookings
			.filter((booking) => toMs(booking.start) >= from)
			.sort(byStart)[0] ?? null
	);
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
