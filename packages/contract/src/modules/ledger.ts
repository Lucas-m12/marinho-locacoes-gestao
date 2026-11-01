import { z } from "zod";
import { base } from "../base";
import {
	Cents,
	DateRange,
	FileKey,
	Id,
	IsoDateTime,
	ItemCode,
	LedgerAccount,
	LedgerCategory,
	LedgerDirection,
	PaymentMethod,
	PositiveCents,
	RentalNumber,
} from "../common";

export const LedgerEntry = z.object({
	id: Id,
	account: LedgerAccount,
	direction: LedgerDirection,
	category: LedgerCategory,
	amountCents: PositiveCents,
	occurredAt: IsoDateTime,
	method: PaymentMethod,
	description: z.string(),
	rentalNumber: RentalNumber.nullable(),
	unitCode: ItemCode.nullable(),
	receiptFileKey: FileKey.nullable(),
	recordedBy: z.string(),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

export const ListLedgerInput = z.object({
	account: LedgerAccount,
	from: IsoDateTime,
	to: IsoDateTime,
});

export const ListLedgerOutput = z.object({
	entries: z.array(LedgerEntry),
	inCents: Cents,
	outCents: Cents,
	resultCents: Cents,
});

export const CreateLedgerEntryInput = z.object({
	direction: LedgerDirection,
	category: LedgerCategory,
	amountCents: PositiveCents,
	occurredAt: IsoDateTime,
	method: PaymentMethod,
	description: z.string().trim().min(3, "Descreva o lançamento"),
	rentalNumber: RentalNumber.nullable(),
	unitCode: ItemCode.nullable(),
	receiptFileKey: FileKey.nullable(),
});
export type CreateLedgerEntryInput = z.input<typeof CreateLedgerEntryInput>;

export const CategoryTotal = z.object({
	category: LedgerCategory,
	amountCents: Cents,
});
export type CategoryTotal = z.infer<typeof CategoryTotal>;

export const ByCategoryOutput = z.object({
	in: z.array(CategoryTotal),
	out: z.array(CategoryTotal),
});

export const ReceivableKind = z.enum(["BALANCE", "LATE", "CHARGE"]);
export type ReceivableKind = z.infer<typeof ReceivableKind>;

export const Receivable = z.object({
	rentalNumber: RentalNumber,
	customerId: Id,
	customerName: z.string(),
	kind: ReceivableKind,
	amountCents: Cents,
	provisional: z.boolean(),
});
export type Receivable = z.infer<typeof Receivable>;

export const ReceivablesOutput = z.object({
	items: z.array(Receivable),
	totalCents: Cents,
});

export const DepositSummary = z.object({
	heldCents: Cents,
	heldRentalCount: z.number().int(),
	receivedCents: Cents,
	refundedCents: Cents,
	retainedCents: Cents,
});
export type DepositSummary = z.infer<typeof DepositSummary>;

export const ledger = {
	list: base.input(ListLedgerInput).output(ListLedgerOutput),
	create: base.input(CreateLedgerEntryInput).output(LedgerEntry),
	byCategory: base.input(DateRange).output(ByCategoryOutput),
	receivables: base.output(ReceivablesOutput),
	depositSummary: base.input(DateRange).output(DepositSummary),
};
