import { z } from "zod";
import { base } from "../base";
import {
	Cents,
	ChecklistAnswer,
	ChecklistMediaSlot,
	FileKey,
	FileRef,
	Id,
	InspectionKind,
	IsoDateTime,
	ItemCode,
	ItemKind,
	NonNegativeCents,
	OccurrenceDecision,
	OccurrenceKind,
	PaymentMethod,
	PositiveCents,
	RentalNumber,
	UnitStatus,
} from "../common";
import { KnownDamage } from "./equipment";
import { Rental } from "./rentals";

export const InspectionItem = z.object({
	id: Id,
	label: z.string(),
	note: z.string(),
	occurrenceKind: OccurrenceKind,
	answer: ChecklistAnswer.nullable(),
	observation: z.string().nullable(),
	preexisting: z.boolean(),
	checkoutAnswer: ChecklistAnswer.nullable(),
	checkoutObservation: z.string().nullable(),
});
export type InspectionItem = z.infer<typeof InspectionItem>;

export const InspectionMedia = z.object({
	slot: ChecklistMediaSlot,
	file: FileRef.nullable(),
	checkoutFile: FileRef.nullable(),
});
export type InspectionMedia = z.infer<typeof InspectionMedia>;

export const ReturnOutcome = z.enum([
	"AVAILABLE",
	"IN_INSPECTION",
	"IN_MAINTENANCE",
	"DAMAGED",
]);
export type ReturnOutcome = z.infer<typeof ReturnOutcome>;

export const Inspection = z.object({
	id: Id,
	rentalNumber: RentalNumber,
	itemKind: ItemKind,
	unitCode: ItemCode,
	unitName: z.string(),
	typeName: z.string(),
	kind: InspectionKind,
	completedAt: IsoDateTime.nullable(),
	customerName: z.string(),
	siteCity: z.string().nullable(),
	items: z.array(InspectionItem),
	media: z.array(InspectionMedia),
	knownDamages: z.array(KnownDamage),
	dailyPriceCents: Cents.nullable(),
	balanceCents: Cents,
	depositExpectedCents: Cents.nullable(),
	depositReceivedCents: Cents,
	termSigned: z.boolean(),
	lateFee: z.object({
		extraDailies: z.number().int(),
		suggestedCents: Cents,
	}),
});
export type Inspection = z.infer<typeof Inspection>;

export const InspectionRef = z.object({
	rentalNumber: RentalNumber,
	unitCode: ItemCode,
	kind: InspectionKind,
});

export const SaveInspectionItemInput = z.object({
	inspectionId: Id,
	itemId: Id,
	answer: ChecklistAnswer.nullable(),
	observation: z.string().trim().nullable(),
});
export type SaveInspectionItemInput = z.input<typeof SaveInspectionItemInput>;

export const AttachMediaInput = z.object({
	inspectionId: Id,
	slot: ChecklistMediaSlot,
	fileKey: FileKey,
});

export const OccurrenceResolution = z.object({
	itemId: Id,
	kind: OccurrenceKind,
	description: z.string().trim().min(2),
	amountCents: NonNegativeCents,
	decision: OccurrenceDecision,
});
export type OccurrenceResolution = z.infer<typeof OccurrenceResolution>;

export const CompleteInspectionInput = z.object({
	inspectionId: Id,
	termSigned: z.boolean().default(false),
	balance: z
		.object({ amountCents: PositiveCents, method: PaymentMethod })
		.nullable()
		.default(null),
	deposit: z
		.object({ amountCents: PositiveCents, method: PaymentMethod })
		.nullable()
		.default(null),
	resolutions: z.array(OccurrenceResolution).default([]),
	lateFee: z
		.object({ amountCents: NonNegativeCents, decision: OccurrenceDecision })
		.nullable()
		.default(null),
	outcome: ReturnOutcome.default("AVAILABLE"),
});
export type CompleteInspectionInput = z.input<typeof CompleteInspectionInput>;

export const CompleteInspectionOutput = z.object({
	inspection: Inspection,
	rental: Rental,
	unitStatus: UnitStatus.nullable(),
});

export const inspections = {
	get: base.input(InspectionRef).output(Inspection),
	saveItem: base.input(SaveInspectionItemInput).output(InspectionItem),
	attachMedia: base.input(AttachMediaInput).output(InspectionMedia),
	complete: base
		.input(CompleteInspectionInput)
		.output(CompleteInspectionOutput),
};
