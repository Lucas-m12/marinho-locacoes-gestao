import { BUSINESS_TIME_ZONE, calendarDay, type DateInput } from "./dates";
import type {
	LedgerCategory,
	LedgerDirection,
	PaymentKind,
	PaymentMethod,
} from "./enums";
import { LEDGER_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "./labels";

export const PAYMENT_LEDGER_CATEGORY: Record<PaymentKind, LedgerCategory> = {
	SIGNAL: "RENTAL",
	BALANCE: "RENTAL",
	DELIVERY_FEE: "DELIVERY",
	CONSUMABLE: "CONSUMABLE_SOLD",
	EXTRA_DAILY: "EXTRA_FEES",
};

export type ReversibleEntry = { id: string; reversalOfId: string | null };

export type ReversalBlock = "IS_REVERSAL" | "ALREADY_REVERSED";

export function reversalBlock(
	entry: ReversibleEntry,
	entries: readonly ReversibleEntry[],
): ReversalBlock | null {
	if (entry.reversalOfId !== null) return "IS_REVERSAL";
	return entries.some((other) => other.reversalOfId === entry.id)
		? "ALREADY_REVERSED"
		: null;
}

export function oppositeDirection(direction: LedgerDirection): LedgerDirection {
	return direction === "IN" ? "OUT" : "IN";
}

type SignedEntry = {
	direction: LedgerDirection;
	amountCents: number;
	reversalOfId: string | null;
};

export function signedAmountCents(entry: {
	amountCents: number;
	reversalOfId: string | null;
}): number {
	return entry.reversalOfId === null ? entry.amountCents : -entry.amountCents;
}

function originalDirection(entry: SignedEntry): LedgerDirection {
	return entry.reversalOfId === null
		? entry.direction
		: oppositeDirection(entry.direction);
}

export function ledgerTotals(entries: readonly SignedEntry[]): {
	inCents: number;
	outCents: number;
	resultCents: number;
} {
	let inCents = 0;
	let outCents = 0;
	for (const entry of entries) {
		const amount = signedAmountCents(entry);
		if (originalDirection(entry) === "IN") inCents += amount;
		else outCents += amount;
	}
	return { inCents, outCents, resultCents: inCents - outCents };
}

export type CsvLedgerEntry = SignedEntry & {
	occurredAt: DateInput;
	category: LedgerCategory;
	description: string;
	method: PaymentMethod;
	rentalNumber: string | null;
	unitCode: string | null;
};

const CSV_HEADER = "Data;Tipo;Categoria;Descrição;Forma;Valor;Locação;Unidade";
const CSV_BOM = "﻿";
const CSV_LINE_END = "\r\n";
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function csvText(value: string): string {
	const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
	return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csvAmount(cents: number): string {
	const absolute = Math.abs(cents);
	const reais = Math.floor(absolute / 100);
	const decimals = (absolute % 100).toString().padStart(2, "0");
	return `${cents < 0 ? "-" : ""}${reais},${decimals}`;
}

function csvDate(value: DateInput, timeZone: string): string {
	const [year, month, day] = calendarDay(value, timeZone).split("-");
	return `${day}/${month}/${year}`;
}

export function isInMonth(
	value: DateInput,
	month: string,
	timeZone: string = BUSINESS_TIME_ZONE,
): boolean {
	return calendarDay(value, timeZone).startsWith(`${month}-`);
}

export function ledgerCsv(input: {
	month: string;
	entries: readonly CsvLedgerEntry[];
	timeZone?: string;
}): { fileName: string; content: string } {
	const timeZone = input.timeZone ?? BUSINESS_TIME_ZONE;
	const rows = input.entries
		.filter((entry) => isInMonth(entry.occurredAt, input.month, timeZone))
		.sort(
			(a, b) =>
				new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
		)
		.map((entry) =>
			[
				csvDate(entry.occurredAt, timeZone),
				originalDirection(entry) === "IN" ? "Entrada" : "Saída",
				csvText(LEDGER_CATEGORY_LABELS[entry.category]),
				csvText(entry.description),
				PAYMENT_METHOD_LABELS[entry.method],
				csvAmount(signedAmountCents(entry)),
				entry.rentalNumber ?? "",
				entry.unitCode ?? "",
			].join(";"),
		);

	return {
		fileName: `marinho-caixa-${input.month}.csv`,
		content: `${CSV_BOM}${[CSV_HEADER, ...rows].join(CSV_LINE_END)}${CSV_LINE_END}`,
	};
}
