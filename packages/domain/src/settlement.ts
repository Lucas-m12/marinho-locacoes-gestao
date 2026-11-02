import { calendarDaysBetween, type DateInput, toMs } from "./dates";
import type { PaymentKind } from "./enums";
import { sumCents } from "./money";

const QUOTE_PAYMENTS: readonly PaymentKind[] = [
	"SIGNAL",
	"BALANCE",
	"DELIVERY_FEE",
];

export function rentalBalanceCents(input: {
	totalCents: number;
	chargesCents: number;
	payments: readonly { kind: PaymentKind; amountCents: number }[];
}): number {
	const paidAgainstQuote = sumCents(
		input.payments
			.filter((payment) => QUOTE_PAYMENTS.includes(payment.kind))
			.map((payment) => payment.amountCents),
	);
	const paidAgainstCharges = sumCents(
		input.payments
			.filter((payment) => payment.kind === "EXTRA_DAILY")
			.map((payment) => payment.amountCents),
	);
	return (
		Math.max(0, input.totalCents - paidAgainstQuote) +
		Math.max(0, input.chargesCents - paidAgainstCharges)
	);
}

/**
 * REGRA PROVISÓRIA de atraso: diárias extras × soma das diárias da locação.
 * O valor é só uma sugestão: a tela permite editar.
 */
export function suggestLateFee(input: {
	dueAt: DateInput;
	returnedAt: DateInput;
	dailyTotalCents: number;
	timeZone?: string;
}): { extraDailies: number; amountCents: number; provisional: true } {
	const isLate = toMs(input.returnedAt) > toMs(input.dueAt);
	const extraDailies = isLate
		? calendarDaysBetween(input.dueAt, input.returnedAt, input.timeZone)
		: 0;
	return {
		extraDailies,
		amountCents: extraDailies * input.dailyTotalCents,
		provisional: true,
	};
}

export type DepositMovement = {
	receivedCents: number;
	refundedCents: number;
	retainedCents: number;
};

export function depositHeldCents(deposit: DepositMovement): number {
	return deposit.receivedCents - deposit.refundedCents - deposit.retainedCents;
}
