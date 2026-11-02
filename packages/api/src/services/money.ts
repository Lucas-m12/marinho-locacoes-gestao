import type {
	CreateLedgerEntryInput,
	DepositMovementInput,
	DepositRetentionInput,
	LedgerAccount,
	LedgerEntry,
	Rental,
	ReverseLedgerEntryInput,
} from "@marinho-gestao/contract";
import type { Prisma, Transaction } from "@marinho-gestao/db";
import {
	addCalendarDays,
	depositHeldCents,
	oppositeDirection,
	type PaymentMethod,
	zonedTimeToIso,
} from "@marinho-gestao/domain";
import {
	assertReversible,
	dashboardSummary as dashboardSummaryView,
	depositSummary as depositSummaryView,
	entryView,
	exportCashCsv,
	LEDGER_DESCRIPTIONS,
	type LedgerRecord,
	ledgerByCategory,
	listLedger as listLedgerView,
	pairedEntries,
	RENTAL_EVENTS,
	type RentalRecord,
	receivables as receivablesView,
	requireEntry,
	requireRental,
	requireUnit,
	type Snapshot,
} from "@marinho-gestao/read-model";
import type { z } from "zod";
import { isUniqueViolation, notFound, precondition } from "../errors";
import type { ServiceDeps } from "./deps";
import { recordEvent } from "./events";
import { requireUsableFile } from "./files";
import { once } from "./idempotency";
import { lockRental, requireUuid } from "./lookups";
import { viewOfRental } from "./rentals";
import { loadSnapshot } from "./snapshot";

type Range = { from: string; to: string };

const DELIVERED_OR_LATER: Prisma.RentalWhereInput = {
	status: { in: ["CONFIRMED", "SEPARATED", "ON_SITE", "RETURNED", "CLOSED"] },
};
const WITH_DEPOSIT: Prisma.RentalWhereInput = {
	ledgerEntries: { some: { account: "DEPOSIT" } },
};

function inRange(range: Range) {
	return { gte: new Date(range.from), lte: new Date(range.to) };
}

function requireHeldDeposit(rental: RentalRecord, amountCents: number): void {
	if (amountCents > depositHeldCents(rental.deposit)) {
		throw precondition("INSUFFICIENT_DEPOSIT");
	}
}

async function lockedRental(tx: Transaction, code: string) {
	await lockRental(tx, code);
	const snapshot = await loadSnapshot(tx, { rentals: { code } });
	return { snapshot, rental: requireRental(snapshot, code) };
}

function firstUnitId(snapshot: Snapshot, rental: RentalRecord): string | null {
	const item = rental.items.find((entry) => entry.kind === "UNIT");
	return item ? requireUnit(snapshot, item.code).id : null;
}

async function rentalEvent(
	tx: Transaction,
	deps: ServiceDeps,
	rentalId: string,
	action: string,
	message: string,
	at: Date,
	payload?: Prisma.InputJsonValue,
): Promise<void> {
	await recordEvent(tx, {
		actor: deps.actor,
		action,
		entity: "Rental",
		entityId: rentalId,
		message,
		at,
		payload,
	});
}

export async function postDepositReceived(
	tx: Transaction,
	deps: ServiceDeps,
	snapshot: Snapshot,
	rental: RentalRecord,
	amountCents: number,
	method: PaymentMethod,
	at: Date,
): Promise<void> {
	await tx.ledgerEntry.create({
		data: {
			account: "DEPOSIT",
			direction: "IN",
			category: "DEPOSIT_RECEIVED",
			amountCents,
			occurredAt: at,
			method,
			description: LEDGER_DESCRIPTIONS.depositReceived(rental.number),
			rentalId: rental.id,
			unitId: firstUnitId(snapshot, rental),
			recordedById: deps.actor.id,
			recordedByName: deps.actor.name,
			createdAt: deps.clock(),
		},
	});
	await rentalEvent(
		tx,
		deps,
		rental.id,
		"deposit.received",
		RENTAL_EVENTS.depositReceived(amountCents, method),
		at,
		{ amountCents },
	);
}

async function requireExistingRental(deps: ServiceDeps, code: string) {
	const rental = await deps.db.rental.findUnique({ where: { code } });
	if (!rental) throw notFound("rental", code);
}

export async function recordDepositReceived(
	deps: ServiceDeps,
	input: z.output<typeof DepositMovementInput>,
): Promise<Rental> {
	await requireExistingRental(deps, input.rentalNumber);
	const now = deps.clock();
	return once(
		deps.db,
		deps.actor,
		"deposits.recordReceived",
		input.idempotencyKey,
		async (tx) => {
			const { snapshot, rental } = await lockedRental(tx, input.rentalNumber);
			await postDepositReceived(
				tx,
				deps,
				snapshot,
				rental,
				input.amountCents,
				input.method,
				input.at ? new Date(input.at) : now,
			);
			return viewOfRental(tx, input.rentalNumber, now);
		},
	);
}

