import { addHours, type DateInput, toMs } from "./dates";
import type { CustomerTier } from "./enums";

export const TRUSTED_MIN_RENTALS = 3;
export const RECURRING_MIN_RENTALS = 2;
export const RECURRING_WINDOW_DAYS = 90;

/**
 * "Atraso acima de 1 dia" é medido em dias de calendário: passar do dia
 * combinado já conta. Uma devolução vencida ontem às 17:00 entra na regra
 * hoje, a qualquer hora.
 */
export const ATTENTION_MIN_LATE_DAYS = 1;

export type CustomerRentalHistory = {
	startAt: DateInput;
	lateDays: number;
	noticeGiven: boolean;
	hadDamage: boolean;
	hasDisputedDamage: boolean;
	openBalanceCents: number;
};

export function customerTier(history: {
	blockedManually: boolean;
	overdueBalanceCents: number;
	rentals: readonly CustomerRentalHistory[];
	now: DateInput;
}): CustomerTier {
	if (history.blockedManually || history.overdueBalanceCents > 0) {
		return "BLOCKED";
	}

	const needsAttention = history.rentals.some(
		(rental) =>
			rental.hasDisputedDamage ||
			(rental.lateDays >= ATTENTION_MIN_LATE_DAYS && !rental.noticeGiven),
	);
	if (needsAttention) return "ATTENTION";

	const cleanRentals = history.rentals.filter(
		(rental) =>
			rental.lateDays === 0 &&
			!rental.hadDamage &&
			rental.openBalanceCents === 0,
	);
	if (cleanRentals.length >= TRUSTED_MIN_RENTALS) return "TRUSTED";

	const windowStart = addHours(history.now, -24 * RECURRING_WINDOW_DAYS);
	const recent = history.rentals.filter(
		(rental) => toMs(rental.startAt) >= windowStart.getTime(),
	);
	if (recent.length >= RECURRING_MIN_RENTALS) return "RECURRING";

	return "NEW";
}
