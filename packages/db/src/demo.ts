import {
	addHours,
	codeSequence,
	holdsBooking,
	internalEmail,
} from "@marinho-gestao/domain";
import {
	type DemoSeed,
	SEED_FILE_CONTENT_TYPE,
} from "@marinho-gestao/read-model/seed";
import { stableUuid } from "./ids";
import type { Database, Prisma, Transaction } from "./index";
import { truncateBusinessTables } from "./maintenance-tasks";

function byKey<T>(entries: readonly T[], key: (entry: T) => string) {
	const map = new Map(entries.map((entry) => [key(entry), entry]));
	return (value: string): T => {
		const found = map.get(value);
		if (!found) throw new Error(`seed de demonstração sem ${value}`);
		return found;
	};
}

function highest(prefix: "LOC" | "OS" | "MAR", codes: readonly string[]) {
	return Math.max(0, ...codes.map((code) => codeSequence(prefix, code) ?? 0));
}

async function insertDemoUsers(
	tx: Transaction,
	users: DemoSeed["users"],
	passwordHash: string,
): Promise<void> {
	if (users.length === 0) return;
	await tx.user.createMany({
		data: users.map((user) => ({
			id: user.id,
			name: user.name,
			email: internalEmail(user.username),
			emailVerified: true,
			username: user.username,
			displayUsername: user.username,
			role: user.role,
		})),
	});
	await tx.account.createMany({
		data: users.map((user) => ({
			id: `account-${user.id}`,
			accountId: user.id,
			providerId: "credential",
			userId: user.id,
			password: passwordHash,
		})),
	});
}

export async function loadDemoSeed(
	db: Database,
	seed: DemoSeed,
	passwordHash: string,
	now: Date = new Date(),
): Promise<void> {
	await db.$transaction(
		async (tx) => {
			await insertDemoUsers(tx, seed.users, passwordHash);
			await insertDemoData(tx, seed, now);
		},
		{ timeout: 60_000 },
	);
}

export async function reloadDemoData(
	db: Database,
	seed: DemoSeed,
	passwordHash: string,
	now: Date,
): Promise<void> {
	await truncateBusinessTables(db);
	await db.$transaction(
		async (tx) => {
			const existing = new Set(
				(
					await tx.user.findMany({
						where: { id: { in: seed.users.map((user) => user.id) } },
						select: { id: true },
					})
				).map((user) => user.id),
			);
			await insertDemoUsers(
				tx,
				seed.users.filter((user) => !existing.has(user.id)),
				passwordHash,
			);
			await insertDemoData(tx, seed, now);
		},
		{ timeout: 60_000 },
	);
}

