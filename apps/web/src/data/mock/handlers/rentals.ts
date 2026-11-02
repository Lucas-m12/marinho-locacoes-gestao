import {
	EXTENDABLE_RENTAL_STATUSES,
	nextCode,
	PAYABLE_RENTAL_STATUSES,
	toMs,
} from "@marinho-gestao/domain";
import {
	assertAccepts,
	assertCustomerCanRent,
	assertPriced,
	conflict,
	findConflicts,
	listLostDemand,
	listRentals,
	moveUnit,
	precondition,
	previewExtension,
	quoteText,
	RENTAL_EVENTS,
	rentalTotalCents,
	rentalView,
	requireCustomer,
	requireLot,
	requireRental,
	requireUnit,
} from "@marinho-gestao/read-model";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import {
	getDb,
	type MockDb,
	nextId,
	type RentalItemRecord,
	type RentalRecord,
} from "../db";
import { requireUsableFile } from "../files";
import {
	addEvent,
	hasPaidSignal,
	holdUnits,
	moveRental,
	once,
	recordPayment,
} from "../flows";

function assertFree(db: MockDb, rental: RentalRecord, now: Date): void {
	const conflicts = findConflicts(
		db,
		rental.items,
		rental.startAt,
		rental.endAt,
		now,
		rental.number,
	);
	if (conflicts.length > 0) throw conflict(conflicts);
}

