import { z } from "zod";
import { base } from "../base";
import {
	Cents,
	DateRange,
	IsoDateTime,
	ItemCode,
	RentalDisplayStatus,
	RentalNumber,
	UnitStatus,
} from "../common";

export const DashboardMovementItem = z.object({
	code: ItemCode,
	label: z.string(),
	unitStatus: UnitStatus.nullable(),
});

export const DashboardMovement = z.object({
	rentalNumber: RentalNumber,
	at: IsoDateTime,
	customerName: z.string(),
	city: z.string().nullable(),
	displayStatus: RentalDisplayStatus,
	items: z.array(DashboardMovementItem),
});
export type DashboardMovement = z.infer<typeof DashboardMovement>;

export const OverdueRental = z.object({
	rentalNumber: RentalNumber,
	dueAt: IsoDateTime,
	customerName: z.string(),
	city: z.string().nullable(),
	equipment: z.string(),
	nextBooking: z
		.object({ rentalNumber: RentalNumber, startAt: IsoDateTime })
		.nullable(),
});
export type OverdueRental = z.infer<typeof OverdueRental>;

export const AwaitingSignal = z.object({
	rentalNumber: RentalNumber,
	equipment: z.string(),
	customerName: z.string(),
	city: z.string().nullable(),
	startAt: IsoDateTime,
	signalDueAt: IsoDateTime,
});
export type AwaitingSignal = z.infer<typeof AwaitingSignal>;

export const UnitStatusCount = z.object({
	status: UnitStatus,
	count: z.number().int(),
});

export const ScaffoldToday = z.object({
	total: z.number().int(),
	free: z.number().int(),
	reserved: z.number().int(),
	rentalNumbers: z.array(RentalNumber),
});

export const DashboardToday = z.object({
	now: IsoDateTime,
	overdue: z.array(OverdueRental),
	leaving: z.array(DashboardMovement),
	returning: z.array(DashboardMovement),
	unitCounts: z.array(UnitStatusCount),
	unitTotal: z.number().int(),
	scaffold: ScaffoldToday.nullable(),
	awaitingSignal: z.array(AwaitingSignal),
});
export type DashboardToday = z.infer<typeof DashboardToday>;

export const DashboardSummary = z.object({
	inCents: Cents,
	outCents: Cents,
	resultCents: Cents,
	depositHeldCents: Cents,
	depositHeldRentalCount: z.number().int(),
});
export type DashboardSummary = z.infer<typeof DashboardSummary>;

export const dashboard = {
	today: base.output(DashboardToday),
	summary: base.input(DateRange).output(DashboardSummary),
};
