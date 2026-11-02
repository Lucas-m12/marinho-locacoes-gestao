import type { Database } from "./index";

export async function truncateAll(db: Database): Promise<void> {
	const tables = await db.$queryRaw<{ tablename: string }[]>`
		select tablename from pg_tables
		where schemaname = 'public' and tablename <> '_prisma_migrations'
	`;
	if (tables.length === 0) return;
	const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
	await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
