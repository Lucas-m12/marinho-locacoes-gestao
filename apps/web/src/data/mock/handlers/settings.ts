import {
	notFound,
	requireType,
	settingsView,
} from "@marinho-gestao/read-model";
import { api, requirePermission, requireUser } from "../base";
import { getDb } from "../db";

function definedEntries<T extends object>(value: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined),
	) as Partial<T>;
}

export const settings = {
	get: api.settings.get.handler(({ context }) => {
		requireUser(context);
		return settingsView(getDb());
	}),

	update: api.settings.update.handler(({ context, input }) => {
		requirePermission(context, "settings:manage");
		const db = getDb();

		for (const { typeId, ...changes } of input.types ?? []) {
			Object.assign(requireType(db, typeId), definedEntries(changes));
		}
		for (const { lotId, ...changes } of input.lots ?? []) {
			const lot = db.lots.find((entry) => entry.id === lotId);
			if (!lot) throw notFound("lot", lotId);
			Object.assign(lot, definedEntries(changes));
		}
		if (input.deliveryFees) db.settings.deliveryFees = input.deliveryFees;
		if (input.signal) db.settings.signal = input.signal;
		if (input.signalDeadlineHours) {
			db.settings.signalDeadlineHours = input.signalDeadlineHours;
		}
		return settingsView(db);
	}),
};
