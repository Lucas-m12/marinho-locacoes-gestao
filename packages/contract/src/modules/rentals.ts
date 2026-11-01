import { z } from "zod";
import { base } from "../base";
import {
	CalendarDay,
	Cents,
	ConflictingItem,
	CustomerKind,
	CustomerTier,
	DateRange,
	DeliveryMode,
	FileKey,
	Id,
	IsoDateTime,
	ItemCode,
	ItemKind,
	NonNegativeCents,
	OccurrenceDecision,
	OccurrenceKind,
	PaymentKind,
	PaymentMethod,
	PositiveCents,
	RentalDisplayStatus,
	RentalNumber,
	RentalStatus,
	Role,
} from "../common";

export const RentalTab = z.enum(["OPEN", "CLOSED"]);
export type RentalTab = z.infer<typeof RentalTab>;

export const RentalItem = z.object({
	id: Id,
	kind: ItemKind,
	code: ItemCode,
	name: z.string(),
	shortName: z.string(),
	accessories: z.string().nullable(),
	quantity: z.number().int().positive(),
	perPiece: z.boolean(),
	dailyPriceCents: Cents.nullable(),
	depositCents: Cents.nullable(),
	subtotalCents: Cents.nullable(),
	unitStatus: z.string().nullable(),
	checkoutDoneAt: IsoDateTime.nullable(),
	returnDoneAt: IsoDateTime.nullable(),
});
export type RentalItem = z.infer<typeof RentalItem>;

export const RentalPayment = z.object({
	id: Id,
	kind: PaymentKind,
	amountCents: PositiveCents,
	method: PaymentMethod,
	paidAt: IsoDateTime,
	recordedBy: z.string(),
});
export type RentalPayment = z.infer<typeof RentalPayment>;

export const RentalDeposit = z.object({
	expectedCents: Cents.nullable(),
	receivedCents: NonNegativeCents,
	receivedAt: IsoDateTime.nullable(),
	receivedMethod: PaymentMethod.nullable(),
	refundedCents: NonNegativeCents,
	refundedAt: IsoDateTime.nullable(),
	refundedMethod: PaymentMethod.nullable(),
	retainedCents: NonNegativeCents,
	retentionReason: z.string().nullable(),
	retainedAt: IsoDateTime.nullable(),
	heldCents: NonNegativeCents,
	refundDueAt: IsoDateTime.nullable(),
});
export type RentalDeposit = z.infer<typeof RentalDeposit>;

export const RentalEvent = z.object({
	id: Id,
	at: IsoDateTime,
	message: z.string(),
	actorName: z.string(),
	actorRole: Role.nullable(),
});
export type RentalEvent = z.infer<typeof RentalEvent>;

export const Occurrence = z.object({
	id: Id,
	rentalNumber: RentalNumber,
	itemCode: ItemCode,
	kind: OccurrenceKind,
	description: z.string(),
	suggestedCents: NonNegativeCents,
	amountCents: NonNegativeCents,
	decision: OccurrenceDecision,
	createdAt: IsoDateTime,
});
export type Occurrence = z.infer<typeof Occurrence>;

export const RentalCustomerSummary = z.object({
	id: Id,
	name: z.string(),
	kind: CustomerKind,
	occupation: z.string().nullable(),
	city: z.string().nullable(),
	tier: CustomerTier,
	rentalCount: z.number().int(),
});
export type RentalCustomerSummary = z.infer<typeof RentalCustomerSummary>;

export const RentalListItem = z.object({
	number: RentalNumber,
	status: RentalStatus,
	displayStatus: RentalDisplayStatus,
	customerId: Id,
	customerName: z.string(),
	customerCity: z.string().nullable(),
	equipmentSummary: z.string(),
	startAt: IsoDateTime,
	endAt: IsoDateTime,
	totalCents: Cents,
});
export type RentalListItem = z.infer<typeof RentalListItem>;

export const Rental = RentalListItem.extend({
	customer: RentalCustomerSummary,
	items: z.array(RentalItem),
	dailies: z.number().int(),
	deliveryMode: DeliveryMode,
	siteAddress: z.string().nullable(),
	siteCity: z.string().nullable(),
	sitePinUrl: z.string().nullable(),
	receiverName: z.string().nullable(),
	termSigned: z.boolean(),
	notes: z.string().nullable(),
	subtotalCents: Cents,
	deliveryFeeCents: Cents.nullable(),
	discountCents: Cents,
	chargesCents: Cents,
	paidCents: Cents,
	balanceCents: Cents,
	signalRequiredCents: Cents.nullable(),
	signalPaidCents: Cents,
	signalDueAt: IsoDateTime.nullable(),
	priceFrozenAt: IsoDateTime.nullable(),
	cancelReason: z.string().nullable(),
	createdAt: IsoDateTime,
	sentAt: IsoDateTime.nullable(),
	confirmedAt: IsoDateTime.nullable(),
	separatedAt: IsoDateTime.nullable(),
	deliveredAt: IsoDateTime.nullable(),
	returnedAt: IsoDateTime.nullable(),
	closedAt: IsoDateTime.nullable(),
	payments: z.array(RentalPayment),
	deposit: RentalDeposit,
	occurrences: z.array(Occurrence),
	history: z.array(RentalEvent),
	allUnitsSeparated: z.boolean(),
	pendingCheckouts: z.array(ItemCode),
	pendingReturns: z.array(ItemCode),
});
export type Rental = z.infer<typeof Rental>;

