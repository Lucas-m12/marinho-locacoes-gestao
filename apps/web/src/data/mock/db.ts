import type {
	ChecklistTemplateItem,
	DeliveryFee,
	FileRef,
	SignalRule,
} from "@marinho-gestao/contract";
import type {
	ChecklistAnswer,
	ChecklistMediaSlot,
	CustomerKind,
	CustomerOrigin,
	DeliveryMode,
	DocumentKind,
	InspectionKind,
	ItemKind,
	LedgerAccount,
	LedgerCategory,
	LedgerDirection,
	LotPricing,
	MaintenanceLocation,
	MaintenanceStatus,
	OccurrenceDecision,
	OccurrenceKind,
	PaymentKind,
	PaymentMethod,
	RentalStatus,
	Role,
	UnitPhotoSlot,
	UnitStatus,
	UploadPurpose,
} from "@marinho-gestao/domain";
import { calendarDay } from "@marinho-gestao/domain";
import { mockNow } from "./clock";
import { buildSeed } from "./seed";
import { readJson, writeText } from "./storage";

export const MOCK_DB_VERSION = 1;
export const MOCK_DB_KEY = `marinho:mock:v${MOCK_DB_VERSION}`;

export type UserRecord = {
	id: string;
	name: string;
	email: string;
	role: Role;
	password: string;
};

export type TypeRecord = {
	id: string;
	name: string;
	nicknames: string[];
	description: string | null;
	dailyPriceCents: number | null;
	depositCents: number | null;
	turnaroundHours: number;
	accessories: string | null;
	checklist: ChecklistTemplateItem[];
};

export type KnownDamageRecord = {
	id: string;
	description: string;
	recordedAt: string;
	recordedBy: string;
	fileKey: string | null;
};

export type UnitRecord = {
	id: string;
	code: string;
	typeId: string;
	name: string;
	shortName: string;
	status: UnitStatus;
	statusReason: string | null;
	voltage: string | null;
	serialNumber: string | null;
	accessories: string | null;
	owner: string | null;
	labelApplied: boolean;
	purchaseValueCents: number | null;
	replacementValueCents: number | null;
	notes: string | null;
	returnedAt: string | null;
	photos: { slot: UnitPhotoSlot; fileKey: string }[];
	knownDamages: KnownDamageRecord[];
};

export type LotRecord = {
	id: string;
	code: string;
	name: string;
	nicknames: string[];
	pricing: LotPricing;
	total: number;
	inMaintenance: number;
	retired: number;
	dailyPriceCents: number | null;
	depositCents: number | null;
	kitComposition: string | null;
	assetCode: string | null;
	turnaroundHours: number;
	checklist: ChecklistTemplateItem[];
};

export type CustomerDocumentRecord = {
	id: string;
	kind: DocumentKind;
	receivedAt: string;
	fileKey: string;
};

export type CustomerRecord = {
	id: string;
	kind: CustomerKind;
	name: string;
	taxId: string | null;
	responsible: string | null;
	authorizedReceivers: string[];
	whatsapp: string | null;
	alternatePhone: string | null;
	address: string | null;
	neighborhood: string | null;
	city: string | null;
	occupation: string | null;
	origin: CustomerOrigin | null;
	referredBy: string | null;
	acceptsPromotions: boolean;
	notes: string | null;
	blockedManually: boolean;
	blockReason: string | null;
	createdAt: string;
	documents: CustomerDocumentRecord[];
};

export type RentalItemRecord = {
	id: string;
	kind: ItemKind;
	code: string;
	quantity: number;
	frozenDailyPriceCents: number | null;
	frozenDepositCents: number | null;
	checkoutDoneAt: string | null;
	returnDoneAt: string | null;
};

export type PaymentRecord = {
	id: string;
	kind: PaymentKind;
	amountCents: number;
	method: PaymentMethod;
	paidAt: string;
	recordedBy: string;
};

export type DepositRecord = {
	receivedCents: number;
	receivedAt: string | null;
	receivedMethod: PaymentMethod | null;
	refundedCents: number;
	refundedAt: string | null;
	refundedMethod: PaymentMethod | null;
	retainedCents: number;
	retentionReason: string | null;
	retainedAt: string | null;
};

export type RentalEventRecord = {
	id: string;
	at: string;
	message: string;
	actorName: string;
	actorRole: Role | null;
};

