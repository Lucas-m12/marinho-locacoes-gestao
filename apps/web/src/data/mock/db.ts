import { calendarDay } from "@marinho-gestao/domain";
import type {
	PendingUploadPurpose,
	Snapshot,
	UserRecord,
} from "@marinho-gestao/read-model";
import { buildSeed } from "@marinho-gestao/read-model/seed";
import { mockNow } from "./clock";
import { readJson, removeKey, writeText } from "./storage";

export type {
	CustomerRecord,
	InspectionItemRecord,
	InspectionRecord,
	KnownDamageRecord,
	LedgerRecord,
	LotRecord,
	MaintenanceRecord,
	RentalItemRecord,
	RentalRecord,
	TypeRecord,
	UnitRecord,
	UserRecord,
} from "@marinho-gestao/read-model";

export const MOCK_DB_VERSION = 3;
export const MOCK_DB_KEY = `marinho:mock:v${MOCK_DB_VERSION}`;
const OLD_DB_KEYS = ["marinho:mock:v1", "marinho:mock:v2"];

export type FileOwner = {
	purpose: PendingUploadPurpose;
	userId: string;
};

export type PendingUpload = FileOwner & {
	contentType: string;
	sizeBytes: number;
};

export type MockDb = Snapshot & {
	version: number;
	seededDay: string;
	touchedByUser: boolean;
	sequence: number;
	users: UserRecord[];
	fileOwners: Record<string, FileOwner>;
	pendingUploads: Record<string, PendingUpload>;
	idempotency: Record<string, unknown>;
};

function freshDb(now: Date): MockDb {
	return {
		...buildSeed(now),
		version: MOCK_DB_VERSION,
		seededDay: calendarDay(now),
		touchedByUser: false,
		sequence: 1000,
		fileOwners: {},
		pendingUploads: {},
		idempotency: {},
	};
}

let current: MockDb | null = null;
let lastSaved = "";

function load(): MockDb {
	for (const key of OLD_DB_KEYS) removeKey("local", key);
	const stored = readJson<MockDb>("local", MOCK_DB_KEY);
	const today = calendarDay(mockNow());
	const usable =
		stored?.version === MOCK_DB_VERSION &&
		(stored.touchedByUser || stored.seededDay === today);
	return usable ? stored : freshDb(mockNow());
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
	current = freshDb(mockNow());
	persistDb();
	return current;
}

export function nextId(db: MockDb, prefix: string): string {
	db.sequence += 1;
	return `${prefix}-${db.sequence}`;
}
