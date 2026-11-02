import type { FileRef } from "@marinho-gestao/contract";
import type { DbClient, Prisma } from "@marinho-gestao/db";
import { signedAmountCents } from "@marinho-gestao/domain";
import type {
	CustomerRecord,
	DepositRecord,
	InspectionRecord,
	LedgerRecord,
	LotRecord,
	MaintenanceRecord,
	PaymentRecord,
	RentalEventRecord,
	RentalRecord,
	Snapshot,
	TypeRecord,
	UnitRecord,
} from "@marinho-gestao/read-model";

export type SnapshotScope = {
	rentals?: Prisma.RentalWhereInput | null;
	history?: boolean;
	customers?: Prisma.CustomerWhereInput | null;
	ledger?: Prisma.LedgerEntryWhereInput | null;
	inspections?: Prisma.InspectionWhereInput | null;
	maintenance?: Prisma.MaintenanceOrderWhereInput;
	lostDemand?: Prisma.LostDemandWhereInput | null;
	activeCatalogOnly?: boolean;
};

const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null =>
	value ? value.toISOString() : null;

const checklistOrder = { orderBy: { position: "asc" } } as const;

const ledgerInclude = {
	rental: { select: { code: true } },
	unit: { select: { code: true } },
	maintenanceOrder: { select: { code: true } },
	reversedBy: { select: { id: true, occurredAt: true } },
} satisfies Prisma.LedgerEntryInclude;

type LedgerRow = Prisma.LedgerEntryGetPayload<{
	include: typeof ledgerInclude;
}>;

const rentalInclude = {
	items: {
		orderBy: { position: "asc" },
		include: {
			unit: { select: { code: true } },
			lot: { select: { code: true } },
		},
	},
	occurrences: { orderBy: { createdAt: "asc" } },
	ledgerEntries: { include: ledgerInclude },
} satisfies Prisma.RentalInclude;

type RentalRow = Prisma.RentalGetPayload<{ include: typeof rentalInclude }>;

const inspectionInclude = {
	rentalItem: {
		select: {
			rental: { select: { code: true } },
			unit: { select: { code: true } },
			lot: { select: { code: true } },
		},
	},
	answers: { orderBy: { position: "asc" } },
	media: true,
} satisfies Prisma.InspectionInclude;

type InspectionRow = Prisma.InspectionGetPayload<{
	include: typeof inspectionInclude;
}>;

export function ledgerRecord(row: LedgerRow): LedgerRecord {
	return {
		id: row.id,
		account: row.account,
		direction: row.direction,
		category: row.category,
		amountCents: row.amountCents,
		occurredAt: iso(row.occurredAt),
		method: row.method,
		description: row.description,
		rentalNumber: row.rental?.code ?? null,
		unitCode: row.unit?.code ?? null,
		receiptFileKey: row.receiptFileKey,
		recordedBy: row.recordedByName,
		maintenanceNumber: row.maintenanceOrder?.code ?? null,
		paymentId: row.paymentKind ? row.id : null,
		pairId: row.pairId,
		reversalOfId: row.reversalOfId,
		reversalReason: row.reversalOfId ? row.reason : null,
	};
}

function latestActive(rows: LedgerRow[], category: LedgerRow["category"]) {
	return rows
		.filter(
			(row) =>
				row.category === category &&
				row.reversalOfId === null &&
				row.reversedBy === null,
		)
		.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
}

function netCents(rows: LedgerRow[], category: LedgerRow["category"]): number {
	return rows
		.filter((row) => row.category === category)
		.reduce((total, row) => total + signedAmountCents(row), 0);
}

function depositOf(rows: LedgerRow[]): DepositRecord {
	const deposit = rows.filter((row) => row.account === "DEPOSIT");
	const receivedCents = netCents(deposit, "DEPOSIT_RECEIVED");
	const refundedCents = netCents(deposit, "DEPOSIT_REFUNDED");
	const retainedCents = netCents(deposit, "DEPOSIT_TO_CASH");
	const received =
		receivedCents > 0 ? latestActive(deposit, "DEPOSIT_RECEIVED") : undefined;
	const refunded =
		refundedCents > 0 ? latestActive(deposit, "DEPOSIT_REFUNDED") : undefined;
	const retained =
		retainedCents > 0 ? latestActive(deposit, "DEPOSIT_TO_CASH") : undefined;
	return {
		receivedCents,
		receivedAt: received ? iso(received.occurredAt) : null,
		receivedMethod: received?.method ?? null,
		refundedCents,
		refundedAt: refunded ? iso(refunded.occurredAt) : null,
		refundedMethod: refunded?.method ?? null,
		retainedCents,
		retentionReason: retained?.reason ?? null,
		retainedAt: retained ? iso(retained.occurredAt) : null,
	};
}

