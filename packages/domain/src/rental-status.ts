import { type DateInput, toMs } from "./dates";
import type { RentalStatus } from "./enums";

const TRANSITIONS: Record<RentalStatus, readonly RentalStatus[]> = {
	QUOTE: ["AWAITING_DEPOSIT", "CANCELED"],
	AWAITING_DEPOSIT: ["CONFIRMED", "CANCELED", "EXPIRED"],
	CONFIRMED: ["SEPARATED", "CANCELED"],
	SEPARATED: ["ON_SITE", "CANCELED"],
	ON_SITE: ["RETURNED"],
	RETURNED: ["CLOSED"],
	CLOSED: [],
	CANCELED: [],
	EXPIRED: [],
};

export const rentalStatusMachine = {
	allowedFrom(status: RentalStatus): readonly RentalStatus[] {
		return TRANSITIONS[status];
	},
	canTransition(from: RentalStatus, to: RentalStatus): boolean {
		return TRANSITIONS[from].includes(to);
	},
	isFinal(status: RentalStatus): boolean {
		return TRANSITIONS[status].length === 0;
	},
};

export const OPEN_RENTAL_STATUSES: readonly RentalStatus[] = [
	"QUOTE",
	"AWAITING_DEPOSIT",
	"CONFIRMED",
	"SEPARATED",
	"ON_SITE",
	"RETURNED",
];

export const BOOKING_RENTAL_STATUSES: readonly RentalStatus[] = [
	"AWAITING_DEPOSIT",
	"CONFIRMED",
	"SEPARATED",
	"ON_SITE",
];

/**
 * Locações que tiraram (ou vão tirar) o equipamento da base: tudo menos
 * rascunho, cancelada e vencida. É o que conta para dizer se o equipamento
 * estava ocupado num período passado.
 */
export const OCCUPYING_RENTAL_STATUSES: readonly RentalStatus[] = [
	...BOOKING_RENTAL_STATUSES,
	"RETURNED",
	"CLOSED",
];

/**
 * Até quando um item ficou (ou fica) fora da base: a volta registrada do
 * item ou da locação; sem volta, a devolução prevista, ou agora se a locação
 * na obra está atrasada.
 */
export function occupiedUntil(
	input: {
		status: RentalStatus;
		endAt: DateInput;
		returnedAt: DateInput | null;
		itemReturnedAt: DateInput | null;
	},
	now: DateInput,
): Date {
	const returned = input.itemReturnedAt ?? input.returnedAt;
	if (returned !== null) return new Date(toMs(returned));
	if (isRentalOverdue(input, now)) return new Date(toMs(now));
	return new Date(toMs(input.endAt));
}

export const COUNTED_RENTAL_STATUSES: readonly RentalStatus[] = [
	"CONFIRMED",
	"SEPARATED",
	"ON_SITE",
	"RETURNED",
	"CLOSED",
];

export const EXTENDABLE_RENTAL_STATUSES: readonly RentalStatus[] = [
	"CONFIRMED",
	"SEPARATED",
	"ON_SITE",
];

export const PAYABLE_RENTAL_STATUSES: readonly RentalStatus[] = [
	"AWAITING_DEPOSIT",
	"CONFIRMED",
	"SEPARATED",
	"ON_SITE",
	"RETURNED",
	"CLOSED",
];

export const DELIVERED_RENTAL_STATUSES: readonly RentalStatus[] = [
	"ON_SITE",
	"RETURNED",
	"CLOSED",
];

export function holdsBooking(status: RentalStatus): boolean {
	return BOOKING_RENTAL_STATUSES.includes(status);
}

export type RentalDisplayStatus = RentalStatus | "OVERDUE";

export function isRentalOverdue(
	rental: { status: RentalStatus; endAt: DateInput },
	now: DateInput,
): boolean {
	return rental.status === "ON_SITE" && toMs(rental.endAt) < toMs(now);
}

export function rentalDisplayStatus(
	rental: { status: RentalStatus; endAt: DateInput },
	now: DateInput,
): RentalDisplayStatus {
	return isRentalOverdue(rental, now) ? "OVERDUE" : rental.status;
}

export function isQuoteExpired(
	rental: {
		status: RentalStatus;
		signalDueAt: DateInput | null;
		hasPaidSignal: boolean;
	},
	now: DateInput,
): boolean {
	return (
		rental.status === "AWAITING_DEPOSIT" &&
		rental.signalDueAt !== null &&
		!rental.hasPaidSignal &&
		toMs(rental.signalDueAt) < toMs(now)
	);
}
