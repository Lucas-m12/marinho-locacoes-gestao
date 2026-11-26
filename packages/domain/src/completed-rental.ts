import { type DateInput, toMs } from "./dates";
import type { RentalStatus } from "./enums";

/**
 * Locação registrada depois: aconteceu fora do sistema e o equipamento já
 * voltou. Entra sem orçamento, sem caução e sem vistorias, com o valor que foi
 * combinado com o cliente (por exemplo, meia diária).
 */

export type CompletedRentalProblem =
	| "INVALID_DATE"
	| "FUTURE_RENTAL"
	| "AGREED_ABOVE_TOTAL"
	| "PAYMENT_ABOVE_TOTAL";

export type CompletedRentalStatus = Extract<
	RentalStatus,
	"RETURNED" | "CLOSED"
>;

export type CompletedRentalPlan = {
	/** Diferença entre o total da tabela e o valor combinado. */
	discountCents: number;
	totalCents: number;
	balanceCents: number;
	status: CompletedRentalStatus;
};

/** Pago tudo, encerra; ficou saldo, fica devolvida até receber e encerrar. */
export function completedRentalStatus(
	balanceCents: number,
): CompletedRentalStatus {
	return balanceCents > 0 ? "RETURNED" : "CLOSED";
}

/**
 * A saída vem antes da devolução, a devolução já passou (para locação futura,
 * o caminho é o orçamento) e o pagamento não está no futuro.
 */
export function completedPeriodProblem(input: {
	startAt: DateInput;
	endAt: DateInput;
	paidAt: DateInput | null;
	now: DateInput;
}): Extract<CompletedRentalProblem, "INVALID_DATE" | "FUTURE_RENTAL"> | null {
	if (toMs(input.startAt) >= toMs(input.endAt)) return "INVALID_DATE";
	if (toMs(input.endAt) > toMs(input.now)) return "FUTURE_RENTAL";
	if (input.paidAt !== null && toMs(input.paidAt) > toMs(input.now)) {
		return "INVALID_DATE";
	}
	return null;
}

/**
 * Confere as datas e o valor e diz como a locação entra. O total calculado
 * sai das mesmas funções da cotação (`countDailies` e `quoteTotals`), sem
 * desconto e com a taxa de entrega.
 */
export function planCompletedRental(input: {
	startAt: DateInput;
	endAt: DateInput;
	calculatedTotalCents: number;
	/** `null` = vale o total calculado. */
	agreedTotalCents: number | null;
	payment: { amountCents: number; paidAt: DateInput } | null;
	now: DateInput;
}): CompletedRentalPlan | { problem: CompletedRentalProblem } {
	const period = completedPeriodProblem({
		startAt: input.startAt,
		endAt: input.endAt,
		paidAt: input.payment?.paidAt ?? null,
		now: input.now,
	});
	if (period) return { problem: period };
	const totalCents = input.agreedTotalCents ?? input.calculatedTotalCents;
	if (totalCents > input.calculatedTotalCents) {
		return { problem: "AGREED_ABOVE_TOTAL" };
	}
	const paidCents = input.payment?.amountCents ?? 0;
	if (paidCents > totalCents) return { problem: "PAYMENT_ABOVE_TOTAL" };
	const balanceCents = totalCents - paidCents;
	return {
		discountCents: input.calculatedTotalCents - totalCents,
		totalCents,
		balanceCents,
		status: completedRentalStatus(balanceCents),
	};
}
