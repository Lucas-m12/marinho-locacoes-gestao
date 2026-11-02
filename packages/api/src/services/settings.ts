import type { Settings, UpdateSettingsInput } from "@marinho-gestao/contract";
import type { DbClient } from "@marinho-gestao/db";
import { settingsView } from "@marinho-gestao/read-model";
import type { z } from "zod";
import { notFound } from "../errors";
import { inTransaction, type ServiceDeps } from "./deps";
import { recordEvent } from "./events";
import { requireUuid } from "./lookups";
import { loadSnapshot } from "./snapshot";

function defined<T extends object>(value: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	) as Partial<T>;
}

async function viewOf(db: DbClient): Promise<Settings> {
	return settingsView(await loadSnapshot(db));
}

export async function getSettings(deps: ServiceDeps): Promise<Settings> {
	return viewOf(deps.db);
}

export async function updateSettings(
	deps: ServiceDeps,
	input: z.output<typeof UpdateSettingsInput>,
): Promise<Settings> {
	return inTransaction(deps.db, async (tx) => {
		for (const { typeId, ...changes } of input.types ?? []) {
			requireUuid("type", typeId);
			const updated = await tx.equipmentType.updateMany({
				where: { id: typeId },
				data: defined(changes),
			});
			if (updated.count === 0) throw notFound("type", typeId);
		}
		for (const { lotId, ...changes } of input.lots ?? []) {
			requireUuid("lot", lotId);
			const updated = await tx.lot.updateMany({
				where: { id: lotId },
				data: defined(changes),
			});
			if (updated.count === 0) throw notFound("lot", lotId);
		}
		if (input.deliveryFees) {
			await tx.deliveryFee.deleteMany({});
			await tx.deliveryFee.createMany({
				data: input.deliveryFees.map((fee, position) => ({
					city: fee.city,
					feeCents: fee.feeCents,
					position,
				})),
			});
		}
		const settings = defined({
			signalMode: input.signal?.mode,
			signalValueCents: input.signal?.valueCents,
			signalPercent: input.signal?.percent,
			signalDeadlineHours: input.signalDeadlineHours,
		});
		if (Object.keys(settings).length > 0) {
			await tx.settings.update({ where: { id: 1 }, data: settings });
		}
		await recordEvent(tx, {
			actor: deps.actor,
			action: "settings.updated",
			entity: "Settings",
			entityId: "1",
			at: deps.clock(),
			payload: input,
		});
		return viewOf(tx);
	});
}
