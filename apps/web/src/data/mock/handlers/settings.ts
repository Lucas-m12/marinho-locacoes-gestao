import type { Settings } from "@marinho-gestao/contract";
import { api, requirePermission, requireUser } from "../base";
import { getDb, type MockDb } from "../db";
import { notFound } from "../errors";
import { requireType } from "../queries";

const DAILIES_RULE =
	"Conta os dias de calendário entre a saída e a devolução, incluindo os dois. Sábado 08:00 a terça 17:00 são 4 diárias.";
const LATE_FEE_RULE =
	"Dias depois do combinado × soma das diárias da locação. O valor é sugerido e pode ser editado na volta.";

function settingsView(db: MockDb): Settings {
	return {
		types: db.types.map((type) => ({
			typeId: type.id,
			name: type.name,
			codes: db.units
				.filter((unit) => unit.typeId === type.id)
				.map((unit) => unit.code),
			dailyPriceCents: type.dailyPriceCents,
			depositCents: type.depositCents,
			turnaroundHours: type.turnaroundHours,
		})),
		lots: db.lots.map((lot) => ({
			lotId: lot.id,
			name: lot.name,
			perPiece: lot.pricing === "PER_PIECE",
			dailyPriceCents: lot.dailyPriceCents,
			depositCents: lot.depositCents,
			turnaroundHours: lot.turnaroundHours,
		})),
		deliveryFees: db.settings.deliveryFees,
		signal: db.settings.signal,
		signalDeadlineHours: db.settings.signalDeadlineHours,
		dailiesRuleDescription: DAILIES_RULE,
		lateFeeRuleDescription: LATE_FEE_RULE,
	};
}

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
