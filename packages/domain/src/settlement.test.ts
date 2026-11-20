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
	// Saída segunda 08:00 (11:00Z), devolução combinada terça 08:00 (1 diária).
	const base = {
		startAt: "2026-11-09T11:00:00Z",
		dueAt: "2026-11-10T11:00:00Z",
		dailyTotalCents: 4000,
	};

	it("dentro da tolerância de 2 horas não sugere nada", () => {
		expect(
			suggestLateFee({ ...base, returnedAt: "2026-11-10T13:00:00Z" }),
		).toEqual({ extraDailies: 0, amountCents: 0, provisional: true });
	});

	it("passou da tolerância cobra uma diária a mais", () => {
		expect(
			suggestLateFee({ ...base, returnedAt: "2026-11-10T13:01:00Z" }),
		).toEqual({ extraDailies: 1, amountCents: 4000, provisional: true });
	});

	it("dois dias depois cobra as diárias extras", () => {
		expect(
			suggestLateFee({ ...base, returnedAt: "2026-11-12T12:00:00Z" }),
		).toEqual({ extraDailies: 2, amountCents: 8000, provisional: true });
	});

	it("devolução combinada no mesmo dia não cobra antes de fechar 24 horas", () => {
		expect(
			suggestLateFee({
				...base,
				dueAt: "2026-11-09T20:00:00Z",
				returnedAt: "2026-11-09T23:00:00Z",
			}),
		).toEqual({ extraDailies: 0, amountCents: 0, provisional: true });
	});

	it("no prazo não sugere nada", () => {
		expect(
			suggestLateFee({ ...base, returnedAt: "2026-11-10T10:00:00Z" }),
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
