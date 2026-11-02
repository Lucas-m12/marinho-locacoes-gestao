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

export const COUNTED_RENTAL_STATUSES: readonly RentalStatus[] = [
	"CONFIRMED",
	"SEPARATED",
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