export const ListRentalsOutput = z.object({
	rentals: z.array(RentalListItem),
	counts: z.object({
		OPEN: z.number().int(),
		CLOSED: z.number().int(),
		LOST: z.number().int(),
	}),
});

export const QuoteItemInput = z.object({
	kind: ItemKind,
	code: ItemCode,
	quantity: z.number().int().positive().default(1),
});
export type QuoteItemInput = z.input<typeof QuoteItemInput>;

export const CreateQuoteInput = z
	.object({
		customerId: Id,
		startAt: IsoDateTime,
		endAt: IsoDateTime,
		items: z.array(QuoteItemInput).min(1, "Adicione pelo menos um equipamento"),
		deliveryMode: DeliveryMode,
		siteAddress: z.string().trim().nullable(),
		siteCity: z.string().trim().nullable(),
		sitePinUrl: z.string().trim().nullable(),
		deliveryFeeCents: NonNegativeCents.nullable(),
		discountCents: NonNegativeCents.default(0),
		notes: z.string().trim().nullable(),
	})
	.refine((input) => Date.parse(input.startAt) < Date.parse(input.endAt), {
		message: "A devolução precisa ser depois da saída",
		path: ["endAt"],
	});
export type CreateQuoteInput = z.input<typeof CreateQuoteInput>;

const RentalRef = z.object({ number: RentalNumber });

export const RecordPaymentInput = RentalRef.extend({
	kind: PaymentKind,
	amountCents: PositiveCents,
	method: PaymentMethod,
	paidAt: IsoDateTime.optional(),
	receiptFileKey: FileKey.nullable().optional(),
});
export type RecordPaymentInput = z.input<typeof RecordPaymentInput>;

export const ExtendInput = RentalRef.extend({ newEndAt: IsoDateTime });

export const ExtendPreview = z.object({
	available: z.boolean(),
	conflicts: z.array(ConflictingItem),
	dailies: z.number().int(),
	addedDailies: z.number().int(),
	newTotalCents: Cents,
	differenceCents: Cents,
});
export type ExtendPreview = z.infer<typeof ExtendPreview>;

export const LostDemandRecord = z.object({
	id: Id,
	item: z.string(),
	typeId: Id.nullable(),
	reason: z.string(),
	city: z.string().nullable(),
	requestedOn: CalendarDay,
	recordedBy: z.string(),
});
export type LostDemandRecord = z.infer<typeof LostDemandRecord>;

export const LostDemandGroup = z.object({
	item: z.string(),
	reason: z.string(),
	count: z.number().int(),
	cities: z.array(z.string()),
});
export type LostDemandGroup = z.infer<typeof LostDemandGroup>;

export const RecordLostDemandInput = z.object({
	item: z.string().trim().min(2, "Informe o que foi pedido"),
	typeId: Id.nullable().default(null),
	reason: z.string().trim().min(2, "Informe o motivo"),
	city: z.string().trim().nullable(),
	requestedOn: CalendarDay,
});
export type RecordLostDemandInput = z.input<typeof RecordLostDemandInput>;

export const ListLostDemandOutput = z.object({
	records: z.array(LostDemandRecord),
	groups: z.array(LostDemandGroup),
});

export const rentals = {
	list: base
		.input(z.object({ tab: RentalTab, q: z.string().optional() }))
		.output(ListRentalsOutput),
	get: base.input(RentalRef).output(Rental),
	createQuote: base.input(CreateQuoteInput).output(Rental),
	sendQuote: base.input(RentalRef).output(Rental),
	recordPayment: base.input(RecordPaymentInput).output(Rental),
	confirm: base.input(RentalRef).output(Rental),
	markSeparated: base.input(RentalRef).output(Rental),
	previewExtend: base.input(ExtendInput).output(ExtendPreview),
	extend: base.input(ExtendInput).output(Rental),
	cancel: base
		.input(
			RentalRef.extend({
				reason: z.string().trim().min(3, "Informe o motivo"),
			}),
		)
		.output(Rental),
	close: base.input(RentalRef).output(Rental),
	copyQuoteText: base.input(RentalRef).output(z.object({ text: z.string() })),
	recordLostDemand: base.input(RecordLostDemandInput).output(LostDemandRecord),
	listLostDemand: base.input(DateRange.optional()).output(ListLostDemandOutput),
};
