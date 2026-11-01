import { describe, expect, it } from "vitest";
import type { ChecklistItemState } from "./inspection";
import {
	detectDivergences,
	isChecklistComplete,
	suggestOccurrenceAmount,
} from "./inspection";

const item = (
	overrides: Partial<ChecklistItemState> & { id: string },
): ChecklistItemState => ({
	label: overrides.id,
	answer: "OK",
	occurrenceKind: "DAMAGE",
	preexisting: false,
	...overrides,
});

describe("detectDivergences", () => {
	it("acha o que saiu OK e voltou Não OK", () => {
		const result = detectDivergences(
			[item({ id: "cabo" }), item({ id: "limpo" })],
			[
				item({ id: "cabo", answer: "NOT_OK" }),
				item({ id: "limpo", answer: "NOT_OK", occurrenceKind: "DIRT" }),
			],
		);

		expect(result.map((entry) => [entry.itemId, entry.kind])).toEqual([
			["cabo", "DAMAGE"],
			["limpo", "DIRT"],
		]);
	});

	it("não cobra o que já saiu com problema", () => {
		expect(
			detectDivergences(
				[item({ id: "carcaca", answer: "NOT_OK" })],
				[item({ id: "carcaca", answer: "NOT_OK" })],
			),
		).toEqual([]);
	});

	it("não cobra dano que a unidade já tinha", () => {
		expect(
			detectDivergences(
				[item({ id: "carcaca" })],
				[item({ id: "carcaca", answer: "NOT_OK", preexisting: true })],
			),
		).toEqual([]);
	});

	it("sem diferença não gera nada", () => {
		expect(detectDivergences([item({ id: "a" })], [item({ id: "a" })])).toEqual(
			[],
		);
	});
});

describe("suggestOccurrenceAmount", () => {
	it("sugere uma diária", () => {
		expect(suggestOccurrenceAmount({ dailyPriceCents: 8000 })).toBe(8000);
	});

	it("sem preço, sugere zero", () => {
		expect(suggestOccurrenceAmount({ dailyPriceCents: null })).toBe(0);
	});
});

describe("isChecklistComplete", () => {
	it("exige resposta em todos", () => {
		expect(isChecklistComplete([{ answer: "OK" }, { answer: "NA" }])).toBe(
			true,
		);
		expect(isChecklistComplete([{ answer: "OK" }, { answer: null }])).toBe(
			false,
		);
	});
});
