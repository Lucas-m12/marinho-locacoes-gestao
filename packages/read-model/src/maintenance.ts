import type {
	ListMaintenanceOutput,
	MaintenanceOrder,
} from "@marinho-gestao/contract";
import {
	addHours,
	signedAmountCents,
	sumCents,
	toMs,
	unitStatusMachine,
} from "@marinho-gestao/domain";
import type { z } from "zod";
import { requireUnit } from "./queries";
import type { MaintenanceRecord, Snapshot } from "./records";

export function postedFor(db: Snapshot, number: string): number {
	return sumCents(
		db.ledger
			.filter((entry) => entry.maintenanceNumber === number)
			.map(signedAmountCents),
	);
}

export function orderView(
	db: Snapshot,
	order: MaintenanceRecord,
): MaintenanceOrder {
	const unit = requireUnit(db, order.unitCode);
	return {
		id: order.id,
		number: order.number,
		unitCode: order.unitCode,
		unitName: unit.name,
		unitStatus: unit.status,
		reason: order.reason,
		location: order.location,
		locationName: order.locationName,
		estimatedCostCents: order.estimatedCostCents,
		finalCostCents: order.finalCostCents,
		alreadyPostedCents: postedFor(db, order.number),
		expectedBackAt: order.expectedBackAt,
		status: order.status,
		openedAt: order.openedAt,
		completedAt: order.completedAt,
		allowedOutcomes:
			order.status === "DONE"
				? []
				: [...unitStatusMachine.allowedFrom(unit.status)],
	};
}

export function listMaintenance(
	db: Snapshot,
	now: Date,
): z.infer<typeof ListMaintenanceOutput> {
	const windowStart = addHours(now, -24 * 30).getTime();
	return {
		orders: [...db.maintenance]
			.sort((a, b) =>
				b.number.localeCompare(a.number, "pt-BR", { numeric: true }),
			)
			.map((order) => orderView(db, order)),
		inRepair: db.maintenance.filter((order) => order.status === "IN_REPAIR")
			.length,
		awaitingInspection: db.maintenance.filter(
			(order) => order.status === "AWAITING_INSPECTION",
		).length,
		spentLast30DaysCents: sumCents(
			db.ledger
				.filter(
					(entry) =>
						entry.category === "MAINTENANCE" &&
						toMs(entry.occurredAt) >= windowStart,
				)
				.map(signedAmountCents),
		),
	};
}
