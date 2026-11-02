import { z } from "zod";
import { base } from "../base";
import {
	IdempotencyKey,
	IsoDateTime,
	PaymentMethod,
	PositiveCents,
	RentalNumber,
} from "../common";
import { Rental } from "./rentals";

const Movement = z.object({
	rentalNumber: RentalNumber,
	amountCents: PositiveCents,
	idempotencyKey: IdempotencyKey,
});

export const DepositMovementInput = Movement.extend({
	method: PaymentMethod,
	at: IsoDateTime.optional(),
});
export type DepositMovementInput = z.input<typeof DepositMovementInput>;

export const DepositRetentionInput = Movement.extend({
	reason: z.string().trim().min(3, "Informe o motivo da retenção"),
});
export type DepositRetentionInput = z.input<typeof DepositRetentionInput>;

export const deposits = {
	recordReceived: base.input(DepositMovementInput).output(Rental),
	recordRefund: base.input(DepositMovementInput).output(Rental),
	recordRetention: base.input(DepositRetentionInput).output(Rental),
};
