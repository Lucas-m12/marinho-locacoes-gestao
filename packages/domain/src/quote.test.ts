import { describe, expect, it } from "vitest";
import { quoteTotals } from "./quote";

describe("quoteTotals", () => {
	it("reproduz o orçamento da LOC-0033", () => {
		const totals = quoteTotals({
			items: [
				{ dailyPriceCents: 5000, dailies: 4, depositCents: null },
				{ dailyPriceCents: 200, dailies: 4, pieces: 12, depositCents: null },
			],
			deliveryFeeCents: null,
			discountCents: 0,
		});

		expect(totals.lines.map((line) => line.subtotalCents)).toEqual([
			20000, 9600,
		]);
		expect(totals.subtotalCents).toBe(29600);
		expect(totals.totalCents).toBe(29600);
		expect(totals.depositTotalCents).toBeNull();
		expect(totals.hasUnpricedItem).toBe(false);
	});

	it("soma taxa e tira desconto", () => {
		const totals = quoteTotals({
			items: [{ dailyPriceCents: 8000, dailies: 4, depositCents: 30000 }],
			deliveryFeeCents: 4000,
			discountCents: 2000,
		});

		expect(totals.totalCents).toBe(34000);
		expect(totals.depositTotalCents).toBe(30000);
	});

	it("multiplica a caução pelas peças", () => {
		const totals = quoteTotals({
			items: [
				{ dailyPriceCents: 200, dailies: 1, pieces: 5, depositCents: 100 },
			],
			deliveryFeeCents: 0,
			discountCents: 0,
		});

		expect(totals.depositTotalCents).toBe(500);
	});

	it("marca item sem preço e não o soma", () => {
		const totals = quoteTotals({
			items: [
				{ dailyPriceCents: null, dailies: 3, depositCents: null },
				{ dailyPriceCents: 3000, dailies: 3, depositCents: 1000 },
			],
			deliveryFeeCents: 0,
			discountCents: 0,
		});

		expect(totals.hasUnpricedItem).toBe(true);
		expect(totals.lines[0]?.subtotalCents).toBeNull();
		expect(totals.subtotalCents).toBe(9000);
		expect(totals.depositTotalCents).toBeNull();
	});

	it("desconto nunca deixa o total negativo", () => {
		const totals = quoteTotals({
			items: [{ dailyPriceCents: 1000, dailies: 1, depositCents: 0 }],
			deliveryFeeCents: 0,
			discountCents: 5000,
		});

		expect(totals.totalCents).toBe(0);
	});

	it("sem itens, a caução é zero", () => {
		const totals = quoteTotals({
			items: [],
			deliveryFeeCents: null,
			discountCents: 0,
		});

		expect(totals.depositTotalCents).toBe(0);
		expect(totals.totalCents).toBe(0);
	});
});
