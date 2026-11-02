import type {
	ConflictingItem,
	CreateQuoteInput,
	ExtendPreview,
	LostDemandRecord,
	RecordLostDemandInput,
	RecordPaymentInput,
	Rental,
	RentalTab,
} from "@marinho-gestao/contract";
import type { DbClient, Prisma, Transaction } from "@marinho-gestao/db";
import {
	addHours,
	EXTENDABLE_RENTAL_STATUSES,
	holdsBooking,
	PAYABLE_RENTAL_STATUSES,
	PAYMENT_LEDGER_CATEGORY,
	type RentalStatus,
	toMs,
} from "@marinho-gestao/domain";
import {
	assertAccepts,
	assertCustomerCanRent,
	assertPriced,
	assertRentalTransition,
	findConflicts,
	itemTablePrice,
	LEDGER_DESCRIPTIONS,
	listLostDemand as listLostDemandView,
	listRentals as listRentalsView,
	previewExtension,
	quoteText,
	RENTAL_EVENTS,
	type RentalRecord,
	rentalTotalCents,
	rentalView,
	requireCustomer,
	requireLot,
	requireRental,
	requireUnit,
	type Snapshot,
} from "@marinho-gestao/read-model";
import type { z } from "zod";
import {
	conflict,
	isExclusionViolation,
	notFound,
	precondition,
} from "../errors";
import { nextCodeFromCounter } from "./counters";
import { inTransaction, type ServiceDeps } from "./deps";
import { moveUnitStatus } from "./equipment";
import { recordEvent } from "./events";
import { expireStaleQuotes } from "./expire";
import { requireUsableFile } from "./files";
import { once } from "./idempotency";
import { lockLots, lockRental, requireUuid } from "./lookups";
import { HOLDING_RENTALS } from "./scopes";
import { loadSnapshot } from "./snapshot";

type RequestedItem = { kind: "UNIT" | "LOT"; code: string; quantity: number };

function customerRentalsOf(code: string): Prisma.RentalWhereInput {
	return { customer: { rentals: { some: { code } } } };
}

async function reservationSnapshot(
	db: DbClient,
	related: Prisma.RentalWhereInput,
): Promise<Snapshot> {
	return loadSnapshot(db, { rentals: { OR: [HOLDING_RENTALS, related] } });
}

export async function viewOfRental(
	db: DbClient,
	code: string,
	now: Date,
): Promise<Rental> {
	const snapshot = await loadSnapshot(db, {
		rentals: customerRentalsOf(code),
		history: true,
	});
	return rentalView(snapshot, requireRental(snapshot, code), now);
}

function turnaroundOf(snapshot: Snapshot, item: RequestedItem): number {
	if (item.kind === "LOT")
		return requireLot(snapshot, item.code).turnaroundHours;
	const unit = requireUnit(snapshot, item.code);
	const type = snapshot.types.find((entry) => entry.id === unit.typeId);
	return type?.turnaroundHours ?? 0;
}

function lotCodes(items: readonly RequestedItem[]): string[] {
	return items.filter((item) => item.kind === "LOT").map((item) => item.code);
}

async function conflictAfterRace(
	db: DbClient,
	items: readonly RequestedItem[],
	start: string,
	end: string,
	now: Date,
	excludeRental?: string,
) {
	const snapshot = await loadSnapshot(db, { rentals: HOLDING_RENTALS });
	const found = findConflicts(snapshot, items, start, end, now, excludeRental);
	const fallback: ConflictingItem[] = items
		.filter((item) => item.kind === "UNIT")
		.map((item) => ({
			code: item.code,
			name: requireUnit(snapshot, item.code).name,
			rentalNumber: null,
			freeFrom: null,
			requestedQuantity: null,
			freeQuantity: null,
		}));
	return conflict(found.length > 0 ? found : fallback);
}

async function withConflictMapping<T>(
	db: DbClient,
	run: () => Promise<T>,
	period: () => {
		items: readonly RequestedItem[];
		start: string;
		end: string;
		now: Date;
		excludeRental?: string;
	} | null,
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		const context = period();
		if (!context || !isExclusionViolation(error)) throw error;
		throw await conflictAfterRace(
			db,
			context.items,
			context.start,
			context.end,
			context.now,
			context.excludeRental,
		);
	}
}

