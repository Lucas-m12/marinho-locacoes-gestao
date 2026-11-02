import type { Database } from "./index";

const AUTH_TABLES = ["user", "account", "session", "verification"];

async function truncateExcept(
	db: Database,
	kept: readonly string[],
): Promise<void> {
	const tables = await db.$queryRaw<{ tablename: string }[]>`
		select tablename from pg_tables
		where schemaname = 'public' and tablename <> '_prisma_migrations'
	`;
	const truncated = tables.filter(({ tablename }) => !kept.includes(tablename));
	if (truncated.length === 0) return;
	const list = truncated.map(({ tablename }) => `"${tablename}"`).join(", ");
	await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export function truncateAll(db: Database): Promise<void> {
	return truncateExcept(db, []);
}

export function truncateBusinessTables(db: Database): Promise<void> {
	return truncateExcept(db, AUTH_TABLES);
}
