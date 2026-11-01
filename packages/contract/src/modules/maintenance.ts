import { z } from "zod";
import { base } from "../base";
import {
	Cents,
	Id,
	IsoDateTime,
	ItemCode,
	MaintenanceLocation,
	MaintenanceStatus,
	NonNegativeCents,
	UnitStatus,
} from "../common";

export const OrderNumber = z.string().regex(/^OS-\d+$/);

export const MaintenanceOrder = z.object({
	id: Id,
	number: OrderNumber,
	unitCode: ItemCode,
	unitName: z.string(),
	unitStatus: UnitStatus,
	reason: z.string(),
	location: MaintenanceLocation,
	locationName: z.string().nullable(),
	estimatedCostCents: Cents.nullable(),
	finalCostCents: Cents.nullable(),
	alreadyPostedCents: Cents,
	expectedBackAt: IsoDateTime.nullable(),
	status: MaintenanceStatus,
	openedAt: IsoDateTime,
	completedAt: IsoDateTime.nullable(),
	allowedOutcomes: z.array(UnitStatus),
});
export type MaintenanceOrder = z.infer<typeof MaintenanceOrder>;

export const ListMaintenanceOutput = z.object({
	orders: z.array(MaintenanceOrder),
	inRepair: z.number().int(),
	awaitingInspection: z.number().int(),
	spentLast30DaysCents: Cents,
});

export const OpenMaintenanceInput = z.object({
	unitCode: ItemCode,
	reason: z.string().trim().min(3, "Informe o motivo"),
	location: MaintenanceLocation,
	locationName: z.string().trim().nullable(),
	estimatedCostCents: NonNegativeCents.nullable(),
	expectedBackAt: IsoDateTime.nullable(),
});
export type OpenMaintenanceInput = z.input<typeof OpenMaintenanceInput>;

export const CompleteMaintenanceInput = z.object({
	number: OrderNumber,
	finalCostCents: NonNegativeCents,
	unitStatusAfter: UnitStatus.default("AVAILABLE"),
});
export type CompleteMaintenanceInput = z.input<typeof CompleteMaintenanceInput>;

export const maintenance = {
	list: base.output(ListMaintenanceOutput),
	open: base.input(OpenMaintenanceInput).output(MaintenanceOrder),
	complete: base.input(CompleteMaintenanceInput).output(MaintenanceOrder),
};