export async function recordDepositRefund(
	deps: ServiceDeps,
	input: z.output<typeof DepositMovementInput>,
): Promise<Rental> {
	await requireExistingRental(deps, input.rentalNumber);
	const now = deps.clock();
	return once(
		deps.db,
		deps.actor,
		"deposits.recordRefund",
		input.idempotencyKey,
		async (tx) => {
			const { rental } = await lockedRental(tx, input.rentalNumber);
			requireHeldDeposit(rental, input.amountCents);
			const at = input.at ? new Date(input.at) : now;
			await tx.ledgerEntry.create({
				data: {
					account: "DEPOSIT",
					direction: "OUT",
					category: "DEPOSIT_REFUNDED",
					amountCents: input.amountCents,
					occurredAt: at,
					method: input.method,
					description: LEDGER_DESCRIPTIONS.depositRefunded(rental.number),
					rentalId: rental.id,
					recordedById: deps.actor.id,
					recordedByName: deps.actor.name,
					createdAt: now,
				},
			});
			await rentalEvent(
				tx,
				deps,
				rental.id,
				"deposit.refunded",
				RENTAL_EVENTS.depositRefunded(input.amountCents, input.method),
				at,
				{ amountCents: input.amountCents },
			);
			return viewOfRental(tx, input.rentalNumber, now);
		},
	);
}

export async function recordDepositRetention(
	deps: ServiceDeps,
	input: z.output<typeof DepositRetentionInput>,
): Promise<Rental> {
	await requireExistingRental(deps, input.rentalNumber);
	const now = deps.clock();
	return once(
		deps.db,
		deps.actor,
		"deposits.recordRetention",
		input.idempotencyKey,
		async (tx) => {
			const { rental } = await lockedRental(tx, input.rentalNumber);
			requireHeldDeposit(rental, input.amountCents);
			const [pair] = await tx.$queryRaw<
				{ id: string }[]
			>`select uuidv7() as id`;
			const movement = {
				amountCents: input.amountCents,
				occurredAt: now,
				method: rental.deposit.receivedMethod ?? ("PIX" as const),
				description: LEDGER_DESCRIPTIONS.depositRetained(
					rental.number,
					input.reason,
				),
				rentalId: rental.id,
				pairId: pair?.id ?? null,
				reason: input.reason,
				recordedById: deps.actor.id,
				recordedByName: deps.actor.name,
				createdAt: now,
			};
			await tx.ledgerEntry.create({
				data: {
					...movement,
					account: "DEPOSIT",
					direction: "OUT",
					category: "DEPOSIT_TO_CASH",
				},
			});
			await tx.ledgerEntry.create({
				data: {
					...movement,
					account: "CASH",
					direction: "IN",
					category: "DEPOSIT_RETAINED",
				},
			});
			await rentalEvent(
				tx,
				deps,
				rental.id,
				"deposit.retained",
				RENTAL_EVENTS.depositRetained(input.amountCents, input.reason),
				now,
				{ amountCents: input.amountCents, reason: input.reason },
			);
			return viewOfRental(tx, input.rentalNumber, now);
		},
	);
}

async function entryOf(tx: Transaction, id: string): Promise<LedgerEntry> {
	const snapshot = await loadSnapshot(tx, { ledger: { id } });
	return entryView(snapshot, requireEntry(snapshot, id));
}

export async function createLedgerEntry(
	deps: ServiceDeps,
	input: z.output<typeof CreateLedgerEntryInput>,
): Promise<LedgerEntry> {
	const rental = input.rentalNumber
		? await deps.db.rental.findUnique({ where: { code: input.rentalNumber } })
		: null;
	if (input.rentalNumber && !rental) {
		throw notFound("rental", input.rentalNumber);
	}
	const unit = input.unitCode
		? await deps.db.unit.findUnique({ where: { code: input.unitCode } })
		: null;
	if (input.unitCode && !unit) throw notFound("unit", input.unitCode);
	return once(
		deps.db,
		deps.actor,
		"ledger.create",
		input.idempotencyKey,
		async (tx) => {
			if (input.receiptFileKey) {
				await requireUsableFile(tx, deps.actor.id, input.receiptFileKey, [
					"RECEIPT",
				]);
			}
			const entry = await tx.ledgerEntry.create({
				data: {
					account: "CASH",
					direction: input.direction,
					category: input.category,
					amountCents: input.amountCents,
					occurredAt: input.occurredAt,
					method: input.method,
					description: input.description,
					rentalId: rental?.id ?? null,
					unitId: unit?.id ?? null,
					receiptFileKey: input.receiptFileKey,
					recordedById: deps.actor.id,
					recordedByName: deps.actor.name,
					createdAt: deps.clock(),
				},
			});
			await recordEvent(tx, {
				actor: deps.actor,
				action: "ledger.created",
				entity: "LedgerEntry",
				entityId: entry.id,
				at: deps.clock(),
				payload: {
					direction: input.direction,
					category: input.category,
					amountCents: input.amountCents,
				},
			});
			return entryOf(tx, entry.id);
		},
	);
}

