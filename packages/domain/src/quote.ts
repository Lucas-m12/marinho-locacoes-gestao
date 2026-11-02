import { sumCents } from "./money";

export type QuoteItemInput = {
	dailyPriceCents: number | null;
	dailies: number;
	pieces?: number;
	depositCents: number | null;
};

export type QuoteLine = {
	subtotalCents: number | null;
	depositCents: number | null;
};

export type QuoteTotals = {
	lines: QuoteLine[];
	subtotalCents: number;
	deliveryFeeCents: number | null;
	discountCents: number;
	totalCents: number;
	depositTotalCents: number | null;
	hasUnpricedItem: boolean;
};

export function quoteTotals(input: {
	items: readonly QuoteItemInput[];
	deliveryFeeCents: number | null;
	discountCents: number;
}): QuoteTotals {
	const lines = input.items.map((item): QuoteLine => {
		const pieces = item.pieces ?? 1;
		return {
			subtotalCents:
				item.dailyPriceCents === null
					? null
					: item.dailyPriceCents * pieces * item.dailies,
			depositCents:
				item.depositCents === null ? null : item.depositCents * pieces,
		};
	});

	const subtotalCents = sumCents(lines.map((line) => line.subtotalCents ?? 0));
	const deposits = lines.map((line) => line.depositCents);
	const depositTotalCents = deposits.includes(null)
		? null
		: sumCents(deposits as number[]);

	return {
		lines,
		subtotalCents,
		deliveryFeeCents: input.deliveryFeeCents,
		discountCents: input.discountCents,
		totalCents: Math.max(
			0,
			subtotalCents + (input.deliveryFeeCents ?? 0) - input.discountCents,
		),
		depositTotalCents,
		hasUnpricedItem: lines.some((line) => line.subtotalCents === null),
	};
}
