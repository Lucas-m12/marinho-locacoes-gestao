import { describe, expect, it } from "vitest";
import {
	centsToInput,
	formatBRL,
	formatBRLShort,
	parseBRLToCents,
	percentOfCents,
	sumCents,
} from "./money";

describe("formatBRL", () => {
	it("formata com milhar e centavos", () => {
		expect(formatBRL(123456)).toBe("R$ 1.234,56");
		expect(formatBRL(0)).toBe("R$ 0,00");
		expect(formatBRL(5)).toBe("R$ 0,05");
		expect(formatBRL(100000000)).toBe("R$ 1.000.000,00");
	});

	it("mostra o sinal de negativo", () => {
		expect(formatBRL(-4000)).toBe("- R$ 40,00");
	});
});

describe("formatBRLShort", () => {
	it("omite centavos zerados", () => {
		expect(formatBRLShort(123400)).toBe("R$ 1.234");
		expect(formatBRLShort(1250)).toBe("R$ 12,50");
		expect(formatBRLShort(-4000)).toBe("- R$ 40");
	});
});

describe("sumCents e percentOfCents", () => {
	it("soma centavos", () => {
		expect(sumCents([100, 250, 5])).toBe(355);
		expect(sumCents([])).toBe(0);
	});

	it("calcula porcentagem arredondando", () => {
		expect(percentOfCents(10000, 30)).toBe(3000);
		expect(percentOfCents(999, 33)).toBe(330);
	});
});

describe("parseBRLToCents", () => {
	it("entende os formatos digitados", () => {
		expect(parseBRLToCents("1.234,56")).toBe(123456);
		expect(parseBRLToCents("R$ 40")).toBe(4000);
		expect(parseBRLToCents("40,5")).toBe(4050);
		expect(parseBRLToCents("1.200")).toBe(120000);
		expect(parseBRLToCents("12.5")).toBe(1250);
	});

	it("recusa o que não é valor", () => {
		expect(parseBRLToCents("")).toBeNull();
		expect(parseBRLToCents("abc")).toBeNull();
		expect(parseBRLToCents("1,234")).toBeNull();
		expect(parseBRLToCents("-5")).toBeNull();
	});
});

describe("centsToInput", () => {
	it("volta para o formato do campo", () => {
		expect(centsToInput(123456)).toBe("1234,56");
		expect(centsToInput(4000)).toBe("40");
		expect(centsToInput(null)).toBe("");
	});
});
