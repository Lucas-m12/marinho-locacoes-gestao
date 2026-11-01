import {
	contract,
	type Session,
	type SessionUser,
} from "@marinho-gestao/contract";
import { can, type Permission } from "@marinho-gestao/domain";
import { implement, ORPCError } from "@orpc/server";
import { mockNow } from "./clock";
import { getDb, persistDb } from "./db";
import { expireSignals } from "./flows";

export type MockContext = { session: Session | null };

const MIN_LATENCY_MS = 150;
const MAX_LATENCY_MS = 400;

let latencyEnabled = true;

export function setMockLatency(enabled: boolean): void {
	latencyEnabled = enabled;
}

function simulateLatency(): Promise<void> {
	if (!latencyEnabled) return Promise.resolve();
	const span = MAX_LATENCY_MS - MIN_LATENCY_MS;
	const wait = MIN_LATENCY_MS + Math.random() * span;
	return new Promise((resolve) => setTimeout(resolve, wait));
}

export const os = implement(contract).$context<MockContext>();

export const api = os.use(async ({ next }) => {
	await simulateLatency();
	const db = getDb();
	expireSignals(db, mockNow());
	persistDb();
	const result = await next();
	if (persistDb()) {
		db.touchedByUser = true;
		persistDb();
	}
	return result;
});

export function requireUser(context: MockContext): SessionUser {
	if (!context.session) throw new ORPCError("UNAUTHORIZED");
	return context.session.user;
}

export function requirePermission(
	context: MockContext,
	permission: Permission,
): SessionUser {
	const user = requireUser(context);
	if (!can(user.role, permission)) throw new ORPCError("FORBIDDEN");
	return user;
}
