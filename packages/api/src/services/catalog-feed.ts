import type { Database } from "@marinho-gestao/db";
import {
	type CatalogFeedItem,
	isUnitListable,
	photoVersionOf,
} from "@marinho-gestao/domain";

/**
 * Itens do catálogo público. Entra só o que tem foto do catálogo, texto
 * público e diária definida; unidades e lotes arquivados ficam de fora.
 * Não expõe nada além do que já vai para o cliente no WhatsApp.
 */
export async function listCatalogFeedItems(
	db: Database,
): Promise<CatalogFeedItem[]> {
	const [units, lots] = await Promise.all([
		db.unit.findMany({
			where: {
				archivedAt: null,
				catalogDescription: { not: null },
				photos: { some: { slot: "CATALOG" } },
				type: { dailyPriceCents: { not: null } },
			},
			include: { type: true, photos: { where: { slot: "CATALOG" } } },
			orderBy: { code: "asc" },
		}),
		db.lot.findMany({
			where: {
				archivedAt: null,
				catalogDescription: { not: null },
				catalogPhotoKey: { not: null },
				dailyPriceCents: { not: null },
			},
			orderBy: { code: "asc" },
		}),
	]);

	const unitItems = units.flatMap((unit): CatalogFeedItem[] => {
		const photo = unit.photos[0];
		const price = unit.type.dailyPriceCents;
		if (!photo || price === null || !unit.catalogDescription) return [];
		return [
			{
				code: unit.code,
				title: unit.name,
				description: unit.catalogDescription,
				dailyPriceCents: price,
				perPiece: false,
				brand: unit.brand,
				available: isUnitListable(unit.status),
				photoVersion: photoVersionOf(photo.fileKey),
			},
		];
	});
	const lotItems = lots.flatMap((lot): CatalogFeedItem[] => {
		const price = lot.dailyPriceCents;
		if (!lot.catalogPhotoKey || price === null || !lot.catalogDescription) {
			return [];
		}
		return [
			{
				code: lot.code,
				title: lot.name,
				description: lot.catalogDescription,
				dailyPriceCents: price,
				perPiece: lot.pricing === "PER_PIECE",
				brand: null,
				available: lot.total - lot.inMaintenance - lot.retired > 0,
				photoVersion: photoVersionOf(lot.catalogPhotoKey),
			},
		];
	});
	return [...lotItems, ...unitItems];
}

/** Chave da foto do catálogo de uma unidade ou de um lote, se o item estiver no catálogo. */
export async function findCatalogPhotoKey(
	db: Database,
	code: string,
): Promise<string | null> {
	const unit = await db.unit.findFirst({
		where: { code, archivedAt: null },
		select: {
			photos: { where: { slot: "CATALOG" }, select: { fileKey: true } },
		},
	});
	if (unit) return unit.photos[0]?.fileKey ?? null;
	const lot = await db.lot.findFirst({
		where: { code, archivedAt: null },
		select: { catalogPhotoKey: true },
	});
	return lot?.catalogPhotoKey ?? null;
}