async function insertDemoData(
	tx: Transaction,
	seed: DemoSeed,
	now: Date,
): Promise<void> {
	const userByName = byKey(seed.users, (user) => user.name);
	const unitByCode = byKey(seed.units, (unit) => unit.code);
	const lotByCode = byKey(seed.lots, (lot) => lot.code);
	const rentalByNumber = byKey(seed.rentals, (rental) => rental.number);
	const orderByNumber = byKey(seed.maintenance, (order) => order.number);
	const typeById = byKey(seed.types, (type) => type.id);

	const turnaroundOf = (kind: "UNIT" | "LOT", code: string) =>
		kind === "LOT"
			? lotByCode(code).turnaroundHours
			: typeById(unitByCode(code).typeId).turnaroundHours;

	const itemId = (rentalNumber: string, code: string) => {
		const rental = rentalByNumber(rentalNumber);
		const item = rental.items.find((entry) => entry.code === code);
		if (!item) throw new Error(`seed sem item ${code} na ${rentalNumber}`);
		return stableUuid(item.id);
	};

	const actor = (name: string) => {
		const user = userByName(name);
		return { id: user.id, name: user.name };
	};

	await tx.settings.create({
		data: {
			id: 1,
			signalMode: seed.settings.signal.mode,
			signalValueCents: seed.settings.signal.valueCents,
			signalPercent: seed.settings.signal.percent,
			signalDeadlineHours: seed.settings.signalDeadlineHours,
			defaultTurnaroundHours: 12,
		},
	});
	await tx.deliveryFee.createMany({
		data: seed.settings.deliveryFees.map((fee, position) => ({
			city: fee.city,
			feeCents: fee.feeCents,
			position,
		})),
	});

	await tx.equipmentType.createMany({
		data: seed.types.map((type) => ({
			id: stableUuid(type.id),
			name: type.name,
			nicknames: type.nicknames,
			description: type.description,
			dailyPriceCents: type.dailyPriceCents,
			depositCents: type.depositCents,
			turnaroundHours: type.turnaroundHours,
			accessories: type.accessories,
		})),
	});
	await tx.lot.createMany({
		data: seed.lots.map((lot) => ({
			id: stableUuid(lot.id),
			code: lot.code,
			name: lot.name,
			nicknames: lot.nicknames,
			pricing: lot.pricing,
			total: lot.total,
			inMaintenance: lot.inMaintenance,
			retired: lot.retired,
			dailyPriceCents: lot.dailyPriceCents,
			depositCents: lot.depositCents,
			kitComposition: lot.kitComposition,
			assetCode: lot.assetCode,
			turnaroundHours: lot.turnaroundHours,
		})),
	});
	await tx.checklistItem.createMany({
		data: [
			...seed.types.flatMap((type) =>
				type.checklist.map((item, position) => ({
					typeId: stableUuid(type.id),
					key: item.id,
					position,
					label: item.label,
					note: item.note,
					occurrenceKind: item.occurrenceKind,
				})),
			),
			...seed.lots.flatMap((lot) =>
				lot.checklist.map((item, position) => ({
					lotId: stableUuid(lot.id),
					key: item.id,
					position,
					label: item.label,
					note: item.note,
					occurrenceKind: item.occurrenceKind,
				})),
			),
		],
	});

	await tx.unit.createMany({
		data: seed.units.map((unit) => ({
			id: stableUuid(unit.id),
			code: unit.code,
			typeId: stableUuid(unit.typeId),
			name: unit.name,
			shortName: unit.shortName,
			status: unit.status,
			statusReason: unit.statusReason,
			voltage: unit.voltage,
			serialNumber: unit.serialNumber,
			accessories: unit.accessories,
			owner: unit.owner,
			labelApplied: unit.labelApplied,
			purchaseCents: unit.purchaseValueCents,
			replacementCents: unit.replacementValueCents,
			notes: unit.notes,
			returnedAt: unit.returnedAt,
		})),
	});
	await tx.knownDamage.createMany({
		data: seed.units.flatMap((unit) =>
			unit.knownDamages.map((damage) => ({
				id: stableUuid(damage.id),
				unitId: stableUuid(unit.id),
				description: damage.description,
				fileKey: damage.fileKey,
				recordedById: actor(damage.recordedBy).id,
				recordedByName: damage.recordedBy,
				recordedAt: damage.recordedAt,
			})),
		),
	});

	await tx.customer.createMany({
		data: seed.customers.map((customer) => ({
			id: stableUuid(customer.id),
			kind: customer.kind,
			name: customer.name,
			taxId: customer.taxId,
			responsible: customer.responsible,
			authorizedReceivers: customer.authorizedReceivers,
			whatsapp: customer.whatsapp,
			alternatePhone: customer.alternatePhone,
			address: customer.address,
			neighborhood: customer.neighborhood,
			city: customer.city,
			occupation: customer.occupation,
			origin: customer.origin,
			referredBy: customer.referredBy,
			acceptsPromotions: customer.acceptsPromotions,
			notes: customer.notes,
			blockedAt: customer.blockedManually ? customer.createdAt : null,
			blockedReason: customer.blockReason,
			createdAt: customer.createdAt,
		})),
	});
	const documents = seed.customers.flatMap((customer) =>
		customer.documents.map((document) => ({ customer, document })),
	);
	await tx.customerDocument.createMany({
		data: documents.map(({ customer, document }) => ({
			id: stableUuid(document.id),
			customerId: stableUuid(customer.id),
			kind: document.kind,
			fileKey: document.fileKey,
			receivedAt: document.receivedAt,
		})),
	});
	await tx.upload.createMany({
		data: documents.map(({ document }) => ({
			fileKey: document.fileKey,
			purpose: "CUSTOMER_DOCUMENT" as const,
			contentType: SEED_FILE_CONTENT_TYPE,
			sizeBytes: 0,
			status: "COMPLETED" as const,
			uploadedById: actor("Atendimento").id,
			createdAt: document.receivedAt,
			completedAt: document.receivedAt,
		})),
	});

	await tx.rental.createMany({
		data: seed.rentals.map((rental) => ({
			id: stableUuid(rental.id),
			code: rental.number,
			customerId: stableUuid(rental.customerId),
			status: rental.status,
			deliveryMode: rental.deliveryMode,
			siteAddress: rental.siteAddress,
			siteCity: rental.siteCity,
			sitePinUrl: rental.sitePinUrl,
			receiverName: rental.receiverName,
			termSigned: rental.termSigned,
			notes: rental.notes,
			startsAt: rental.startAt,
			endsAt: rental.endAt,
			depositDeadlineAt: rental.signalDueAt,
			deliveryFeeCents: rental.deliveryFeeCents,
			discountCents: rental.discountCents,
			priceFrozenAt: rental.priceFrozenAt,
			cancelReason: rental.cancelReason,
			lateNoticeGiven: rental.lateNoticeGiven,
			sentAt: rental.sentAt,
			confirmedAt: rental.confirmedAt,
			separatedAt: rental.separatedAt,
			deliveredAt: rental.deliveredAt,
			returnedAt: rental.returnedAt,
			closedAt: rental.closedAt,
			createdAt: rental.createdAt,
		})),
	});
	await tx.rentalItem.createMany({
		data: seed.rentals.flatMap((rental) =>
			rental.items.map(
				(item, position): Prisma.RentalItemCreateManyInput => ({
					id: stableUuid(item.id),
					rentalId: stableUuid(rental.id),
					position,
					unitId:
						item.kind === "UNIT" ? stableUuid(unitByCode(item.code).id) : null,
					lotId:
						item.kind === "LOT" ? stableUuid(lotByCode(item.code).id) : null,
					quantity: item.quantity,
					dailyPriceCents: item.frozenDailyPriceCents,
					depositCents: item.frozenDepositCents,
					startsAt: rental.startAt,
					blockedUntil: addHours(
						rental.endAt,
						turnaroundOf(item.kind, item.code),
					),
					holdsCalendar:
						holdsBooking(rental.status) && item.returnDoneAt === null,
					checkoutDoneAt: item.checkoutDoneAt,
					returnDoneAt: item.returnDoneAt,
				}),
			),
		),
	});
	await tx.occurrence.createMany({
		data: seed.rentals.flatMap((rental) =>
			rental.occurrences.map((occurrence) => ({
				id: stableUuid(occurrence.id),
				rentalId: stableUuid(rental.id),
				rentalItemId: itemId(rental.number, occurrence.itemCode),
				kind: occurrence.kind,
				description: occurrence.description,
				suggestedCents: occurrence.suggestedCents,
				amountCents: occurrence.amountCents,
				decision: occurrence.decision,
				createdAt: occurrence.createdAt,
			})),
		),
	});
	await tx.event.createMany({
		data: seed.rentals.flatMap((rental) =>
			rental.history.map((event) => ({
				id: stableUuid(event.id),
				actorId: event.actorRole ? actor(event.actorName).id : null,
				actorName: event.actorName,
				actorRole: event.actorRole,
				action: "seed.history",
				entity: "Rental",
				entityId: stableUuid(rental.id),
				message: event.message,
				createdAt: event.at,
			})),
		),
	});

	for (const inspection of seed.inspections) {
		await tx.inspection.create({
			data: {
				id: stableUuid(inspection.id),
				rentalItemId: itemId(inspection.rentalNumber, inspection.itemCode),
				kind: inspection.kind,
				completedAt: inspection.completedAt,
				answers: {
					create: inspection.items.map((item, position) => ({
						key: item.id,
						position,
						label: item.label,
						note: item.note,
						occurrenceKind: item.occurrenceKind,
						answer: item.answer,
						observation: item.observation,
						preexisting: item.preexisting,
					})),
				},
				media: {
					create: inspection.media.map((media) => ({
						slot: media.slot,
						fileKey: media.fileKey,
					})),
				},
			},
		});
	}

	await tx.maintenanceOrder.createMany({
		data: seed.maintenance.map((order) => ({
			id: stableUuid(order.id),
			code: order.number,
			unitId: stableUuid(unitByCode(order.unitCode).id),
			reason: order.reason,
			location: order.location,
			locationName: order.locationName,
			estimatedCostCents: order.estimatedCostCents,
			finalCostCents: order.finalCostCents,
			expectedBackAt: order.expectedBackAt,
			status: order.status,
			openedAt: order.openedAt,
			completedAt: order.completedAt,
		})),
	});

	const paymentKind = (rentalNumber: string | null, paymentId: string) =>
		rentalNumber
			? (rentalByNumber(rentalNumber).payments.find(
					(payment) => payment.id === paymentId,
				)?.kind ?? null)
			: null;

	await tx.ledgerEntry.createMany({
		data: seed.ledger.map((entry) => ({
			id: stableUuid(entry.id),
			account: entry.account,
			direction: entry.direction,
			category: entry.category,
			amountCents: entry.amountCents,
			occurredAt: entry.occurredAt,
			method: entry.method,
			description: entry.description,
			rentalId: entry.rentalNumber
				? stableUuid(rentalByNumber(entry.rentalNumber).id)
				: null,
			unitId: entry.unitCode ? stableUuid(unitByCode(entry.unitCode).id) : null,
			maintenanceOrderId: entry.maintenanceNumber
				? stableUuid(orderByNumber(entry.maintenanceNumber).id)
				: null,
			paymentKind: entry.paymentId
				? paymentKind(entry.rentalNumber, entry.paymentId)
				: null,
			receiptFileKey: entry.receiptFileKey,
			pairId: entry.pairId ? stableUuid(entry.pairId) : null,
			reversalOfId: entry.reversalOfId ? stableUuid(entry.reversalOfId) : null,
			reason: entry.reversalReason,
			recordedById: actor(entry.recordedBy).id,
			recordedByName: entry.recordedBy,
			createdAt: now,
		})),
	});

	await tx.lostDemand.createMany({
		data: seed.lostDemand.map((record) => ({
			id: stableUuid(record.id),
			item: record.item,
			typeId: record.typeId ? stableUuid(record.typeId) : null,
			reason: record.reason,
			city: record.city,
			requestedOn: new Date(`${record.requestedOn}T00:00:00Z`),
			recordedById: actor(record.recordedBy).id,
			recordedByName: record.recordedBy,
		})),
	});

	await tx.counter.createMany({
		data: [
			{
				name: "LOC",
				value: highest(
					"LOC",
					seed.rentals.map((rental) => rental.number),
				),
			},
			{
				name: "OS",
				value: highest(
					"OS",
					seed.maintenance.map((order) => order.number),
				),
			},
			{
				name: "MAR",
				value: highest(
					"MAR",
					seed.units.map((unit) => unit.code),
				),
			},
		],
	});
}