async function syncCalendar(
	tx: Transaction,
	rentalId: string,
	status: RentalStatus,
): Promise<void> {
	await tx.rentalItem.updateMany({
		where: { rentalId, returnDoneAt: null },
		data: { holdsCalendar: holdsBooking(status) },
	});
}

async function moveRental(
	tx: Transaction,
	rental: RentalRecord,
	to: RentalStatus,
	data: Prisma.RentalUpdateInput = {},
): Promise<void> {
	assertRentalTransition(rental, to);
	await tx.rental.update({
		where: { id: rental.id },
		data: { ...data, status: to },
	});
	await syncCalendar(tx, rental.id, to);
}

async function rentalEvent(
	tx: Transaction,
	deps: ServiceDeps,
	rental: { id: string },
	action: string,
	message: string,
	at: Date,
	payload?: Prisma.InputJsonValue,
): Promise<void> {
	await recordEvent(tx, {
		actor: deps.actor,
		action: `rental.${action}`,
		entity: "Rental",
		entityId: rental.id,
		message,
		at,
		payload,
	});
}

export function hasPaidSignal(rental: RentalRecord): boolean {
	return rental.payments.some(
		(payment) => payment.kind === "SIGNAL" && payment.reversedAt === null,
	);
}

async function loadLockedRental(
	tx: Transaction,
	code: string,
	related: Prisma.RentalWhereInput = customerRentalsOf(code),
) {
	await lockRental(tx, code);
	const snapshot = await reservationSnapshot(tx, related);
	return { snapshot, rental: requireRental(snapshot, code) };
}

export async function listRentals(
	deps: ServiceDeps,
	input: { tab: z.infer<typeof RentalTab>; q?: string },
) {
	const snapshot = await loadSnapshot(deps.db, {
		rentals: {},
		lostDemand: {},
	});
	return listRentalsView(snapshot, input, deps.clock());
}

export async function getRental(deps: ServiceDeps, code: string) {
	return viewOfRental(deps.db, code, deps.clock());
}

export async function createQuote(
	deps: ServiceDeps,
	input: z.output<typeof CreateQuoteInput>,
): Promise<Rental> {
	requireUuid("customer", input.customerId);
	const now = deps.clock();
	return withConflictMapping(
		deps.db,
		() =>
			inTransaction(deps.db, async (tx) => {
				await expireStaleQuotes(tx, now);
				if (input.send) await lockLots(tx, lotCodes(input.items));
				const snapshot = await reservationSnapshot(tx, {
					customerId: input.customerId,
				});
				const customer = requireCustomer(snapshot, input.customerId);
				for (const item of input.items) {
					if (item.kind === "UNIT") requireUnit(snapshot, item.code);
					else requireLot(snapshot, item.code);
				}
				assertPriced(snapshot, input.items);
				if (input.send) {
					assertCustomerCanRent(snapshot, customer.id, now);
					const conflicts = findConflicts(
						snapshot,
						input.items,
						input.startAt,
						input.endAt,
						now,
					);
					if (conflicts.length > 0) throw conflict(conflicts);
				}

				const code = await nextCodeFromCounter(tx, "LOC");
				const status: RentalStatus = input.send ? "AWAITING_DEPOSIT" : "QUOTE";
				const rental = await tx.rental.create({
					data: {
						code,
						customerId: customer.id,
						status,
						deliveryMode: input.deliveryMode,
						siteAddress: input.siteAddress,
						siteCity: input.siteCity,
						sitePinUrl: input.sitePinUrl,
						receiverName: customer.name,
						notes: input.notes,
						startsAt: input.startAt,
						endsAt: input.endAt,
						deliveryFeeCents:
							input.deliveryMode === "PICKUP" ? 0 : input.deliveryFeeCents,
						discountCents: input.discountCents,
						sentAt: input.send ? now : null,
						depositDeadlineAt: input.send
							? addHours(now, snapshot.settings.signalDeadlineHours)
							: null,
						createdAt: now,
						items: {
							create: input.items.map((item, position) => ({
								position,
								unitId:
									item.kind === "UNIT"
										? requireUnit(snapshot, item.code).id
										: null,
								lotId:
									item.kind === "LOT"
										? requireLot(snapshot, item.code).id
										: null,
								quantity: item.quantity,
								startsAt: input.startAt,
								blockedUntil: addHours(
									input.endAt,
									turnaroundOf(snapshot, item),
								),
								holdsCalendar: holdsBooking(status),
							})),
						},
					},
				});
				await rentalEvent(
					tx,
					deps,
					rental,
					input.send ? "quoteSent" : "quoteDrafted",
					input.send ? RENTAL_EVENTS.quoteSent : RENTAL_EVENTS.quoteDrafted,
					now,
				);
				return viewOfRental(tx, code, now);
			}),
		() =>
			input.send
				? { items: input.items, start: input.startAt, end: input.endAt, now }
				: null,
	);
}

