import { describe, expect, it } from "vitest";
import { type CustomerRentalHistory, customerTier } from "./customer-tier";

const now = "2026-11-02T13:00:00Z";

const clean = (startAt = "2026-10-20T11:00:00Z"): CustomerRentalHistory => ({
	startAt,
	lateDays: 0,
	noticeGiven: false,
	hadDamage: false,
	hasDisputedDamage: false,
	openBalanceCents: 0,
});

const tier = (
	rentals: CustomerRentalHistory[],
	overrides: { blockedManually?: boolean; overdueBalanceCents?: number } = {},
) =>
	customerTier({
		blockedManually: false,
		overdueBalanceCents: 0,
		rentals,
		now,
		...overrides,
	});

describe("customerTier", () => {
	it("sem locações é novo", () => {
		expect(tier([])).toBe("NEW");
	});

	it("só a primeira locação ainda é novo", () => {
		expect(tier([clean()])).toBe("NEW");
	});

	it("duas locações em 90 dias é recorrente", () => {
		expect(tier([clean(), clean()])).toBe("RECURRING");
	});

	it("duas locações antigas não fazem recorrente", () => {
		expect(
			tier([clean("2026-01-01T11:00:00Z"), clean("2026-02-01T11:00:00Z")]),
		).toBe("NEW");
	});

	it("três locações limpas é confiável", () => {
		expect(tier([clean(), clean(), clean()])).toBe("TRUSTED");
	});

	it("dano tira de confiável", () => {
		expect(tier([clean(), clean(), { ...clean(), hadDamage: true }])).toBe(
			"RECURRING",
		);
	});

	it("saldo aberto tira de confiável", () => {
		expect(
			tier([clean(), clean(), { ...clean(), openBalanceCents: 100 }]),
		).toBe("RECURRING");
	});

	it("atraso sem aviso pede atenção, mesmo com histórico bom", () => {
		expect(tier([clean(), clean(), clean(), { ...clean(), lateDays: 1 }])).toBe(
			"ATTENTION",
		);
	});

	it("atraso avisado não pede atenção", () => {
		expect(tier([{ ...clean(), lateDays: 3, noticeGiven: true }])).toBe("NEW");
	});

	it("dano em disputa pede atenção", () => {
		expect(tier([{ ...clean(), hasDisputedDamage: true }])).toBe("ATTENTION");
	});

	it("bloqueio manual vence tudo", () => {
		expect(tier([clean(), clean(), clean()], { blockedManually: true })).toBe(
			"BLOCKED",
		);
	});

	it("saldo vencido bloqueia, mesmo com atraso", () => {
		expect(
			tier([{ ...clean(), lateDays: 2 }], { overdueBalanceCents: 5000 }),
		).toBe("BLOCKED");
	});
});
