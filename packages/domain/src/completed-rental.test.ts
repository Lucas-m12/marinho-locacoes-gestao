import { describe, expect, it } from "vitest";
import { planCompletedRental } from "./completed-rental";
import { countDailies } from "./dailies";
import { quoteTotals } from "./quote";
import { OCCUPYING_RENTAL_STATUSES, occupiedUntil } from "./rental-status";

const NOW = "2026-11-26T15:00:00-03:00";
const START = "2026-11-24T08:00:00-03:00";
const END = "2026-11-24T13:00:00-03:00";

const plan = (overrides: Partial<Parameters<typeof planCompletedRental>[0]>) =>
	planCompletedRental({
		startAt: START,
		endAt: END,
		calculatedTotalCents: 8000,
		agreedTotalCents: null,
		payment: null,
		now: NOW,
		...overrides,
	});

describe("planCompletedRental", () => {
	it("meia diária da carrocinha: R$ 40 combinados, pagos em dinheiro, encerra", () => {
		const dailies = countDailies(START, END);
		const { totalCents } = quoteTotals({
			items: [{ dailyPriceCents: 8000, dailies, depositCents: null }],
			deliveryFeeCents: null,
			discountCents: 0,
		});
		expect(dailies).toBe(1);
		expect(
			plan({
				calculatedTotalCents: totalCents,
				agreedTotalCents: 4000,
				payment: { amountCents: 4000, paidAt: END },
			}),
		).toEqual({
			discountCents: 4000,
			totalCents: 4000,
			balanceCents: 0,
			status: "CLOSED",
		});
	});

	it("sem valor combinado vale o total da tabela, sem desconto", () => {
		expect(plan({})).toMatchObject({ discountCents: 0, totalCents: 8000 });
	});

	it("sem pagamento fica devolvida, com o saldo inteiro", () => {
		expect(plan({ agreedTotalCents: 4000 })).toMatchObject({
			balanceCents: 4000,
			status: "RETURNED",
		});
	});

	it("pagamento parcial fica devolvida, com o que falta", () => {
		expect(plan({ payment: { amountCents: 3000, paidAt: END } })).toMatchObject(
			{ balanceCents: 5000, status: "RETURNED" },
		);
	});

	it("valor combinado zero encerra sem pagamento", () => {
		expect(plan({ agreedTotalCents: 0 })).toMatchObject({
			discountCents: 8000,
			totalCents: 0,
			status: "CLOSED",
		});
	});

	it("recusa devolução no futuro", () => {
		expect(plan({ endAt: "2026-11-26T15:01:00-03:00" })).toEqual({
			problem: "FUTURE_RENTAL",
		});
	});

	it("aceita devolução agora mesmo", () => {
		expect(plan({ endAt: NOW })).toMatchObject({ status: "RETURNED" });
	});

	it("recusa devolução antes da saída", () => {
		expect(plan({ endAt: START })).toEqual({ problem: "INVALID_DATE" });
	});

	it("recusa pagamento com data no futuro", () => {
		expect(
			plan({
				payment: { amountCents: 100, paidAt: "2026-11-27T08:00:00-03:00" },
			}),
		).toEqual({ problem: "INVALID_DATE" });
	});

	it("recusa valor combinado acima do total", () => {
		expect(plan({ agreedTotalCents: 8001 })).toEqual({
			problem: "AGREED_ABOVE_TOTAL",
		});
	});

	it("recusa pagamento acima do valor da locação", () => {
		expect(
			plan({
				agreedTotalCents: 4000,
				payment: { amountCents: 4001, paidAt: END },
			}),
		).toEqual({ problem: "PAYMENT_ABOVE_TOTAL" });
	});
});

describe("occupiedUntil", () => {
	const base = {
		status: "CLOSED" as const,
		endAt: "2026-11-20T17:00:00-03:00",
		returnedAt: null,
		itemReturnedAt: null,
	};

	it("usa a volta do item, mesmo antes da devolução prevista", () => {
		expect(
			occupiedUntil(
				{ ...base, itemReturnedAt: "2026-11-20T10:00:00-03:00" },
				NOW,
			).toISOString(),
		).toBe("2026-11-20T13:00:00.000Z");
	});

	it("sem volta do item, usa a volta da locação", () => {
		expect(
			occupiedUntil(
				{ ...base, returnedAt: "2026-11-21T09:00:00-03:00" },
				NOW,
			).toISOString(),
		).toBe("2026-11-21T12:00:00.000Z");
	});

	it("na obra e atrasada, ocupa até agora", () => {
		expect(
			occupiedUntil({ ...base, status: "ON_SITE" }, NOW).toISOString(),
		).toBe("2026-11-26T18:00:00.000Z");
	});

	it("reservada e sem volta, ocupa até a devolução prevista", () => {
		expect(
			occupiedUntil({ ...base, status: "CONFIRMED" }, NOW).toISOString(),
		).toBe("2026-11-20T20:00:00.000Z");
	});

	it("rascunho, cancelada e vencida não ocupam", () => {
		expect(OCCUPYING_RENTAL_STATUSES).not.toContain("QUOTE");
		expect(OCCUPYING_RENTAL_STATUSES).not.toContain("CANCELED");
		expect(OCCUPYING_RENTAL_STATUSES).not.toContain("EXPIRED");
		expect(OCCUPYING_RENTAL_STATUSES).toContain("CLOSED");
	});
});
