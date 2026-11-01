export const ROLES = ["MANAGER", "ATTENDANT", "EQUIPMENT"] as const;
export type Role = (typeof ROLES)[number];

export const UNIT_STATUSES = [
	"AVAILABLE",
	"SEPARATED",
	"RENTED",
	"IN_INSPECTION",
	"IN_MAINTENANCE",
	"DAMAGED",
	"NOT_RETURNED",
	"BLOCKED",
	"RETIRED",
] as const;
export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const RENTAL_STATUSES = [
	"QUOTE",
	"AWAITING_DEPOSIT",
	"CONFIRMED",
	"SEPARATED",
	"ON_SITE",
	"RETURNED",
	"CLOSED",
	"CANCELED",
	"EXPIRED",
] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];

export const CUSTOMER_KINDS = [
	"INDIVIDUAL",
	"PROFESSIONAL",
	"COMPANY",
] as const;
export type CustomerKind = (typeof CUSTOMER_KINDS)[number];

export const CUSTOMER_TIERS = [
	"BLOCKED",
	"ATTENTION",
	"TRUSTED",
	"RECURRING",
	"NEW",
] as const;
export type CustomerTier = (typeof CUSTOMER_TIERS)[number];

export const CUSTOMER_SEGMENTS = [
	"ALL",
	"PROFESSIONALS",
	"HOME_RENOVATION",
	"ATTENTION",
] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export const CUSTOMER_ORIGINS = [
	"INSTAGRAM",
	"GOOGLE",
	"REFERRAL",
	"PARTNER_STORE",
] as const;
export type CustomerOrigin = (typeof CUSTOMER_ORIGINS)[number];

export const DOCUMENT_KINDS = [
	"PHOTO_ID",
	"TAX_ID",
	"PROOF_OF_ADDRESS",
	"OTHER",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DELIVERY_MODES = ["DELIVERY", "PICKUP"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const PAYMENT_METHODS = ["PIX", "CASH"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_KINDS = [
	"SIGNAL",
	"BALANCE",
	"DELIVERY_FEE",
	"CONSUMABLE",
	"EXTRA_DAILY",
] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const INSPECTION_KINDS = ["CHECKOUT", "RETURN"] as const;
export type InspectionKind = (typeof INSPECTION_KINDS)[number];

export const CHECKLIST_ANSWERS = ["OK", "NOT_OK", "NA"] as const;
export type ChecklistAnswer = (typeof CHECKLIST_ANSWERS)[number];

export const OCCURRENCE_KINDS = [
	"DAMAGE",
	"MISSING_PART",
	"DIRT",
	"LATE",
] as const;
export type OccurrenceKind = (typeof OCCURRENCE_KINDS)[number];

export const OCCURRENCE_DECISIONS = ["CHARGE", "WAIVE", "DISPUTE"] as const;
export type OccurrenceDecision = (typeof OCCURRENCE_DECISIONS)[number];

export const LEDGER_ACCOUNTS = ["CASH", "DEPOSIT"] as const;
export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];

export const LEDGER_DIRECTIONS = ["IN", "OUT"] as const;
export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[number];

export const LEDGER_IN_CATEGORIES = [
	"RENTAL",
	"DELIVERY",
	"CONSUMABLE_SOLD",
	"EXTRA_FEES",
	"DEPOSIT_RETAINED",
	"OTHER_IN",
] as const;

export const LEDGER_OUT_CATEGORIES = [
	"EQUIPMENT_PURCHASE",
	"MAINTENANCE",
	"FUEL",
	"ADVERTISING",
	"CONSUMABLE_BOUGHT",
	"OTHER_OUT",
] as const;

export const DEPOSIT_CATEGORIES = [
	"DEPOSIT_RECEIVED",
	"DEPOSIT_REFUNDED",
	"DEPOSIT_TO_CASH",
] as const;

export const LEDGER_CATEGORIES = [
	...LEDGER_IN_CATEGORIES,
	...LEDGER_OUT_CATEGORIES,
	...DEPOSIT_CATEGORIES,
] as const;
export type LedgerCategory = (typeof LEDGER_CATEGORIES)[number];

export const MAINTENANCE_STATUSES = [
	"IN_REPAIR",
	"AWAITING_INSPECTION",
	"DONE",
] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_LOCATIONS = ["WORKSHOP", "BASE"] as const;
export type MaintenanceLocation = (typeof MAINTENANCE_LOCATIONS)[number];

export const UPLOAD_PURPOSES = [
	"UNIT_PHOTO",
	"DAMAGE_PHOTO",
	"CHECKLIST_PHOTO",
	"CHECKLIST_VIDEO",
	"CUSTOMER_DOCUMENT",
	"RECEIPT",
] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const UNIT_PHOTO_SLOTS = [
	"MAIN",
	"FRONT",
	"BACK",
	"PLATE",
	"SERIAL",
] as const;
export type UnitPhotoSlot = (typeof UNIT_PHOTO_SLOTS)[number];

export const CHECKLIST_MEDIA_SLOTS = [
	"FRONT",
	"BACK",
	"LEFT",
	"RIGHT",
	"PLATE_SERIAL",
	"TEST_VIDEO",
] as const;
export type ChecklistMediaSlot = (typeof CHECKLIST_MEDIA_SLOTS)[number];

export const ITEM_KINDS = ["UNIT", "LOT"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const LOT_PRICINGS = ["PER_PIECE", "PER_LOT"] as const;
export type LotPricing = (typeof LOT_PRICINGS)[number];

export const SIGNAL_MODES = ["FIXED", "PERCENT"] as const;
export type SignalMode = (typeof SIGNAL_MODES)[number];

export const CALENDAR_STATES = [
	"FREE",
	"RENTED",
	"RESERVED",
	"AWAITING_DEPOSIT",
	"INSPECTION",
	"MAINTENANCE",
	"OVERDUE",
	"BLOCKED",
] as const;
export type CalendarState = (typeof CALENDAR_STATES)[number];
