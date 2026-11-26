import { countDailies } from "./dailies";
import type { DateInput } from "./dates";
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
 * Atraso (regra de 20/11/2026): as diárias a mais são a diferença entre as
 * diárias até a devolução real e as diárias até a devolução combinada, as duas
 * contadas desde a saída por `countDailies` (24 horas, com 2 horas de
 * tolerância). Cada uma custa a soma das diárias da locação, sem multa.
 * O valor é só uma sugestão: a tela permite editar.
 */
export function suggestLateFee(input: {
	startAt: DateInput;
	dueAt: DateInput;
	returnedAt: DateInput;
	dailyTotalCents: number;
}): { extraDailies: number; amountCents: number; provisional: true } {
	const extraDailies = Math.max(
		0,
		countDailies(input.startAt, input.returnedAt) -
			countDailies(input.startAt, input.dueAt),
	);
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
