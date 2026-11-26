import { describe, expect, it } from "vitest";
import {
	type CatalogFeedItem,
	catalogFeedCsv,
	catalogPrice,
	isUnitListable,
	photoVersionOf,
} from "./catalog-feed";

const options = {
	landingUrl: "https://marinholocacoes.com/",
	apiUrl: "https://api.marinholocacoes.com",
};

const martelete: CatalogFeedItem = {
	code: "MAR-001",
	title: "Martelete Bosch GBH 2-28 D",
	description: "Fura concreto, laje e alvenaria.",
	dailyPriceCents: 8000,
	perPiece: false,
	brand: "Bosch",
	available: true,
	photoVersion: "0193a1b2",
};

describe("catalogFeedCsv", () => {
	it("gera o cabeçalho e uma linha por item", () => {
		const lines = catalogFeedCsv([martelete], options).trimEnd().split("\n");
		expect(lines[0]).toBe(
			"id,title,description,availability,condition,price,link,image_link,brand",
		);
		expect(lines).toHaveLength(4);
		expect(lines[0 + 1]).toBe(
			'MAR-001,Martelete Bosch GBH 2-28 D,"Fura concreto, laje e alvenaria.',
		);
		expect(lines[3]).toBe(
			'Valor por diária. Equipamento testado e revisado antes de cada locação. Entrega e coleta na obra em Cajueiro e região.",in stock,used,80.00 BRL,https://marinholocacoes.com/?utm_source=meta&utm_medium=catalogo&utm_content=MAR-001,https://api.marinholocacoes.com/catalogo/fotos/MAR-001?v=0193a1b2,Bosch',
		);
	});

	it("escapa aspas e usa a marca da locadora quando falta", () => {
		const csv = catalogFeedCsv(
			[
				{
					...martelete,
					code: "ANDAIME",
					title: 'Andaime 1 x 1,5 m "tubular"',
					description: "Andaime para fachada.",
					perPiece: true,
					brand: null,
					available: false,
				},
			],
			options,
		);
		expect(csv).toContain('ANDAIME,"Andaime 1 x 1,5 m ""tubular""",');
		expect(csv).toContain("Valor por peça, por diária.");
		expect(csv).toContain(",out of stock,used,80.00 BRL,");
		expect(csv.trimEnd().endsWith(",Marinho Locações")).toBe(true);
	});

	it("sem itens fica só o cabeçalho", () => {
		expect(catalogFeedCsv([], options)).toBe(
			"id,title,description,availability,condition,price,link,image_link,brand\n",
		);
	});
});

describe("auxiliares", () => {
	it("preço no formato da Meta", () => {
		expect(catalogPrice(200)).toBe("2.00 BRL");
		expect(catalogPrice(10000)).toBe("100.00 BRL");
	});

	it("unidade em manutenção ou baixada sai como fora de estoque", () => {
		expect(isUnitListable("AVAILABLE")).toBe(true);
		expect(isUnitListable("RENTED")).toBe(true);
		expect(isUnitListable("IN_MAINTENANCE")).toBe(false);
		expect(isUnitListable("RETIRED")).toBe(false);
	});

	it("versão da foto vem do nome do arquivo", () => {
		expect(photoVersionOf("UNIT_PHOTO/2026/11/0193a1b2-c3d4.jpg")).toBe(
			"0193a1b2-c3d4",
		);
	});
});
