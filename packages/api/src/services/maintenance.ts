import type {
	CompleteMaintenanceInput,
	MaintenanceOrder,
	OpenMaintenanceInput,
} from "@marinho-gestao/contract";
import type { DbClient, Transaction } from "@marinho-gestao/db";
import { addHours, signedAmountCents } from "@marinho-gestao/domain";
import {
	LEDGER_DESCRIPTIONS,
	listMaintenance as listMaintenanceView,
	orderView,
} from "@marinho-gestao/read-model";
import type { z } from "zod";
import { notFound } from "../errors";
import { nextCodeFromCounter } from "./counters";
import { inTransaction, type ServiceDeps } from "./deps";
import { closeOpenOrders, moveUnitStatus } from "./equipment";
import { recordEvent } from "./events";
import { lockUnit } from "./lookups";
import { loadSnapshot } from "./snapshot";

async function viewOf(db: DbClient, code: string): Promise<MaintenanceOrder> {
	const snapshot = await loadSnapshot(db, {
		maintenance: { code },
		ledger: { maintenanceOrder: { code } },
	});
	const order = snapshot.maintenance.find((entry) => entry.number === code);
	if (!order) throw notFound("maintenance", code);
	return orderView(snapshot, order);
}

export async function listMaintenance(deps: ServiceDeps) {
	const now = deps.clock();
	const snapshot = await loadSnapshot(deps.db, {
		maintenance: {},
		ledger: {
			OR: [
				{ maintenanceOrderId: { not: null } },
				{
					category: "MAINTENANCE",
					occurredAt: { gte: addHours(now, -24 * 30) },
				},
			],
		},
	});
	return listMaintenanceView(snapshot, now);
}

export async function openRepairOrder(
	tx: Transaction,
	data: {
		unitId: string;
		reason: string;
		location: "WORKSHOP" | "BASE";
		locationName: string | null;
		estimatedCostCents: number | null;
		expectedBackAt: Date | null;
		openedAt: Date;
	},
): Promise<{ id: string; code: string }> {
	const code = await nextCodeFromCounter(tx, "OS");
	return tx.maintenanceOrder.create({
		data: { ...data, code, status: "IN_REPAIR" },
		select: { id: true, code: true },
	});
}

export async function openMaintenance(
	deps: ServiceDeps,
	input: z.output<typeof OpenMaintenanceInput>,
): Promise<MaintenanceOrder> {
	const now = deps.clock();
	return inTransaction(deps.db, async (tx) => {
		const unitId = await lockUnit(tx, input.unitCode);
		await moveUnitStatus(tx, unitId, "IN_MAINTENANCE", input.reason);
		await closeOpenOrders(tx, unitId, now);
		const order = await openRepairOrder(tx, {
			unitId,
			reason: input.reason,
			location: input.location,
			locationName: input.locationName,
			estimatedCostCents: input.estimatedCostCents,
			expectedBackAt: input.expectedBackAt
				? new Date(input.expectedBackAt)
				: null,
			openedAt: now,
		});
		await recordEvent(tx, {
			actor: deps.actor,
			action: "maintenance.opened",
			entity: "MaintenanceOrder",
			entityId: order.id,
			at: now,
			payload: { code: order.code, unitCode: input.unitCode },
		});
		return viewOf(tx, order.code);
	});
}

export async function completeMaintenance(
	deps: ServiceDeps,
	input: z.output<typeof CompleteMaintenanceInput>,
): Promise<MaintenanceOrder> {
	const now = deps.clock();
	return inTransaction(deps.db, async (tx) => {
		const found = await tx.maintenanceOrder.findUnique({
			where: { code: input.number },
			include: { unit: { select: { code: true } } },
		});
		if (!found) throw notFound("maintenance", input.number);
		const unitId = await lockUnit(tx, found.unit.code);
		const order = await tx.maintenanceOrder.findUniqueOrThrow({
			where: { id: found.id },
			include: { ledgerEntries: true },
		});
		await moveUnitStatus(tx, unitId, input.unitStatusAfter);
		if (input.unitStatusAfter === "AVAILABLE") {
			await tx.unit.update({
				where: { id: unitId },
				data: { returnedAt: null },
			});
		}

		const posted = order.ledgerEntries.reduce(
			(total, entry) => total + signedAmountCents(entry),
			0,
		);
		const difference = input.finalCostCents - posted;
		if (difference > 0) {
			await tx.ledgerEntry.create({
				data: {
					account: "CASH",
					direction: "OUT",
					category: "MAINTENANCE",
					amountCents: difference,
					occurredAt: now,
					method: input.method,
					description: LEDGER_DESCRIPTIONS.maintenance(
						order.reason,
						order.code,
					),
					unitId,
					maintenanceOrderId: order.id,
					recordedById: deps.actor.id,
					recordedByName: deps.actor.name,
					createdAt: now,
				},
			});
		}
		await tx.maintenanceOrder.update({
			where: { id: order.id },
			data: {
				finalCostCents: input.finalCostCents,
				status: "DONE",
				completedAt: now,
			},
		});
		if (input.unitStatusAfter === "IN_MAINTENANCE") {
			await openRepairOrder(tx, {
				unitId,
				reason: order.reason,
				location: order.location,
				locationName: order.locationName,
				estimatedCostCents: order.estimatedCostCents,
				expectedBackAt: order.expectedBackAt,
				openedAt: now,
			});
		}
		await recordEvent(tx, {
			actor: deps.actor,
			action: "maintenance.completed",
			entity: "MaintenanceOrder",
			entityId: order.id,
			at: now,
			payload: {
				finalCostCents: input.finalCostCents,
				postedCents: Math.max(0, difference),
				unitStatusAfter: input.unitStatusAfter,
			},
		});
		return viewOf(tx, order.code);
	});
}
