import { nextCode } from "@marinho-gestao/domain";
import {
	LEDGER_DESCRIPTIONS,
	listMaintenance,
	moveUnit,
	notFound,
	orderView,
	postedFor,
	requireUnit,
} from "@marinho-gestao/read-model";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import { getDb, type MaintenanceRecord, nextId } from "../db";
import { postLedger } from "../flows";
import { closeOpenOrders } from "./equipment";

export const maintenance = {
	list: api.maintenance.list.handler(({ context }) => {
		requirePermission(context, "maintenance:read");
		return listMaintenance(getDb(), mockNow());
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
		const at = mockNow().toISOString();
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
				description: LEDGER_DESCRIPTIONS.maintenance(
					order.reason,
					order.number,
				),
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