async function postReversal(
	tx: Transaction,
	deps: ServiceDeps,
	original: LedgerRecord,
	reason: string,
	at: Date,
): Promise<string> {
	const row = await tx.ledgerEntry.findUniqueOrThrow({
		where: { id: original.id },
	});
	const reversal = await tx.ledgerEntry.create({
		data: {
			account: row.account,
			direction: oppositeDirection(row.direction),
			category: row.category,
			amountCents: row.amountCents,
			occurredAt: at,
			method: row.method,
			description: LEDGER_DESCRIPTIONS.reversal(row.description, reason),
			rentalId: row.rentalId,
			unitId: row.unitId,
			maintenanceOrderId: row.maintenanceOrderId,
			reversalOfId: row.id,
			reason,
			recordedById: deps.actor.id,
			recordedByName: deps.actor.name,
			createdAt: at,
		},
	});
	return reversal.id;
}

export async function reverseLedgerEntry(
	deps: ServiceDeps,
	input: z.output<typeof ReverseLedgerEntryInput>,
): Promise<LedgerEntry> {
	requireUuid("ledgerEntry", input.entryId);
	const now = deps.clock();
	try {
		return await once(
			deps.db,
			deps.actor,
			"ledger.reverse",
			input.idempotencyKey,
			async (tx) => {
				const original = await tx.ledgerEntry.findUnique({
					where: { id: input.entryId },
					include: { rental: { select: { code: true } } },
				});
				if (!original) throw notFound("ledgerEntry", input.entryId);
				const rentalCode = original.rental?.code ?? null;
				if (rentalCode) await lockRental(tx, rentalCode);
				const snapshot = await loadSnapshot(tx, {
					ledger: { id: input.entryId },
					rentals: rentalCode ? { code: rentalCode } : null,
				});
				const entry = requireEntry(snapshot, input.entryId);
				const partners = pairedEntries(snapshot, entry);
				for (const item of [entry, ...partners]) {
					assertReversible(snapshot, item);
				}
				const rental = rentalCode ? requireRental(snapshot, rentalCode) : null;
				if (rental && entry.category === "DEPOSIT_RECEIVED") {
					requireHeldDeposit(rental, entry.amountCents);
				}

				const reversalId = await postReversal(
					tx,
					deps,
					entry,
					input.reason,
					now,
				);
				for (const partner of partners) {
					await postReversal(tx, deps, partner, input.reason, now);
				}
				if (rental) {
					await rentalEvent(
						tx,
						deps,
						rental.id,
						"ledger.reversed",
						RENTAL_EVENTS.reversed(entry.amountCents, input.reason),
						now,
						{ entryId: entry.id },
					);
				}
				await recordEvent(tx, {
					actor: deps.actor,
					action: "ledger.reversed",
					entity: "LedgerEntry",
					entityId: entry.id,
					at: now,
					payload: { reversalId, reason: input.reason },
				});
				return entryOf(tx, reversalId);
			},
		);
	} catch (error) {
		if (isUniqueViolation(error)) throw precondition("ALREADY_REVERSED");
		throw error;
	}
}

export async function listLedger(
	deps: ServiceDeps,
	input: Range & { account: z.infer<typeof LedgerAccount> },
) {
	const snapshot = await loadSnapshot(deps.db, {
		ledger: { account: input.account, occurredAt: inRange(input) },
	});
	return listLedgerView(snapshot, input);
}

function monthRange(month: string): { gte: Date; lt: Date } {
	const first = `${month}-01`;
	const next = addCalendarDays(first, 32).slice(0, 7);
	return {
		gte: new Date(zonedTimeToIso(first, "00:00")),
		lt: new Date(zonedTimeToIso(`${next}-01`, "00:00")),
	};
}

export async function exportCsv(deps: ServiceDeps, month: string) {
	const snapshot = await loadSnapshot(deps.db, {
		ledger: { account: "CASH", occurredAt: monthRange(month) },
	});
	return exportCashCsv(
		{
			...snapshot,
			ledger: snapshot.ledger.filter((entry) => entry.account === "CASH"),
		},
		month,
	);
}

export async function byCategory(deps: ServiceDeps, range: Range) {
	const snapshot = await loadSnapshot(deps.db, {
		ledger: { account: "CASH", occurredAt: inRange(range) },
	});
	return ledgerByCategory(snapshot, range);
}

export async function receivables(deps: ServiceDeps) {
	const snapshot = await loadSnapshot(deps.db, {
		rentals: DELIVERED_OR_LATER,
	});
	return receivablesView(snapshot, deps.clock());
}

export async function depositSummary(deps: ServiceDeps, range: Range) {
	const snapshot = await loadSnapshot(deps.db, {
		ledger: { account: "DEPOSIT", occurredAt: inRange(range) },
		rentals: WITH_DEPOSIT,
	});
	return depositSummaryView(snapshot, range);
}

export async function dashboardSummary(deps: ServiceDeps, range: Range) {
	const snapshot = await loadSnapshot(deps.db, {
		ledger: { account: "CASH", occurredAt: inRange(range) },
		rentals: WITH_DEPOSIT,
	});
	return dashboardSummaryView(snapshot, range);
}