function paymentsOf(rows: LedgerRow[]): PaymentRecord[] {
	return rows.flatMap((row) =>
		row.paymentKind && row.reversalOfId === null
			? [
					{
						id: row.id,
						kind: row.paymentKind,
						amountCents: row.amountCents,
						method: row.method,
						paidAt: iso(row.occurredAt),
						recordedBy: row.recordedByName,
						reversedAt: row.reversedBy ? iso(row.reversedBy.occurredAt) : null,
					},
				]
			: [],
	);
}

function itemCode(item: RentalRow["items"][number]): string {
	return item.unit?.code ?? item.lot?.code ?? item.id;
}

export function rentalRecord(
	row: RentalRow,
	history: RentalEventRecord[],
): RentalRecord {
	const codeOfItem = new Map(
		row.items.map((item) => [item.id, itemCode(item)]),
	);
	return {
		id: row.id,
		number: row.code,
		status: row.status,
		customerId: row.customerId,
		startAt: iso(row.startsAt),
		endAt: iso(row.endsAt),
		items: row.items.map((item) => ({
			id: item.id,
			kind: item.unitId ? "UNIT" : "LOT",
			code: itemCode(item),
			quantity: item.quantity,
			frozenDailyPriceCents: item.dailyPriceCents,
			frozenDepositCents: item.depositCents,
			checkoutDoneAt: isoOrNull(item.checkoutDoneAt),
			returnDoneAt: isoOrNull(item.returnDoneAt),
		})),
		deliveryMode: row.deliveryMode,
		siteAddress: row.siteAddress,
		siteCity: row.siteCity,
		sitePinUrl: row.sitePinUrl,
		receiverName: row.receiverName,
		termSigned: row.termSigned,
		notes: row.notes,
		deliveryFeeCents: row.deliveryFeeCents,
		discountCents: row.discountCents,
		payments: paymentsOf(row.ledgerEntries),
		deposit: depositOf(row.ledgerEntries),
		occurrences: row.occurrences.map((occurrence) => ({
			id: occurrence.id,
			itemCode: codeOfItem.get(occurrence.rentalItemId) ?? "",
			kind: occurrence.kind,
			description: occurrence.description,
			suggestedCents: occurrence.suggestedCents,
			amountCents: occurrence.amountCents,
			decision: occurrence.decision,
			createdAt: iso(occurrence.createdAt),
		})),
		history,
		signalDueAt: isoOrNull(row.depositDeadlineAt),
		priceFrozenAt: isoOrNull(row.priceFrozenAt),
		cancelReason: row.cancelReason,
		lateNoticeGiven: row.lateNoticeGiven,
		createdAt: iso(row.createdAt),
		sentAt: isoOrNull(row.sentAt),
		confirmedAt: isoOrNull(row.confirmedAt),
		separatedAt: isoOrNull(row.separatedAt),
		deliveredAt: isoOrNull(row.deliveredAt),
		returnedAt: isoOrNull(row.returnedAt),
		closedAt: isoOrNull(row.closedAt),
	};
}

function inspectionRecord(row: InspectionRow): InspectionRecord {
	return {
		id: row.id,
		rentalNumber: row.rentalItem.rental.code,
		itemCode: row.rentalItem.unit?.code ?? row.rentalItem.lot?.code ?? "",
		kind: row.kind,
		completedAt: isoOrNull(row.completedAt),
		items: row.answers.map((answer) => ({
			id: answer.key,
			label: answer.label,
			note: answer.note,
			occurrenceKind: answer.occurrenceKind,
			answer: answer.answer,
			observation: answer.observation,
			preexisting: answer.preexisting,
		})),
		media: row.media.map((media) => ({
			slot: media.slot,
			fileKey: media.fileKey,
		})),
	};
}

async function loadHistory(
	db: DbClient,
	rentalIds: string[],
): Promise<Map<string, RentalEventRecord[]>> {
	const events = await db.event.findMany({
		where: { entity: "Rental", entityId: { in: rentalIds } },
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
	});
	const byRental = new Map<string, RentalEventRecord[]>();
	for (const event of events) {
		if (!event.message) continue;
		const list = byRental.get(event.entityId) ?? [];
		list.push({
			id: event.id,
			at: iso(event.createdAt),
			message: event.message,
			actorName: event.actorName,
			actorRole: event.actorRole,
		});
		byRental.set(event.entityId, list);
	}
	return byRental;
}

