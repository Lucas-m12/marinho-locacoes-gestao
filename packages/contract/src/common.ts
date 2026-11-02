import {
	CHECKLIST_ANSWERS,
	CHECKLIST_MEDIA_SLOTS,
	CUSTOMER_KINDS,
	CUSTOMER_ORIGINS,
	CUSTOMER_SEGMENTS,
	CUSTOMER_TIERS,
	DELIVERY_MODES,
	DOCUMENT_KINDS,
	INSPECTION_KINDS,
	ITEM_KINDS,
	LEDGER_ACCOUNTS,
	LEDGER_CATEGORIES,
	LEDGER_DIRECTIONS,
	LOT_PRICINGS,
	MAINTENANCE_LOCATIONS,
	MAINTENANCE_STATUSES,
	OCCURRENCE_DECISIONS,
	OCCURRENCE_KINDS,
	PAYMENT_KINDS,
	PAYMENT_METHODS,
	RENTAL_STATUSES,
	ROLES,
	SIGNAL_MODES,
	UNIT_PHOTO_SLOTS,
	UNIT_STATUSES,
	UPLOAD_PURPOSES,
} from "@marinho-gestao/domain";
import { z } from "zod";

export const IsoDateTime = z.iso.datetime({ offset: true });
export const CalendarDay = z.iso.date();
export const Cents = z.number({ error: "Informe o valor" }).int();
export const PositiveCents = Cents.positive("Informe um valor maior que zero");
export const NonNegativeCents = Cents.nonnegative();
export const Id = z.string().min(1);
export const FileKey = z.string().min(1);
export const IdempotencyKey = z.string().min(8);
export const YearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const RentalNumber = z.string().regex(/^LOC-\d+$/);
export const ItemCode = z.string().regex(/^[A-Z]+(-\d+)?$/);

export const Role = z.enum(ROLES);
export const UnitStatus = z.enum(UNIT_STATUSES);
export const RentalStatus = z.enum(RENTAL_STATUSES);
export const RentalDisplayStatus = z.enum([...RENTAL_STATUSES, "OVERDUE"]);
export const CustomerKind = z.enum(CUSTOMER_KINDS);
export const CustomerTier = z.enum(CUSTOMER_TIERS);
export const CustomerSegment = z.enum(CUSTOMER_SEGMENTS);
export const CustomerOrigin = z.enum(CUSTOMER_ORIGINS);
export const DocumentKind = z.enum(DOCUMENT_KINDS);
export const DeliveryMode = z.enum(DELIVERY_MODES);
export const PaymentMethod = z.enum(PAYMENT_METHODS);
export const PaymentKind = z.enum(PAYMENT_KINDS);
export const InspectionKind = z.enum(INSPECTION_KINDS);
export const ChecklistAnswer = z.enum(CHECKLIST_ANSWERS);
export const ChecklistMediaSlot = z.enum(CHECKLIST_MEDIA_SLOTS);
export const OccurrenceKind = z.enum(OCCURRENCE_KINDS);
export const OccurrenceDecision = z.enum(OCCURRENCE_DECISIONS);
export const LedgerAccount = z.enum(LEDGER_ACCOUNTS);
export const LedgerCategory = z.enum(LEDGER_CATEGORIES);
export const LedgerDirection = z.enum(LEDGER_DIRECTIONS);
export const MaintenanceLocation = z.enum(MAINTENANCE_LOCATIONS);
export const MaintenanceStatus = z.enum(MAINTENANCE_STATUSES);
export const UploadPurpose = z.enum(UPLOAD_PURPOSES);
export const UnitPhotoSlot = z.enum(UNIT_PHOTO_SLOTS);
export const ItemKind = z.enum(ITEM_KINDS);
export const LotPricing = z.enum(LOT_PRICINGS);
export const SignalMode = z.enum(SIGNAL_MODES);

export const FileRef = z.object({
	fileKey: FileKey,
	contentType: z.string(),
	sizeBytes: z.number().int().nonnegative(),
	uploadedAt: IsoDateTime,
});
export type FileRef = z.infer<typeof FileRef>;

export const DateRange = z
	.object({ from: IsoDateTime, to: IsoDateTime })
	.refine((range) => Date.parse(range.from) <= Date.parse(range.to), {
		message: "O início precisa vir antes do fim",
		path: ["to"],
	});

export const RentalPeriod = z
	.object({ start: IsoDateTime, end: IsoDateTime })
	.refine((period) => Date.parse(period.start) < Date.parse(period.end), {
		message: "A devolução precisa ser depois da saída",
		path: ["end"],
	});

export const ConflictingItem = z.object({
	code: ItemCode,
	name: z.string(),
	rentalNumber: RentalNumber.nullable(),
	freeFrom: IsoDateTime.nullable(),
	requestedQuantity: z.number().int().positive().nullable(),
	freeQuantity: z.number().int().nonnegative().nullable(),
});
export type ConflictingItem = z.infer<typeof ConflictingItem>;

export const ConflictErrorData = z.object({
	conflicts: z.array(ConflictingItem),
});
export type ConflictErrorData = z.infer<typeof ConflictErrorData>;

export const InvalidTransitionData = z.object({
	entity: z.enum(["UNIT", "RENTAL"]),
	from: z.string(),
	to: z.string(),
	allowed: z.array(z.string()),
});
export type InvalidTransitionData = z.infer<typeof InvalidTransitionData>;

export const PreconditionReason = z.enum([
	"UNPRICED_TYPE",
	"NO_ITEMS",
	"REASON_REQUIRED",
	"SIGNAL_REQUIRED",
	"SIGNAL_EXPIRED",
	"DEPOSIT_NOT_SETTLED",
	"CHECKLIST_INCOMPLETE",
	"CHECKLIST_ALREADY_DONE",
	"TERM_NOT_SIGNED",
	"UNITS_NOT_SEPARATED",
	"INSUFFICIENT_DEPOSIT",
	"CUSTOMER_BLOCKED",
	"INVALID_DATE",
	"DUPLICATE",
	"UPLOAD_MISSING",
	"UPLOAD_INVALID",
	"ALREADY_REVERSED",
	"IS_REVERSAL",
]);
export type PreconditionReason = z.infer<typeof PreconditionReason>;

export const PreconditionFailedData = z.object({
	reason: PreconditionReason,
	codes: z.array(z.string()).default([]),
});
export type PreconditionFailedData = z.infer<typeof PreconditionFailedData>;
