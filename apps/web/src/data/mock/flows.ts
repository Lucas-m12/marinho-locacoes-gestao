import type { SessionUser } from "@marinho-gestao/contract";
import {
	addHours,
	depositHeldCents,
	isQuoteExpired,
	PAYMENT_LEDGER_CATEGORY,
	type PaymentKind,
	type PaymentMethod,
	type RentalStatus,
} from "@marinho-gestao/domain";
import {
	assertRentalTransition,
	itemTablePrice,
	LEDGER_DESCRIPTIONS,
	precondition,
	RENTAL_EVENTS,
} from "@marinho-gestao/read-model";
import {
	type LedgerRecord,
	type MockDb,
	nextId,
	type RentalRecord,
} from "./db";

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

type LedgerLinks = "paymentId" | "pairId" | "reversalOfId" | "reversalReason";

export function postLedger(
	db: MockDb,
	entry: Omit<LedgerRecord, "id" | LedgerLinks> &
		Partial<Pick<LedgerRecord, LedgerLinks>>,
): LedgerRecord {
	const record: LedgerRecord = {
		paymentId: null,
		pairId: null,
		reversalOfId: null,
		reversalReason: null,
		...entry,
		id: nextId(db, "led"),
	};
	db.ledger.push(record);
	return record;
}

export function once<T>(
	db: MockDb,
	actor: SessionUser,
	procedure: string,
	key: string,
	run: () => T,
): T {
	const slot = `${actor.id}:${procedure}:${key}`;
	if (slot in db.idempotency) return db.idempotency[slot] as T;
	const result = run();
	db.idempotency[slot] = result;
	return result;
}

export function hasPaidSignal(rental: RentalRecord): boolean {
	return rental.payments.some(
		(payment) => payment.kind === "SIGNAL" && payment.reversedAt === null,
	);
}

export function moveRental(rental: RentalRecord, to: RentalStatus): void {
	assertRentalTransition(rental, to);
	rental.status = to;
}

export function expireSignals(db: MockDb, now: Date): void {
	for (const rental of db.rentals) {
		const expired = isQuoteExpired(
			{ ...rental, hasPaidSignal: hasPaidSignal(rental) },
			now,
		);
		if (expired) {
			moveRental(rental, "EXPIRED");
			addEvent(db, rental, null, RENTAL_EVENTS.quoteExpired, now.toISOString());
		}
	}
}

export function holdUnits(db: MockDb, rental: RentalRecord, now: Date): void {
	moveRental(rental, "AWAITING_DEPOSIT");
	rental.sentAt = now.toISOString();
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
	const paymentId = nextId(db, "pay");
	rental.payments.push({
		id: paymentId,
		kind: payment.kind,
		amountCents: payment.amountCents,
		method: payment.method,
		paidAt: payment.paidAt,
		recordedBy: actor.name,
		reversedAt: null,
	});
	if (payment.kind === "SIGNAL") freezePrices(db, rental, payment.paidAt);

	postLedger(db, {
		account: "CASH",
		direction: "IN",
		category: PAYMENT_LEDGER_CATEGORY[payment.kind],
		amountCents: payment.amountCents,
		occurredAt: payment.paidAt,
		method: payment.method,
		description: LEDGER_DESCRIPTIONS.payment(payment.kind, rental.number),
		rentalNumber: rental.number,
		unitCode: firstUnitCode(rental),
		receiptFileKey: payment.receiptFileKey ?? null,
		recordedBy: actor.name,
		maintenanceNumber: null,
		paymentId,
	});
	addEvent(
		db,
		rental,
		actor,
		RENTAL_EVENTS.paymentReceived(
			payment.kind,
			payment.amountCents,
			payment.method,
		),
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
		description: LEDGER_DESCRIPTIONS.depositReceived(rental.number),
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
		RENTAL_EVENTS.depositReceived(amountCents, method),
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