async function loadLedger(
	db: DbClient,
	where: Prisma.LedgerEntryWhereInput,
): Promise<LedgerRecord[]> {
	const rows = await db.ledgerEntry.findMany({ where, include: ledgerInclude });
	const loaded = new Set(rows.map((row) => row.id));
	const linkedIds = rows.flatMap((row) =>
		[row.reversalOfId, row.reversedBy?.id].filter(
			(id): id is string => id !== null && id !== undefined && !loaded.has(id),
		),
	);
	const pairIds = rows
		.map((row) => row.pairId)
		.filter((id): id is string => id !== null);
	const linked =
		linkedIds.length > 0 || pairIds.length > 0
			? await db.ledgerEntry.findMany({
					where: {
						id: { notIn: [...loaded] },
						OR: [{ id: { in: linkedIds } }, { pairId: { in: pairIds } }],
					},
					include: ledgerInclude,
				})
			: [];
	return [...rows, ...linked].map(ledgerRecord);
}

export async function loadSnapshot(
	db: DbClient,
	scope: SnapshotScope = {},
): Promise<Snapshot> {
	const catalogWhere = scope.activeCatalogOnly ? { archivedAt: null } : {};
	const [typeRows, unitRows, lotRows, settingsRow, feeRows] = await Promise.all(
		[
			db.equipmentType.findMany({
				where: catalogWhere,
				include: { checklist: checklistOrder },
				orderBy: { createdAt: "asc" },
			}),
			db.unit.findMany({
				where: catalogWhere,
				include: {
					photos: true,
					knownDamages: { orderBy: { recordedAt: "asc" } },
				},
				orderBy: { code: "asc" },
			}),
			db.lot.findMany({
				where: catalogWhere,
				include: { checklist: checklistOrder },
				orderBy: { createdAt: "asc" },
			}),
			db.settings.findUnique({ where: { id: 1 } }),
			db.deliveryFee.findMany({ orderBy: { position: "asc" } }),
		],
	);

	const rentalRows = scope.rentals
		? await db.rental.findMany({
				where: scope.rentals,
				include: rentalInclude,
				orderBy: { code: "asc" },
			})
		: [];
	const history = scope.history
		? await loadHistory(
				db,
				rentalRows.map((row) => row.id),
			)
		: new Map<string, RentalEventRecord[]>();

	const customerIds = [...new Set(rentalRows.map((row) => row.customerId))];
	const customerWhere: Prisma.CustomerWhereInput = scope.customers
		? { OR: [scope.customers, { id: { in: customerIds } }] }
		: { id: { in: customerIds } };
	const [customerRows, inspectionRows, maintenanceRows, lostRows, ledger] =
		await Promise.all([
			db.customer.findMany({
				where: customerWhere,
				include: { documents: { orderBy: { receivedAt: "asc" } } },
				orderBy: { createdAt: "asc" },
			}),
			scope.inspections
				? db.inspection.findMany({
						where: scope.inspections,
						include: inspectionInclude,
					})
				: Promise.resolve([]),
			db.maintenanceOrder.findMany({
				where: scope.maintenance ?? { status: { not: "DONE" } },
				include: { unit: { select: { code: true } } },
				orderBy: { code: "asc" },
			}),
			scope.lostDemand
				? db.lostDemand.findMany({ where: scope.lostDemand })
				: Promise.resolve([]),
			scope.ledger ? loadLedger(db, scope.ledger) : Promise.resolve([]),
		]);

	const types: TypeRecord[] = typeRows.map((row) => ({
		id: row.id,
		name: row.name,
		nicknames: row.nicknames,
		description: row.description,
		dailyPriceCents: row.dailyPriceCents,
		depositCents: row.depositCents,
		turnaroundHours: row.turnaroundHours,
		accessories: row.accessories,
		checklist: row.checklist.map((item) => ({
			id: item.key,
			label: item.label,
			note: item.note,
			occurrenceKind: item.occurrenceKind,
		})),
	}));

	const units: UnitRecord[] = unitRows.map((row) => ({
		id: row.id,
		code: row.code,
		typeId: row.typeId,
		name: row.name,
		shortName: row.shortName,
		status: row.status,
		statusReason: row.statusReason,
		voltage: row.voltage,
		serialNumber: row.serialNumber,
		accessories: row.accessories,
		owner: row.owner,
		labelApplied: row.labelApplied,
		purchaseValueCents: row.purchaseCents,
		replacementValueCents: row.replacementCents,
		notes: row.notes,
		returnedAt: isoOrNull(row.returnedAt),
		photos: row.photos.map((photo) => ({
			slot: photo.slot,
			fileKey: photo.fileKey,
		})),
		knownDamages: row.knownDamages.map((damage) => ({
			id: damage.id,
			description: damage.description,
			recordedAt: iso(damage.recordedAt),
			recordedBy: damage.recordedByName,
			fileKey: damage.fileKey,
		})),
	}));

	const lots: LotRecord[] = lotRows.map((row) => ({
		id: row.id,
		code: row.code,
		name: row.name,
		nicknames: row.nicknames,
		pricing: row.pricing,
		total: row.total,
		inMaintenance: row.inMaintenance,
		retired: row.retired,
		dailyPriceCents: row.dailyPriceCents,
		depositCents: row.depositCents,
		kitComposition: row.kitComposition,
		assetCode: row.assetCode,
		turnaroundHours: row.turnaroundHours,
		checklist: row.checklist.map((item) => ({
			id: item.key,
			label: item.label,
			note: item.note,
			occurrenceKind: item.occurrenceKind,
		})),
	}));

	const customers: CustomerRecord[] = customerRows.map((row) => ({
		id: row.id,
		kind: row.kind,
		name: row.name,
		taxId: row.taxId,
		responsible: row.responsible,
		authorizedReceivers: row.authorizedReceivers,
		whatsapp: row.whatsapp,
		alternatePhone: row.alternatePhone,
		address: row.address,
		neighborhood: row.neighborhood,
		city: row.city,
		occupation: row.occupation,
		origin: row.origin,
		referredBy: row.referredBy,
		acceptsPromotions: row.acceptsPromotions,
		notes: row.notes,
		blockedManually: row.blockedAt !== null,
		blockReason: row.blockedReason,
		createdAt: iso(row.createdAt),
		documents: row.documents.map((document) => ({
			id: document.id,
			kind: document.kind,
			receivedAt: iso(document.receivedAt),
			fileKey: document.fileKey,
		})),
	}));

	const maintenance: MaintenanceRecord[] = maintenanceRows.map((row) => ({
		id: row.id,
		number: row.code,
		unitCode: row.unit.code,
		reason: row.reason,
		location: row.location,
		locationName: row.locationName,
		estimatedCostCents: row.estimatedCostCents,
		finalCostCents: row.finalCostCents,
		expectedBackAt: isoOrNull(row.expectedBackAt),
		status: row.status,
		openedAt: iso(row.openedAt),
		completedAt: isoOrNull(row.completedAt),
	}));

	const rentals = rentalRows.map((row) =>
		rentalRecord(row, history.get(row.id) ?? []),
	);
	const inspections = inspectionRows.map(inspectionRecord);

	const fileKeys = [
		...units.flatMap((unit) => [
			...unit.photos.map((photo) => photo.fileKey),
			...unit.knownDamages.flatMap((damage) =>
				damage.fileKey ? [damage.fileKey] : [],
			),
		]),
		...customers.flatMap((customer) =>
			customer.documents.map((document) => document.fileKey),
		),
		...inspections.flatMap((inspection) =>
			inspection.media.map((media) => media.fileKey),
		),
	];
	const uploads =
		fileKeys.length > 0
			? await db.upload.findMany({
					where: { fileKey: { in: fileKeys }, status: "COMPLETED" },
				})
			: [];
	const files: Record<string, FileRef> = Object.fromEntries(
		uploads.map((upload) => [
			upload.fileKey,
			{
				fileKey: upload.fileKey,
				contentType: upload.contentType,
				sizeBytes: upload.sizeBytes,
				uploadedAt: iso(upload.completedAt ?? upload.createdAt),
			},
		]),
	);

	return {
		types,
		units,
		lots,
		customers,
		rentals,
		inspections,
		ledger,
		maintenance,
		lostDemand: lostRows.map((row) => ({
			id: row.id,
			item: row.item,
			typeId: row.typeId,
			reason: row.reason,
			city: row.city,
			requestedOn: iso(row.requestedOn).slice(0, 10),
			recordedBy: row.recordedByName,
		})),
		settings: {
			deliveryFees: feeRows.map((fee) => ({
				city: fee.city,
				feeCents: fee.feeCents,
			})),
			signal: {
				mode: settingsRow?.signalMode ?? null,
				valueCents: settingsRow?.signalValueCents ?? null,
				percent: settingsRow?.signalPercent ?? null,
			},
			signalDeadlineHours: settingsRow?.signalDeadlineHours ?? 24,
		},
		files,
	};
}