export async function sendQuote(
	deps: ServiceDeps,
	code: string,
): Promise<Rental> {
	const now = deps.clock();
	let attempted: RentalRecord | null = null;
	return withConflictMapping(
		deps.db,
		() =>
			inTransaction(deps.db, async (tx) => {
				await expireStaleQuotes(tx, now);
				await lockRental(tx, code);
				const items = await tx.rentalItem.findMany({
					where: { rental: { code } },
					include: { lot: { select: { code: true } } },
				});
				await lockLots(
					tx,
					items.flatMap((item) => (item.lot ? [item.lot.code] : [])),
				);
				const snapshot = await reservationSnapshot(tx, customerRentalsOf(code));
				const rental = requireRental(snapshot, code);
				attempted = rental;
				assertCustomerCanRent(snapshot, rental.customerId, now);
				const conflicts = findConflicts(
					snapshot,
					rental.items,
					rental.startAt,
					rental.endAt,
					now,
					rental.number,
				);
				if (conflicts.length > 0) throw conflict(conflicts);
				assertRentalTransition(rental, "AWAITING_DEPOSIT");
				for (const item of rental.items) {
					await tx.rentalItem.update({
						where: { id: item.id },
						data: {
							blockedUntil: addHours(
								rental.endAt,
								turnaroundOf(snapshot, item),
							),
						},
					});
				}
				await moveRental(tx, rental, "AWAITING_DEPOSIT", {
					sentAt: now,
					depositDeadlineAt: addHours(
						now,
						snapshot.settings.signalDeadlineHours,
					),
				});
				await rentalEvent(
					tx,
					deps,
					rental,
					"quoteSent",
					RENTAL_EVENTS.quoteSent,
					now,
				);
				return viewOfRental(tx, code, now);
			}),
		() => {
			const rental: RentalRecord | null = attempted;
			return rental
				? {
						items: rental.items,
						start: rental.startAt,
						end: rental.endAt,
						now,
						excludeRental: rental.number,
					}
				: null;
		},
	);
}

export async function recordPayment(
	deps: ServiceDeps,
	input: z.output<typeof RecordPaymentInput>,
): Promise<Rental> {
	const now = deps.clock();
	const current = await loadSnapshot(deps.db, {
		rentals: { code: input.number },
	});
	const rental = requireRental(current, input.number);
	assertAccepts(rental, PAYABLE_RENTAL_STATUSES, rental.status);
	return once(
		deps.db,
		deps.actor,
		"rentals.recordPayment",
		input.idempotencyKey,
		async (tx) => {
			const locked = await loadLockedRental(tx, input.number);
			if (input.receiptFileKey) {
				await requireUsableFile(tx, deps.actor.id, input.receiptFileKey, [
					"RECEIPT",
				]);
			}
			const paidAt = input.paidAt ? new Date(input.paidAt) : now;
			await postPayment(tx, deps, locked.snapshot, locked.rental, {
				kind: input.kind,
				amountCents: input.amountCents,
				method: input.method,
				paidAt,
				receiptFileKey: input.receiptFileKey ?? null,
			});
			return viewOfRental(tx, input.number, now);
		},
	);
}

