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
	blockingRental: z
		.object({
			number: RentalNumber,
			customerName: z.string(),
			endAt: IsoDateTime,
			status: RentalStatus,
		})
		.nullable(),
	freeFrom: IsoDateTime.nullable(),
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
