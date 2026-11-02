import type { Settings } from "@marinho-gestao/contract";
import type { Snapshot } from "./records";

const DAILIES_RULE =
	"Conta os dias de calendário entre a saída e a devolução, incluindo os dois. Sábado 08:00 a terça 17:00 são 4 diárias.";
const LATE_FEE_RULE =
	"Dias depois do combinado × soma das diárias da locação. O valor é sugerido e pode ser editado na volta.";

export function settingsView(db: Snapshot): Settings {
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
