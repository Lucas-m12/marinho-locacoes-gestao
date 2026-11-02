import type { DbClient } from "@marinho-gestao/db";
import { isUuid, notFound } from "../errors";

export function requireUuid(resource: string, id: string): string {
	if (!isUuid(id)) throw notFound(resource, id);
	return id;
}

export async function lockUnit(db: DbClient, code: string) {
	const [unit] = await db.$queryRaw<{ id: string }[]>`
		select id from unit where code = ${code} for update
	`;
	if (!unit) throw notFound("unit", code);
	return unit.id;
}

export async function lockRental(db: DbClient, code: string) {
	const [rental] = await db.$queryRaw<{ id: string }[]>`
		select id from rental where code = ${code} for update
	`;
	if (!rental) throw notFound("rental", code);
	return rental.id;
}

export async function lockLots(db: DbClient, codes: readonly string[]) {
	if (codes.length === 0) return;
	await db.$queryRaw`
		select id from lot where code = any(${[...codes].sort()}) order by code for update
	`;
}
