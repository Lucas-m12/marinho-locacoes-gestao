import { describe, expect, it } from "vitest";
import {
	depositHeldCents,
	rentalBalanceCents,
	suggestLateFee,
} from "./settlement";

describe("rentalBalanceCents", () => {
	it("desconta sinal e saldo do total", () => {
		expect(
			rentalBalanceCents({
				totalCents: 70000,
				chargesCents: 0,
				payments: [{ kind: "SIGNAL", amountCents: 20000 }],
			}),
		).toBe(50000);
	});

	it("consumível não abate o saldo", () => {
		expect(
			rentalBalanceCents({
				totalCents: 20000,
				chargesCents: 0,
				payments: [
					{ kind: "SIGNAL", amountCents: 5000 },
					{ kind: "BALANCE", amountCents: 15000 },
					{ kind: "CONSUMABLE", amountCents: 4000 },
				],
			}),
		).toBe(0);
	});

	it("cobranças extras somam e diária extra abate", () => {
		expect(
			rentalBalanceCents({
				totalCents: 10000,
				chargesCents: 4000,
				payments: [
					{ kind: "BALANCE", amountCents: 10000 },
					{ kind: "EXTRA_DAILY", amountCents: 1000 },
				],
			}),
		).toBe(3000);
	});

	it("pagar a mais não fica negativo", () => {
		expect(
			rentalBalanceCents({
				totalCents: 10000,
				chargesCents: 0,
				payments: [{ kind: "BALANCE", amountCents: 15000 }],
			}),
		).toBe(0);
	});
});

describe("suggestLateFee", () => {
	it("cobra diárias extras pelos dias depois do combinado", () => {
		expect(
			suggestLateFee({
				dueAt: "2026-11-01T20:00:00Z",
				returnedAt: "2026-11-03T13:00:00Z",
				dailyTotalCents: 4000,
			}),
		).toEqual({ extraDailies: 2, amountCents: 8000, provisional: true });
	});

	it("no prazo não sugere nada", () => {
		expect(
			suggestLateFee({
				dueAt: "2026-11-01T20:00:00Z",
				returnedAt: "2026-11-01T19:00:00Z",
				dailyTotalCents: 4000,
			}),
		).toEqual({ extraDailies: 0, amountCents: 0, provisional: true });
	});
});

describe("depositHeldCents", () => {
	it("tira o devolvido e o retido", () => {
		expect(
			depositHeldCents({
				receivedCents: 30000,
				refundedCents: 20000,
				retainedCents: 5000,
			}),
		).toBe(5000);
	});
});
