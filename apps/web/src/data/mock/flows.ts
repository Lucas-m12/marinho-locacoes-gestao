import type { SessionUser } from "@marinho-gestao/contract";
import {
	addHours,
	depositHeldCents,
	type LedgerCategory,
	type PaymentKind,
	type PaymentMethod,
	type RentalStatus,
	rentalStatusMachine,
	toMs,
} from "@marinho-gestao/domain";
import { money } from "@/lib/format";
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import {
	type LedgerRecord,
	type MockDb,
	nextId,
	type RentalRecord,
} from "./db";
import { invalidTransition, precondition } from "./errors";
import { itemTablePrice } from "./rental-money";

export function addEvent(
	db: MockDb,
	rental: RentalRecord,
	actor: SessionUser | null,
	message: string,
	at: string,
): void {
	rental.history.push({
		id: nextId(db, "evt"),
		at,
		message,
		actorName: actor?.name ?? "Sistema",
		actorRole: actor?.role ?? null,
	});
}

export function postLedger(
	db: MockDb,
	entry: Omit<LedgerRecord, "id">,
): LedgerRecord {
	const record = { ...entry, id: nextId(db, "led") };
	db.ledger.push(record);
	return record;
}

export function moveRental(rental: RentalRecord, to: RentalStatus): void {
	if (!rentalStatusMachine.canTransition(rental.status, to)) {
		throw invalidTransition({
			entity: "RENTAL",
			from: rental.status,
			to,
			allowed: [...rentalStatusMachine.allowedFrom(rental.status)],
		});
	}
	rental.status = to;
}

export function expireSignals(db: MockDb, now: Date): void {
	for (const rental of db.rentals) {
		const overdue =
			rental.status === "AWAITING_DEPOSIT" &&
			rental.signalDueAt !== null &&
			toMs(rental.signalDueAt) <= now.getTime();
		const signalPaid = rental.payments.some(
			(payment) => payment.kind === "SIGNAL",
		);
		if (overdue && !signalPaid) {
			moveRental(rental, "EXPIRED");
			addEvent(
				db,
				rental,
				null,
				"Orçamento expirou sem sinal e a agenda foi liberada",
				now.toISOString(),
			);
		}
	}
}

export function holdUnits(db: MockDb, rental: RentalRecord, now: Date): void {
	moveRental(rental, "AWAITING_DEPOSIT");
	const sentAt = now.toISOString();
	rental.sentAt = sentAt;
	rental.signalDueAt = addHours(
		now,
		db.settings.signalDeadlineHours,
	).toISOString();
}

export function freezePrices(
	db: MockDb,
	rental: RentalRecord,
	at: string,
): void {
	if (rental.priceFrozenAt) return;
	for (const item of rental.items) {
		const price = itemTablePrice(db, item);
		item.frozenDailyPriceCents = price.dailyPriceCents;
		item.frozenDepositCents = price.depositCents;
	}
	rental.priceFrozenAt = at;
}

const PAYMENT_CATEGORY: Record<PaymentKind, LedgerCategory> = {
	SIGNAL: "RENTAL",
	BALANCE: "RENTAL",
	DELIVERY_FEE: "DELIVERY",
	CONSUMABLE: "CONSUMABLE_SOLD",
	EXTRA_DAILY: "EXTRA_FEES",
};

function firstUnitCode(rental: RentalRecord): string | null {
	return rental.items.find((item) => item.kind === "UNIT")?.code ?? null;
}

export function recordPayment(
	db: MockDb,
	rental: RentalRecord,
	actor: SessionUser,
	payment: {
		kind: PaymentKind;
		amountCents: number;
		method: PaymentMethod;
		paidAt: string;
		receiptFileKey?: string | null;
	},
): void {
	rental.payments.push({
		id: nextId(db, "pay"),
		kind: payment.kind,
		amountCents: payment.amountCents,
		method: payment.method,
		paidAt: payment.paidAt,
		recordedBy: actor.name,
	});
	if (payment.kind === "SIGNAL") freezePrices(db, rental, payment.paidAt);

	const label = PAYMENT_KIND_LABELS[payment.kind];
	postLedger(db, {
		account: "CASH",
		direction: "IN",
		category: PAYMENT_CATEGORY[payment.kind],
		amountCents: payment.amountCents,
		occurredAt: payment.paidAt,
		method: payment.method,
		description: `${label} da ${rental.number}`,
		rentalNumber: rental.number,
		unitCode: firstUnitCode(rental),
		receiptFileKey: payment.receiptFileKey ?? null,
		recordedBy: actor.name,
		maintenanceNumber: null,
	});
	addEvent(
		db,
		rental,
		actor,
		`${label} de ${money(payment.amountCents)} recebido por ${PAYMENT_METHOD_LABELS[payment.method]}`,
		payment.paidAt,
	);
}

export function receiveDeposit(
	db: MockDb,
	rental: RentalRecord,
	actor: SessionUser,
	amountCents: number,
	method: PaymentMethod,
	at: string,
): void {
	rental.deposit.receivedCents += amountCents;
	rental.deposit.receivedAt = at;
	rental.deposit.receivedMethod = method;
	postLedger(db, {
		account: "DEPOSIT",
		direction: "IN",
		category: "DEPOSIT_RECEIVED",
		amountCents,
		occurredAt: at,
		method,
		description: `Caução da ${rental.number}`,
		rentalNumber: rental.number,
		unitCode: firstUnitCode(rental),
		receiptFileKey: null,
		recordedBy: actor.name,
		maintenanceNumber: null,
	});
	addEvent(
		db,
		rental,
		actor,
		`Caução de ${money(amountCents)} recebida por ${PAYMENT_METHOD_LABELS[method]}`,
		at,
	);
}

export function requireHeldDeposit(
	rental: RentalRecord,
	amountCents: number,
): void {
	if (amountCents > depositHeldCents(rental.deposit)) {
		throw precondition("INSUFFICIENT_DEPOSIT");
	}
}
