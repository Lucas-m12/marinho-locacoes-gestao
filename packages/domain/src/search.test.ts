import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch } from "./search";

describe("normalizeSearch", () => {
	it("tira acento e caixa", () => {
		expect(normalizeSearch("  Serra MÁRMORE ")).toBe("serra marmore");
	});
});

describe("matchesSearch", () => {
	const target = ["MAR-008", "Serra mármore Makita 4100NH3", "maquita"];

	it("acha pelo apelido", () => {
		expect(matchesSearch("maquita", target)).toBe(true);
	});

	it("acha pelo código e sem acento", () => {
		expect(matchesSearch("mar-008", target)).toBe(true);
		expect(matchesSearch("marmore", target)).toBe(true);
	});

	it("exige todos os termos", () => {
		expect(matchesSearch("serra makita", target)).toBe(true);
		expect(matchesSearch("serra bosch", target)).toBe(false);
	});

	it("busca vazia casa com tudo", () => {
		expect(matchesSearch("  ", target)).toBe(true);
	});

	it("ignora campos vazios", () => {
		expect(matchesSearch("x", [null, undefined])).toBe(false);
	});
});