export const rentals = {
	list: api.rentals.list.handler(({ context, input }) => {
		requirePermission(context, "rentals:read");
		return listRentals(getDb(), input, mockNow());
	}),

	get: api.rentals.get.handler(({ context, input }) => {
		requirePermission(context, "rentals:read");
		const db = getDb();
		return rentalView(db, requireRental(db, input.number), mockNow());
	}),

	createQuote: api.rentals.createQuote.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const at = now.toISOString();
		const customer = requireCustomer(db, input.customerId);

		const items = input.items.map((item): RentalItemRecord => {
			if (item.kind === "UNIT") requireUnit(db, item.code);
			else requireLot(db, item.code);
			return {
				id: nextId(db, "item"),
				kind: item.kind,
				code: item.code,
				quantity: item.quantity,
				frozenDailyPriceCents: null,
				frozenDepositCents: null,
				checkoutDoneAt: null,
				returnDoneAt: null,
			};
		});
		assertPriced(db, items);

		const rental: RentalRecord = {
			id: nextId(db, "r"),
			number: nextCode(
				"LOC",
				db.rentals.map((entry) => entry.number),
			),
			status: "QUOTE",
			customerId: input.customerId,
			startAt: input.startAt,
			endAt: input.endAt,
			items,
			deliveryMode: input.deliveryMode,
			siteAddress: input.siteAddress,
			siteCity: input.siteCity,
			sitePinUrl: input.sitePinUrl,
			receiverName: customer.name,
			termSigned: false,
			notes: input.notes,
			deliveryFeeCents:
				input.deliveryMode === "PICKUP" ? 0 : input.deliveryFeeCents,
			discountCents: input.discountCents,
			payments: [],
			deposit: {
				receivedCents: 0,
				receivedAt: null,
				receivedMethod: null,
				refundedCents: 0,
				refundedAt: null,
				refundedMethod: null,
				retainedCents: 0,
				retentionReason: null,
				retainedAt: null,
			},
			occurrences: [],
			history: [],
			signalDueAt: null,
			priceFrozenAt: null,
			cancelReason: null,
			lateNoticeGiven: false,
			createdAt: at,
			sentAt: null,
			confirmedAt: null,
			separatedAt: null,
			deliveredAt: null,
			returnedAt: null,
			closedAt: null,
		};

		if (input.send) {
			assertCustomerCanRent(db, rental.customerId, now);
			assertFree(db, rental, now);
			holdUnits(db, rental, now);
			addEvent(db, rental, user, RENTAL_EVENTS.quoteSent, at);
		} else {
			addEvent(db, rental, user, RENTAL_EVENTS.quoteDrafted, at);
		}
		db.rentals.push(rental);
		return rentalView(db, rental, now);
	}),

	sendQuote: api.rentals.sendQuote.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		assertCustomerCanRent(db, rental.customerId, now);
		assertFree(db, rental, now);
		holdUnits(db, rental, now);
		addEvent(db, rental, user, RENTAL_EVENTS.quoteSent, now.toISOString());
		return rentalView(db, rental, now);
	}),

	recordPayment: api.rentals.recordPayment.handler(({ context, input }) => {
		const user = requirePermission(context, "money:write");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		assertAccepts(rental, PAYABLE_RENTAL_STATUSES, rental.status);
		return once(db, user, "rentals.recordPayment", input.idempotencyKey, () => {
			if (input.receiptFileKey) {
				requireUsableFile(db, user.id, input.receiptFileKey, ["RECEIPT"]);
			}
			recordPayment(db, rental, user, {
				kind: input.kind,
				amountCents: input.amountCents,
				method: input.method,
				paidAt: input.paidAt ?? now.toISOString(),
				receiptFileKey: input.receiptFileKey,
			});
			return rentalView(db, rental, now);
		});
	}),

	confirm: api.rentals.confirm.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		if (!hasPaidSignal(rental)) throw precondition("SIGNAL_REQUIRED");
		moveRental(rental, "CONFIRMED");
		rental.confirmedAt = now.toISOString();
		addEvent(db, rental, user, RENTAL_EVENTS.confirmed, rental.confirmedAt);
		return rentalView(db, rental, now);
	}),

	markSeparated: api.rentals.markSeparated.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:separate");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		moveRental(rental, "SEPARATED");
		for (const item of rental.items) {
			if (item.kind !== "UNIT") continue;
			const unit = requireUnit(db, item.code);
			if (unit.status !== "SEPARATED") moveUnit(unit, "SEPARATED");
		}
		rental.separatedAt = now.toISOString();
		addEvent(db, rental, user, RENTAL_EVENTS.separated, rental.separatedAt);
		return rentalView(db, rental, now);
	}),

	previewExtend: api.rentals.previewExtend.handler(({ context, input }) => {
		requirePermission(context, "rentals:sell");
		const db = getDb();
		const rental = requireRental(db, input.number);
		return previewExtension(db, rental, input.newEndAt, mockNow());
	}),

	extend: api.rentals.extend.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		assertAccepts(rental, EXTENDABLE_RENTAL_STATUSES, rental.status);
		if (toMs(input.newEndAt) <= toMs(rental.endAt)) {
			throw precondition("INVALID_DATE");
		}
		const conflicts = findConflicts(
			db,
			rental.items,
			rental.startAt,
			input.newEndAt,
			now,
			rental.number,
		);
		if (conflicts.length > 0) throw conflict(conflicts);
		const previous = rentalTotalCents(db, rental);
		rental.endAt = input.newEndAt;
		const difference = rentalTotalCents(db, rental) - previous;
		addEvent(
			db,
			rental,
			user,
			RENTAL_EVENTS.extended(input.newEndAt, difference),
			now.toISOString(),
		);
		return rentalView(db, rental, now);
	}),

	cancel: api.rentals.cancel.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:sell");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		moveRental(rental, "CANCELED");
		rental.cancelReason = input.reason;
		for (const item of rental.items) {
			const unit = db.units.find((entry) => entry.code === item.code);
			if (unit?.status === "SEPARATED") moveUnit(unit, "AVAILABLE");
		}
		addEvent(
			db,
			rental,
			user,
			RENTAL_EVENTS.canceled(input.reason),
			now.toISOString(),
		);
		return rentalView(db, rental, now);
	}),

	close: api.rentals.close.handler(({ context, input }) => {
		const user = requirePermission(context, "rentals:close");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.number);
		const { receivedCents, refundedCents, retainedCents } = rental.deposit;
		if (receivedCents - refundedCents - retainedCents > 0) {
			throw precondition("DEPOSIT_NOT_SETTLED");
		}
		moveRental(rental, "CLOSED");
		rental.closedAt = now.toISOString();
		addEvent(db, rental, user, RENTAL_EVENTS.closed, rental.closedAt);
		return rentalView(db, rental, now);
	}),

	copyQuoteText: api.rentals.copyQuoteText.handler(({ context, input }) => {
		requirePermission(context, "rentals:read");
		const db = getDb();
		const rental = requireRental(db, input.number);
		return {
			text: quoteText(
				rentalView(db, rental, mockNow()),
				db.settings.signalDeadlineHours,
			),
		};
	}),

	recordLostDemand: api.rentals.recordLostDemand.handler(
		({ context, input }) => {
			const user = requirePermission(context, "lostDemand:write");
			const db = getDb();
			const record = {
				...input,
				id: nextId(db, "lost"),
				recordedBy: user.name,
			};
			db.lostDemand.push(record);
			return record;
		},
	),

	listLostDemand: api.rentals.listLostDemand.handler(({ context, input }) => {
		requirePermission(context, "rentals:read");
		return listLostDemand(getDb(), input);
	}),
};