export async function postPayment(
	tx: Transaction,
	deps: ServiceDeps,
	snapshot: Snapshot,
	rental: RentalRecord,
	payment: {
		kind: RecordPaymentInput["kind"];
		amountCents: number;
		method: RecordPaymentInput["method"];
		paidAt: Date;
		receiptFileKey: string | null;
	},
): Promise<void> {
	const firstUnit = rental.items.find((item) => item.kind === "UNIT");
	await tx.ledgerEntry.create({
		data: {
			account: "CASH",
			direction: "IN",
			category: PAYMENT_LEDGER_CATEGORY[payment.kind],
			amountCents: payment.amountCents,
			occurredAt: payment.paidAt,
			method: payment.method,
			description: LEDGER_DESCRIPTIONS.payment(payment.kind, rental.number),
			rentalId: rental.id,
			unitId: firstUnit ? requireUnit(snapshot, firstUnit.code).id : null,
			paymentKind: payment.kind,
			receiptFileKey: payment.receiptFileKey,
			recordedById: deps.actor.id,
			recordedByName: deps.actor.name,
			createdAt: deps.clock(),
		},
	});
	if (payment.kind === "SIGNAL" && !rental.priceFrozenAt) {
		for (const item of rental.items) {
			const price = itemTablePrice(snapshot, item);
			await tx.rentalItem.update({
				where: { id: item.id },
				data: {
					dailyPriceCents: price.dailyPriceCents,
					depositCents: price.depositCents,
				},
			});
		}
		await tx.rental.update({
			where: { id: rental.id },
			data: { priceFrozenAt: payment.paidAt },
		});
	}
	await rentalEvent(
		tx,
		deps,
		rental,
		"paymentReceived",
		RENTAL_EVENTS.paymentReceived(
			payment.kind,
			payment.amountCents,
			payment.method,
		),
		payment.paidAt,
		{ kind: payment.kind, amountCents: payment.amountCents },
	);
}

export async function confirmRental(
	deps: ServiceDeps,
	code: string,
): Promise<Rental> {
	const now = deps.clock();
	return inTransaction(deps.db, async (tx) => {
		const { rental } = await loadLockedRental(tx, code);
		if (!hasPaidSignal(rental)) throw precondition("SIGNAL_REQUIRED");
		await moveRental(tx, rental, "CONFIRMED", { confirmedAt: now });
		await rentalEvent(
			tx,
			deps,
			rental,
			"confirmed",
			RENTAL_EVENTS.confirmed,
			now,
		);
		return viewOfRental(tx, code, now);
	});
}

export async function markSeparated(
	deps: ServiceDeps,
	code: string,
): Promise<Rental> {
	const now = deps.clock();
	return inTransaction(deps.db, async (tx) => {
		const { snapshot, rental } = await loadLockedRental(tx, code);
		await moveRental(tx, rental, "SEPARATED", { separatedAt: now });
		for (const item of rental.items) {
			if (item.kind !== "UNIT") continue;
			const unit = requireUnit(snapshot, item.code);
			if (unit.status !== "SEPARATED") {
				await moveUnitStatus(tx, unit.id, "SEPARATED");
			}
		}
		await rentalEvent(
			tx,
			deps,
			rental,
			"separated",
			RENTAL_EVENTS.separated,
			now,
		);
		return viewOfRental(tx, code, now);
	});
}

export async function previewExtend(
	deps: ServiceDeps,
	input: { number: string; newEndAt: string },
): Promise<ExtendPreview> {
	const snapshot = await reservationSnapshot(
		deps.db,
		customerRentalsOf(input.number),
	);
	const rental = requireRental(snapshot, input.number);
	return previewExtension(snapshot, rental, input.newEndAt, deps.clock());
}

export async function extendRental(
	deps: ServiceDeps,
	input: { number: string; newEndAt: string },
): Promise<Rental> {
	const now = deps.clock();
	let attempted: RentalRecord | null = null;
	return withConflictMapping(
		deps.db,
		() =>
			inTransaction(deps.db, async (tx) => {
				await expireStaleQuotes(tx, now);
				await lockRental(tx, input.number);
				const items = await tx.rentalItem.findMany({
					where: { rental: { code: input.number } },
					include: { lot: { select: { code: true } } },
				});
				await lockLots(
					tx,
					items.flatMap((item) => (item.lot ? [item.lot.code] : [])),
				);
				const snapshot = await reservationSnapshot(
					tx,
					customerRentalsOf(input.number),
				);
				const rental = requireRental(snapshot, input.number);
				attempted = { ...rental, endAt: input.newEndAt };
				assertAccepts(rental, EXTENDABLE_RENTAL_STATUSES, rental.status);
				if (toMs(input.newEndAt) <= toMs(rental.endAt)) {
					throw precondition("INVALID_DATE");
				}
				const conflicts = findConflicts(
					snapshot,
					rental.items,
					rental.startAt,
					input.newEndAt,
					now,
					rental.number,
				);
				if (conflicts.length > 0) throw conflict(conflicts);
				const previous = rentalTotalCents(snapshot, rental);
				const difference =
					rentalTotalCents(snapshot, { ...rental, endAt: input.newEndAt }) -
					previous;
				await tx.rental.update({
					where: { id: rental.id },
					data: { endsAt: input.newEndAt },
				});
				for (const item of rental.items) {
					await tx.rentalItem.update({
						where: { id: item.id },
						data: {
							blockedUntil: addHours(
								input.newEndAt,
								turnaroundOf(snapshot, item),
							),
						},
					});
				}
				await rentalEvent(
					tx,
					deps,
					rental,
					"extended",
					RENTAL_EVENTS.extended(input.newEndAt, difference),
					now,
					{
						from: rental.endAt,
						to: input.newEndAt,
						differenceCents: difference,
					},
				);
				return viewOfRental(tx, input.number, now);
			}),
		() => {
			const rental: RentalRecord | null = attempted;
			return rental
				? {
						items: rental.items,
						start: rental.startAt,
						end: rental.endAt,
						now,
						excludeRental: rental.number,
					}
				: null;
		},
	);
}

