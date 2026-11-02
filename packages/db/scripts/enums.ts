import {
	CHECKLIST_ANSWERS,
	CHECKLIST_MEDIA_SLOTS,
	CUSTOMER_KINDS,
	CUSTOMER_ORIGINS,
	DELIVERY_MODES,
	DOCUMENT_KINDS,
	INSPECTION_KINDS,
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
	UPLOAD_STATUSES,
} from "@marinho-gestao/domain";

const ENUMS: Record<string, readonly string[]> = {
	Role: ROLES,
	UnitStatus: UNIT_STATUSES,
	RentalStatus: RENTAL_STATUSES,
	CustomerKind: CUSTOMER_KINDS,
	CustomerOrigin: CUSTOMER_ORIGINS,
	DocumentKind: DOCUMENT_KINDS,
	DeliveryMode: DELIVERY_MODES,
	PaymentMethod: PAYMENT_METHODS,
	PaymentKind: PAYMENT_KINDS,
	InspectionKind: INSPECTION_KINDS,
	ChecklistAnswer: CHECKLIST_ANSWERS,
	ChecklistMediaSlot: CHECKLIST_MEDIA_SLOTS,
	OccurrenceKind: OCCURRENCE_KINDS,
	OccurrenceDecision: OCCURRENCE_DECISIONS,
	LedgerAccount: LEDGER_ACCOUNTS,
	LedgerDirection: LEDGER_DIRECTIONS,
	LedgerCategory: LEDGER_CATEGORIES,
	MaintenanceStatus: MAINTENANCE_STATUSES,
	MaintenanceLocation: MAINTENANCE_LOCATIONS,
	UploadPurpose: UPLOAD_PURPOSES,
	UploadStatus: UPLOAD_STATUSES,
	UnitPhotoSlot: UNIT_PHOTO_SLOTS,
	LotPricing: LOT_PRICINGS,
	SignalMode: SIGNAL_MODES,
};

function snakeCase(name: string): string {
	return name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
}

export function enumsSchema(): string {
	return `${Object.entries(ENUMS)
		.map(
			([name, values]) =>
				`enum ${name} {\n${values.map((value) => `  ${value}`).join("\n")}\n\n  @@map("${snakeCase(name)}")\n}`,
		)
		.join("\n\n")}\n`;
}
