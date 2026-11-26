import type { RecordCompletedInput } from "@marinho-gestao/contract";
import {
	type CompletedRentalPlan,
	type CompletedRentalProblem,
	completedPeriodProblem,
	countDailies,
	formatBRLShort,
	planCompletedRental,
	quoteTotals,
} from "@marinho-gestao/domain";
import type { z } from "zod";
import { conflict, precondition } from "./errors";
import { findCompletedConflicts, requireLot, requireUnit } from "./queries";
import type { Snapshot } from "./records";
import { itemTablePrice } from "./rental-money";
import { assertPriced } from "./rentals";
import { requireCustomer } from "./views";

type Input = z.output<typeof RecordCompletedInput>;

export type CompletedRentalDraft = {
	plan: CompletedRentalPlan;
	deliveryFeeCents: number | null;
	/** Diária da tabela de cada item, congelada na locação. */
	dailyPrices: (number | null)[];
};

function problemMessage(
	problem: CompletedRentalProblem,
	calculatedTotalCents: number,
	agreedTotalCents: number | null,
): string {
	const total = formatBRLShort(agreedTotalCents ?? calculatedTotalCents);
	return {
		INVALID_DATE:
			"Confira as datas: a devolução vem depois da saída e o pagamento não pode estar no futuro.",
		FUTURE_RENTAL: "Para locação futura, use o orçamento.",
		AGREED_ABOVE_TOTAL: `O valor combinado passa do total pela tabela (${formatBRLShort(calculatedTotalCents)}).`,
		PAYMENT_ABOVE_TOTAL: `O pagamento passa do valor da locação (${total}).`,
	}[problem];
}

/**
 * Tudo o que se confere antes de gravar uma locação registrada depois, na
 * mesma ordem no mock e no servidor: datas, preço, valor combinado e
 * pagamento, e por último se o item estava em outra locação no período.
 */
export function prepareCompletedRental(
	db: Snapshot,
	input: Input,
	now: Date,
): CompletedRentalDraft {
	requireCustomer(db, input.customerId);
	for (const item of input.items) {
		if (item.kind === "UNIT") requireUnit(db, item.code);
		else requireLot(db, item.code);
	}
	const period = completedPeriodProblem({
		startAt: input.startAt,
		endAt: input.endAt,
		paidAt: input.payment?.paidAt ?? null,
		now,
	});
	if (period) {
		throw precondition(period, [], problemMessage(period, 0, null));
	}
	assertPriced(db, input.items);

	const deliveryFeeCents =
		input.deliveryMode === "PICKUP" ? 0 : input.deliveryFeeCents;
	const dailies = countDailies(input.startAt, input.endAt);
	const dailyPrices = input.items.map(
		(item) => itemTablePrice(db, item).dailyPriceCents,
	);
	const calculated = quoteTotals({
		items: input.items.map((item, index) => ({
			dailyPriceCents: dailyPrices[index] ?? null,
			depositCents: null,
			dailies,
			pieces: item.quantity,
		})),
		deliveryFeeCents,
		discountCents: 0,
	});
	const plan = planCompletedRental({
		startAt: input.startAt,
		endAt: input.endAt,
		calculatedTotalCents: calculated.totalCents,
		agreedTotalCents: input.agreedTotalCents,
		payment: input.payment,
		now,
	});
	if ("problem" in plan) {
		throw precondition(
			plan.problem,
			[],
			problemMessage(
				plan.problem,
				calculated.totalCents,
				input.agreedTotalCents,
			),
		);
	}

	const conflicts = findCompletedConflicts(
		db,
		input.items,
		input.startAt,
		input.endAt,
		now,
	);
	if (conflicts.length > 0) throw conflict(conflicts);
	return { plan, deliveryFeeCents, dailyPrices };
}