export async function cancelRental(
	deps: ServiceDeps,
	input: { number: string; reason: string },
): Promise<Rental> {
	const now = deps.clock();
	return inTransaction(deps.db, async (tx) => {
		const { snapshot, rental } = await loadLockedRental(tx, input.number);
		await moveRental(tx, rental, "CANCELED", { cancelReason: input.reason });
		for (const item of rental.items) {
			if (item.kind !== "UNIT") continue;
			const unit = requireUnit(snapshot, item.code);
			if (unit.status === "SEPARATED") {
				await moveUnitStatus(tx, unit.id, "AVAILABLE");
			}
		}
		await rentalEvent(
			tx,
			deps,
			rental,
			"canceled",
			RENTAL_EVENTS.canceled(input.reason),
			now,
			{ reason: input.reason },
		);
		return viewOfRental(tx, input.number, now);
	});
}

export async function closeRental(
	deps: ServiceDeps,
	code: string,
): Promise<Rental> {
	const now = deps.clock();
	return inTransaction(deps.db, async (tx) => {
		const { rental } = await loadLockedRental(tx, code);
		const { receivedCents, refundedCents, retainedCents } = rental.deposit;
		if (receivedCents - refundedCents - retainedCents > 0) {
			throw precondition("DEPOSIT_NOT_SETTLED");
		}
		await moveRental(tx, rental, "CLOSED", { closedAt: now });
		await rentalEvent(tx, deps, rental, "closed", RENTAL_EVENTS.closed, now);
		return viewOfRental(tx, code, now);
	});
}

export async function copyQuoteText(deps: ServiceDeps, code: string) {
	const snapshot = await loadSnapshot(deps.db, {
		rentals: customerRentalsOf(code),
	});
	const view = rentalView(
		snapshot,
		requireRental(snapshot, code),
		deps.clock(),
	);
	return { text: quoteText(view, snapshot.settings.signalDeadlineHours) };
}

export async function recordLostDemand(
	deps: ServiceDeps,
	input: z.output<typeof RecordLostDemandInput>,
): Promise<LostDemandRecord> {
	return inTransaction(deps.db, async (tx) => {
		if (input.typeId) {
			requireUuid("type", input.typeId);
			const type = await tx.equipmentType.findUnique({
				where: { id: input.typeId },
			});
			if (!type) throw notFound("type", input.typeId);
		}
		const record = await tx.lostDemand.create({
			data: {
				item: input.item,
				typeId: input.typeId,
				reason: input.reason,
				city: input.city,
				requestedOn: new Date(`${input.requestedOn}T00:00:00Z`),
				recordedById: deps.actor.id,
				recordedByName: deps.actor.name,
			},
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action: "lostDemand.recorded",
			entity: "LostDemand",
			entityId: record.id,
			at: deps.clock(),
			payload: { item: input.item, reason: input.reason },
		});
		return {
			id: record.id,
			item: record.item,
			typeId: record.typeId,
			reason: record.reason,
			city: record.city,
			requestedOn: input.requestedOn,
			recordedBy: record.recordedByName,
		};
	});
}

export async function listLostDemand(
	deps: ServiceDeps,
	input: { from: string; to: string } | undefined,
) {
	const snapshot = await loadSnapshot(deps.db, { lostDemand: {} });
	return listLostDemandView(snapshot, input);
}
