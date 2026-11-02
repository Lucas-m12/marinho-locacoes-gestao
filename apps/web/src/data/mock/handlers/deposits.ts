import {
	LEDGER_DESCRIPTIONS,
	RENTAL_EVENTS,
	rentalView,
	requireRental,
} from "@marinho-gestao/read-model";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import { getDb, nextId } from "../db";
import {
	addEvent,
	once,
	postLedger,
	receiveDeposit,
	requireHeldDeposit,
} from "../flows";

export const deposits = {
	recordReceived: api.deposits.recordReceived.handler(({ context, input }) => {
		const user = requirePermission(context, "money:write");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.rentalNumber);
		return once(
			db,
			user,
			"deposits.recordReceived",
			input.idempotencyKey,
			() => {
				receiveDeposit(
					db,
					rental,
					user,
					input.amountCents,
					input.method,
					input.at ?? now.toISOString(),
				);
				return rentalView(db, rental, now);
			},
		);
	}),

	recordRefund: api.deposits.recordRefund.handler(({ context, input }) => {
		const user = requirePermission(context, "money:write");
		const db = getDb();
		const now = mockNow();
		const rental = requireRental(db, input.rentalNumber);
		return once(db, user, "deposits.recordRefund", input.idempotencyKey, () => {
			requireHeldDeposit(rental, input.amountCents);
			const at = input.at ?? now.toISOString();
			rental.deposit.refundedCents += input.amountCents;
			rental.deposit.refundedAt = at;
			rental.deposit.refundedMethod = input.method;
			postLedger(db, {
				account: "DEPOSIT",
				direction: "OUT",
				category: "DEPOSIT_REFUNDED",
				amountCents: input.amountCents,
				occurredAt: at,
				method: input.method,
				description: LEDGER_DESCRIPTIONS.depositRefunded(rental.number),
				rentalNumber: rental.number,
				unitCode: null,
				receiptFileKey: null,
				recordedBy: user.name,
				maintenanceNumber: null,
			});
			addEvent(
				db,
				rental,
				user,
				RENTAL_EVENTS.depositRefunded(input.amountCents, input.method),
				at,
			);
			return rentalView(db, rental, now);
		});
	}),

	recordRetention: api.deposits.recordRetention.handler(
		({ context, input }) => {
			const user = requirePermission(context, "money:write");
			const db = getDb();
			const now = mockNow();
			const at = now.toISOString();
			const rental = requireRental(db, input.rentalNumber);
			return once(
				db,
				user,
				"deposits.recordRetention",
				input.idempotencyKey,
				() => {
					requireHeldDeposit(rental, input.amountCents);
					rental.deposit.retainedCents += input.amountCents;
					rental.deposit.retentionReason = input.reason;
					rental.deposit.retainedAt = at;

					const movement = {
						amountCents: input.amountCents,
						occurredAt: at,
						method: rental.deposit.receivedMethod ?? ("PIX" as const),
						description: LEDGER_DESCRIPTIONS.depositRetained(
							rental.number,
							input.reason,
						),
						rentalNumber: rental.number,
						unitCode: null,
						receiptFileKey: null,
						recordedBy: user.name,
						maintenanceNumber: null,
						pairId: nextId(db, "par"),
					};
					postLedger(db, {
						...movement,
						account: "DEPOSIT",
						direction: "OUT",
						category: "DEPOSIT_TO_CASH",
					});
					postLedger(db, {
						...movement,
						account: "CASH",
						direction: "IN",
						category: "DEPOSIT_RETAINED",
					});
					addEvent(
						db,
						rental,
						user,
						RENTAL_EVENTS.depositRetained(input.amountCents, input.reason),
						at,
					);
					return rentalView(db, rental, now);
				},
			);
		},
	),
};
