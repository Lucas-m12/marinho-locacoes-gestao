import type { MaintenanceOrder } from "@marinho-gestao/contract";
import {
	addHours,
	nextCode,
	signedAmountCents,
	sumCents,
	toMs,
	unitStatusMachine,
} from "@marinho-gestao/domain";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import { getDb, type MaintenanceRecord, type MockDb, nextId } from "../db";
import { notFound } from "../errors";
import { postLedger } from "../flows";
import { requireUnit } from "../queries";
import { closeOpenOrders, moveUnit } from "./equipment";

function postedFor(db: MockDb, number: string): number {
	return sumCents(
		db.ledger
			.filter((entry) => entry.maintenanceNumber === number)
			.map(signedAmountCents),
	);
}

function orderView(db: MockDb, order: MaintenanceRecord): MaintenanceOrder {
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

export const maintenance = {
	list: api.maintenance.list.handler(({ context }) => {
		requirePermission(context, "maintenance:read");
		const db = getDb();
		const now = mockNow();
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
	}),

	open: api.maintenance.open.handler(({ context, input }) => {
		requirePermission(context, "maintenance:write");
		const db = getDb();
		const now = mockNow();
		const unit = requireUnit(db, input.unitCode);
		moveUnit(unit, "IN_MAINTENANCE", input.reason);
		closeOpenOrders(db, unit.code, now);
		const order: MaintenanceRecord = {
			id: nextId(db, "os"),
			number: nextCode(
				"OS",
				db.maintenance.map((entry) => entry.number),
			),
			unitCode: unit.code,
			reason: input.reason,
			location: input.location,
			locationName: input.locationName,
			estimatedCostCents: input.estimatedCostCents,
			finalCostCents: null,
			expectedBackAt: input.expectedBackAt,
			status: "IN_REPAIR",
			openedAt: now.toISOString(),
			completedAt: null,
		};
		db.maintenance.push(order);
		return orderView(db, order);
	}),

	complete: api.maintenance.complete.handler(({ context, input }) => {
		const user = requirePermission(context, "maintenance:write");
		const db = getDb();
		const now = mockNow();
		const at = now.toISOString();
		const order = db.maintenance.find((entry) => entry.number === input.number);
		if (!order) throw notFound("maintenance", input.number);

		const unit = requireUnit(db, order.unitCode);
		moveUnit(unit, input.unitStatusAfter);
		if (input.unitStatusAfter === "AVAILABLE") unit.returnedAt = null;

		const difference = input.finalCostCents - postedFor(db, order.number);
		if (difference > 0) {
			postLedger(db, {
				account: "CASH",
				direction: "OUT",
				category: "MAINTENANCE",
				amountCents: difference,
				occurredAt: at,
				method: input.method,
				description: `${order.reason} · ${order.number}`,
				rentalNumber: null,
				unitCode: unit.code,
				receiptFileKey: null,
				recordedBy: user.name,
				maintenanceNumber: order.number,
			});
		}

		order.finalCostCents = input.finalCostCents;
		order.status = "DONE";
		order.completedAt = at;

		if (input.unitStatusAfter === "IN_MAINTENANCE") {
			db.maintenance.push({
				...order,
				id: nextId(db, "os"),
				number: nextCode(
					"OS",
					db.maintenance.map((entry) => entry.number),
				),
				finalCostCents: null,
				status: "IN_REPAIR",
				openedAt: at,
				completedAt: null,
			});
		}
		return orderView(db, order);
	}),
};
