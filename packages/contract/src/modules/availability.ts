import { CALENDAR_STATES } from "@marinho-gestao/domain";
import { z } from "zod";
import { base } from "../base";
import {
	CalendarDay,
	Cents,
	Id,
	IsoDateTime,
	ItemCode,
	ItemKind,
	RentalNumber,
	RentalPeriod,
	RentalStatus,
} from "../common";

export const AvailabilitySearchInput = RentalPeriod.safeExtend({
	query: z.string().optional(),
	typeId: Id.optional(),
	/** Peças pedidas. Só vale para lotes; o padrão é 1. */
	quantity: z.number().int().min(1).optional(),
});
export type AvailabilitySearchInput = z.infer<typeof AvailabilitySearchInput>;

export const AvailabilityBlock = z.enum([
	"RENTED",
	"RESERVED",
	"AWAITING_DEPOSIT",
	"OVERDUE",
	"MAINTENANCE",
	"BLOCKED",
	"DAMAGED",
	"NOT_RETURNED",
	"RETIRED",
	"NO_PIECES",
]);
export type AvailabilityBlock = z.infer<typeof AvailabilityBlock>;

/** Locação vista na agenda: a que atrapalha o período ou a próxima marcada. */
export const AvailabilityRental = z.object({
	number: RentalNumber,
	customerName: z.string(),
	customerCity: z.string().nullable(),
	startAt: IsoDateTime,
	endAt: IsoDateTime,
	status: RentalStatus,
});
export type AvailabilityRental = z.infer<typeof AvailabilityRental>;

export const AvailabilityResult = z.object({
	kind: ItemKind,
	code: ItemCode,
	name: z.string(),
	description: z.string().nullable(),
	typeId: Id.nullable(),
	available: z.boolean(),
	dailyPriceCents: Cents.nullable(),
	depositCents: Cents.nullable(),
	perPiece: z.boolean(),
	periodTotalCents: Cents.nullable(),
	totalQuantity: z.number().int().nullable(),
	freeQuantity: z.number().int().nullable(),
	block: AvailabilityBlock.nullable(),
	/** A locação que cruza o período e faz faltar; se mais de uma, a que começa antes. */
	blockingRental: AvailabilityRental.nullable(),
	/** Saindo na data pedida, até quando dá para ficar: a saída da próxima locação que atrapalha, menos a folga. */
	freeUntil: IsoDateTime.nullable(),
	/** Primeiro horário livre depois do conflito, já com a folga e as locações encadeadas. */
	freeFrom: IsoDateTime.nullable(),
	/** A primeira locação que segura a agenda a partir da saída pedida. */
	nextBooking: AvailabilityRental.nullable(),
	/** Folga entre locações usada nas contas. */
	turnaroundHours: z.number().int(),
});
export type AvailabilityResult = z.infer<typeof AvailabilityResult>;

export const AvailabilitySearchOutput = z.object({
	start: IsoDateTime,
	end: IsoDateTime,
	dailies: z.number().int(),
	results: z.array(AvailabilityResult),
});

export const CalendarInput = z.object({
	start: CalendarDay,
	days: z.number().int().min(1).max(31),
});

export const CalendarState = z.enum(CALENDAR_STATES);
export type CalendarState = z.infer<typeof CalendarState>;

export const CalendarCell = z.object({
	date: CalendarDay,
	state: CalendarState,
	rentalNumber: RentalNumber.nullable(),
	freeQuantity: z.number().int().nullable(),
});
export type CalendarCell = z.infer<typeof CalendarCell>;

export const CalendarRow = z.object({
	kind: ItemKind,
	code: ItemCode,
	label: z.string(),
	name: z.string(),
	perPiece: z.boolean(),
	totalQuantity: z.number().int().nullable(),
	cells: z.array(CalendarCell),
});
export type CalendarRow = z.infer<typeof CalendarRow>;

export const CalendarOutput = z.object({
	days: z.array(CalendarDay),
	rows: z.array(CalendarRow),
});
export type CalendarOutput = z.infer<typeof CalendarOutput>;

export const availability = {
	search: base.input(AvailabilitySearchInput).output(AvailabilitySearchOutput),
	calendar: base.input(CalendarInput).output(CalendarOutput),
};
