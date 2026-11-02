import type { Transaction } from "@marinho-gestao/db";
import { type CodePrefix, formatCode } from "@marinho-gestao/domain";

export async function nextCodeFromCounter(
	tx: Transaction,
	prefix: CodePrefix,
): Promise<string> {
	const [row] = await tx.$queryRaw<{ value: number }[]>`
		insert into counter (name, value) values (${prefix}, 1)
		on conflict (name) do update set value = counter.value + 1
		returning value
	`;
	if (!row) throw new Error(`contador ${prefix} não respondeu`);
	return formatCode(prefix, row.value);
}

export async function raiseCounter(
	tx: Transaction,
	prefix: CodePrefix,
	atLeast: number,
): Promise<void> {
	await tx.$executeRaw`
		insert into counter (name, value) values (${prefix}, ${atLeast})
		on conflict (name) do update set value = greatest(counter.value, excluded.value)
	`;
}
