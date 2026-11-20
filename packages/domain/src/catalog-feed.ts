import type { UnitStatus } from "./enums";

/**
 * Item do catálogo público (Meta: Instagram, Facebook e anúncios de catálogo).
 * Só entra no arquivo o que tem foto, texto e diária.
 */
export type CatalogFeedItem = {
	code: string;
	title: string;
	description: string;
	dailyPriceCents: number;
	perPiece: boolean;
	brand: string | null;
	available: boolean;
	/** Parte final da chave da foto, usada para a Meta baixar a foto nova quando ela muda. */
	photoVersion: string;
};

export type CatalogFeedOptions = {
	/** Página para onde o item leva (a landing). */
	landingUrl: string;
	/** Endereço público da API, de onde a Meta baixa as fotos. */
	apiUrl: string;
};

export const CATALOG_FEED_COLUMNS = [
	"id",
	"title",
	"description",
	"availability",
	"condition",
	"price",
	"link",
	"image_link",
	"brand",
] as const;

const DEFAULT_BRAND = "Marinho Locações";
const FOOTER =
	"Equipamento testado e revisado antes de cada locação. Entrega e coleta na obra em Cajueiro e região.";

/** Unidades nesses status não podem ser alugadas tão cedo: saem como "fora de estoque". */
const UNAVAILABLE_STATUSES: readonly UnitStatus[] = [
	"IN_MAINTENANCE",
	"DAMAGED",
	"NOT_RETURNED",
	"BLOCKED",
	"RETIRED",
];

export function isUnitListable(status: UnitStatus): boolean {
	return !UNAVAILABLE_STATUSES.includes(status);
}

export function catalogPrice(cents: number): string {
	return `${(cents / 100).toFixed(2)} BRL`;
}

export function catalogDescriptionText(item: CatalogFeedItem): string {
	const unit = item.perPiece ? "por peça, por diária" : "por diária";
	return `${item.description.trim()}\n\nValor ${unit}. ${FOOTER}`;
}

function csvCell(value: string): string {
	return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function trimSlash(url: string): string {
	return url.replace(/\/+$/, "");
}

export function catalogFeedCsv(
	items: readonly CatalogFeedItem[],
	options: CatalogFeedOptions,
): string {
	const landing = trimSlash(options.landingUrl);
	const api = trimSlash(options.apiUrl);
	const rows = items.map((item) => {
		const code = encodeURIComponent(item.code);
		return [
			item.code,
			item.title,
			catalogDescriptionText(item),
			item.available ? "in stock" : "out of stock",
			"used",
			catalogPrice(item.dailyPriceCents),
			`${landing}/?utm_source=meta&utm_medium=catalogo&utm_content=${code}`,
			`${api}/catalogo/fotos/${code}?v=${encodeURIComponent(item.photoVersion)}`,
			item.brand?.trim() || DEFAULT_BRAND,
		];
	});
	return `${[CATALOG_FEED_COLUMNS, ...rows]
		.map((row) => row.map((cell) => csvCell(cell)).join(","))
		.join("\n")}\n`;
}

/** A parte final da chave do arquivo (o nome com uuid), sem a extensão. */
export function photoVersionOf(fileKey: string): string {
	const name = fileKey.split("/").at(-1) ?? fileKey;
	return name.replace(/\.[^.]+$/, "");
}
