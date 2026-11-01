import type { ChecklistAnswer, OccurrenceKind } from "./enums";

export type ChecklistItemState = {
	id: string;
	label: string;
	answer: ChecklistAnswer | null;
	occurrenceKind: OccurrenceKind;
	preexisting: boolean;
};

export type Divergence = {
	itemId: string;
	label: string;
	kind: OccurrenceKind;
	checkoutAnswer: ChecklistAnswer | null;
	returnAnswer: ChecklistAnswer;
};

export function detectDivergences(
	checkout: readonly ChecklistItemState[],
	back: readonly ChecklistItemState[],
): Divergence[] {
	return back.flatMap((item) => {
		if (item.answer !== "NOT_OK" || item.preexisting) return [];
		const before = checkout.find((entry) => entry.id === item.id);
		if (before?.answer === "NOT_OK") return [];
		return [
			{
				itemId: item.id,
				label: item.label,
				kind: item.occurrenceKind,
				checkoutAnswer: before?.answer ?? null,
				returnAnswer: "NOT_OK",
			},
		];
	});
}

/**
 * REGRA PROVISÓRIA: enquanto o negócio não tem tabela de danos, a sugestão é
 * uma diária do equipamento. A tela sempre deixa editar.
 */
export function suggestOccurrenceAmount(input: {
	dailyPriceCents: number | null;
}): number {
	return input.dailyPriceCents ?? 0;
}

export function isChecklistComplete(
	items: readonly { answer: ChecklistAnswer | null }[],
): boolean {
	return items.every((item) => item.answer !== null);
}