export type OccurrenceRecord = {
	id: string;
	itemCode: string;
	kind: OccurrenceKind;
	description: string;
	suggestedCents: number;
	amountCents: number;
	decision: OccurrenceDecision;
	createdAt: string;
};

export type RentalRecord = {
	id: string;
	number: string;
	status: RentalStatus;
	customerId: string;
	startAt: string;
	endAt: string;
	items: RentalItemRecord[];
	deliveryMode: DeliveryMode;
	siteAddress: string | null;
	siteCity: string | null;
	sitePinUrl: string | null;
	receiverName: string | null;
	termSigned: boolean;
	notes: string | null;
	deliveryFeeCents: number | null;
	discountCents: number;
	payments: PaymentRecord[];
	deposit: DepositRecord;
	occurrences: OccurrenceRecord[];
	history: RentalEventRecord[];
	signalDueAt: string | null;
	priceFrozenAt: string | null;
	cancelReason: string | null;
	lateNoticeGiven: boolean;
	createdAt: string;
	sentAt: string | null;
	confirmedAt: string | null;
	separatedAt: string | null;
	deliveredAt: string | null;
	returnedAt: string | null;
	closedAt: string | null;
};

export type InspectionItemRecord = {
	id: string;
	label: string;
	note: string;
	occurrenceKind: OccurrenceKind;
	answer: ChecklistAnswer | null;
	observation: string | null;
	preexisting: boolean;
};

export type InspectionRecord = {
	id: string;
	rentalNumber: string;
	itemCode: string;
	kind: InspectionKind;
	completedAt: string | null;
	items: InspectionItemRecord[];
	media: { slot: ChecklistMediaSlot; fileKey: string }[];
};

export type LedgerRecord = {
	id: string;
	account: LedgerAccount;
	direction: LedgerDirection;
	category: LedgerCategory;
	amountCents: number;
	occurredAt: string;
	method: PaymentMethod;
	description: string;
	rentalNumber: string | null;
	unitCode: string | null;
	receiptFileKey: string | null;
	recordedBy: string;
	maintenanceNumber: string | null;
};

export type MaintenanceRecord = {
	id: string;
	number: string;
	unitCode: string;
	reason: string;
	location: MaintenanceLocation;
	locationName: string | null;
	estimatedCostCents: number | null;
	finalCostCents: number | null;
	expectedBackAt: string | null;
	status: MaintenanceStatus;
	openedAt: string;
	completedAt: string | null;
};

export type LostDemandRecord = {
	id: string;
	item: string;
	typeId: string | null;
	reason: string;
	city: string | null;
	requestedOn: string;
	recordedBy: string;
};

export type SettingsRecord = {
	deliveryFees: DeliveryFee[];
	signal: SignalRule;
	signalDeadlineHours: number;
};

export type PendingUpload = {
	purpose: UploadPurpose;
	contentType: string;
	sizeBytes: number;
};

export type MockDb = {
	version: number;
	seededDay: string;
	touchedByUser: boolean;
	sequence: number;
	users: UserRecord[];
	types: TypeRecord[];
	units: UnitRecord[];
	lots: LotRecord[];
	customers: CustomerRecord[];
	rentals: RentalRecord[];
	inspections: InspectionRecord[];
	ledger: LedgerRecord[];
	maintenance: MaintenanceRecord[];
	lostDemand: LostDemandRecord[];
	settings: SettingsRecord;
	files: Record<string, FileRef>;
	pendingUploads: Record<string, PendingUpload>;
};

let current: MockDb | null = null;
let lastSaved = "";

function load(): MockDb {
	const stored = readJson<MockDb>("local", MOCK_DB_KEY);
	const today = calendarDay(mockNow());
	const usable =
		stored?.version === MOCK_DB_VERSION &&
		(stored.touchedByUser || stored.seededDay === today);
	return usable ? stored : buildSeed(mockNow());
}

function serialize(db: MockDb): string {
	return JSON.stringify(db);
}

export function getDb(): MockDb {
	if (!current) {
		current = load();
		persistDb();
	}
	return current;
}

export function persistDb(): boolean {
	if (!current) return false;
	const text = serialize(current);
	if (text === lastSaved) return false;
	lastSaved = text;
	writeText("local", MOCK_DB_KEY, text);
	return true;
}

export function resetDb(): MockDb {
	current = buildSeed(mockNow());
	persistDb();
	return current;
}

export function nextId(db: MockDb, prefix: string): string {
	db.sequence += 1;
	return `${prefix}-${db.sequence}`;
}
