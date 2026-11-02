import { describe, expect, it } from "vitest";
import {
	type CsvLedgerEntry,
	isInMonth,
	ledgerCsv,
	ledgerTotals,
	reversalBlock,
	signedAmountCents,
} from "./ledger";

const entry = (overrides: Partial<CsvLedgerEntry> = {}): CsvLedgerEntry => ({
	direction: "IN",
	amountCents: 123450,
	reversalOfId: null,
	occurredAt: "2026-11-02T15:00:00Z",
	category: "RENTAL",
	description: "Sinal da LOC-0029",
	method: "PIX",
	rentalNumber: "LOC-0029",
	unitCode: "MAR-002",
	...overrides,
});

describe("reversalBlock", () => {
	const original = { id: "a", reversalOfId: null };
	const reversal = { id: "b", reversalOfId: "a" };

	it("libera lançamento comum", () => {
		expect(reversalBlock(original, [original])).toBeNull();
	});

	it("recusa quem já foi estornado", () => {
		expect(reversalBlock(original, [original, reversal])).toBe(
			"ALREADY_REVERSED",
		);
	});

	it("recusa estornar um estorno", () => {
		expect(reversalBlock(reversal, [original, reversal])).toBe("IS_REVERSAL");
	});
});

describe("ledgerTotals", () => {
	it("soma entradas e saídas", () => {
		expect(
			ledgerTotals([
				entry({ amountCents: 10000 }),
				entry({ direction: "OUT", amountCents: 3000 }),
			]),
		).toEqual({ inCents: 10000, outCents: 3000, resultCents: 7000 });
	});

	it("estorno de entrada abate a entrada, não infla a saída", () => {
		expect(
			ledgerTotals([
				entry({ amountCents: 10000 }),
				entry({ direction: "OUT", amountCents: 10000, reversalOfId: "a" }),
			]),
		).toEqual({ inCents: 0, outCents: 0, resultCents: 0 });
	});

	it("estorno de saída abate a saída", () => {
		expect(
			ledgerTotals([
				entry({ direction: "OUT", amountCents: 4000 }),
				entry({ direction: "IN", amountCents: 4000, reversalOfId: "a" }),
			]),
		).toEqual({ inCents: 0, outCents: 0, resultCents: 0 });
	});
});

describe("signedAmountCents", () => {
	it("inverte só o estorno", () => {
		expect(signedAmountCents({ amountCents: 500, reversalOfId: null })).toBe(
			500,
		);
		expect(signedAmountCents({ amountCents: 500, reversalOfId: "a" })).toBe(
			-500,
		);
	});
});

describe("isInMonth", () => {
	it("usa o mês no fuso de negócio", () => {
		expect(isInMonth("2026-12-01T02:00:00Z", "2026-11")).toBe(true);
		expect(isInMonth("2026-12-01T04:00:00Z", "2026-11")).toBe(false);
	});
});

describe("ledgerCsv", () => {
	const lines = (content: string) => content.slice(1).trimEnd().split("\r\n");

	it("nomeia o arquivo pelo mês", () => {
		expect(ledgerCsv({ month: "2026-11", entries: [] }).fileName).toBe(
			"marinho-caixa-2026-11.csv",
		);
	});

	it("começa com BOM e usa as colunas combinadas", () => {
		const { content } = ledgerCsv({ month: "2026-11", entries: [] });
		expect(content.charCodeAt(0)).toBe(0xfeff);
		expect(lines(content)[0]).toBe(
			"Data;Tipo;Categoria;Descrição;Forma;Valor;Locação;Unidade",
		);
	});

	it("formata data, valor com vírgula e tipo", () => {
		const { content } = ledgerCsv({ month: "2026-11", entries: [entry()] });
		expect(lines(content)[1]).toBe(
			"02/11/2026;Entrada;Locações;Sinal da LOC-0029;Pix;1234,50;LOC-0029;MAR-002",
		);
	});

	it("deixa locação e unidade vazias quando não há vínculo", () => {
		const { content } = ledgerCsv({
			month: "2026-11",
			entries: [
				entry({
					direction: "OUT",
					category: "FUEL",
					description: "Combustível",
					method: "CASH",
					amountCents: 4000,
					rentalNumber: null,
					unitCode: null,
				}),
			],
		});
		expect(lines(content)[1]).toBe(
			"02/11/2026;Saída;Combustível;Combustível;Dinheiro;40,00;;",
		);
	});

	it("estorno entra no tipo original com o sinal invertido", () => {
		const { content } = ledgerCsv({
			month: "2026-11",
			entries: [
				entry({
					direction: "OUT",
					amountCents: 5000,
					reversalOfId: "a",
					description: "Estorno de Sinal da LOC-0029: lançado errado",
				}),
			],
		});
		expect(lines(content)[1]).toBe(
			"02/11/2026;Entrada;Locações;Estorno de Sinal da LOC-0029: lançado errado;Pix;-50,00;LOC-0029;MAR-002",
		);
	});

	it("protege separador, aspas e fórmula", () => {
		const { content } = ledgerCsv({
			month: "2026-11",
			entries: [
				entry({ description: 'Disco "fino"; 2 unidades' }),
				entry({ description: "=1+1" }),
			],
		});
		expect(lines(content)[1]).toContain('"Disco ""fino""; 2 unidades"');
		expect(lines(content)[2]).toContain(";'=1+1;");
	});

	it("só entra o mês pedido, em ordem de data", () => {
		const { content } = ledgerCsv({
			month: "2026-11",
			entries: [
				entry({ occurredAt: "2026-11-20T15:00:00Z", description: "depois" }),
				entry({ occurredAt: "2026-11-02T15:00:00Z", description: "antes" }),
				entry({ occurredAt: "2026-10-31T15:00:00Z", description: "fora" }),
			],
		});
		const body = lines(content).slice(1);
		expect(body).toHaveLength(2);
		expect(body[0]).toContain("antes");
		expect(body[1]).toContain("depois");
	});
});
