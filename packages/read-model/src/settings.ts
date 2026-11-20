import type { Settings } from "@marinho-gestao/contract";
import type { Snapshot } from "./records";

const DAILIES_RULE =
	"Cada diária vale 24 horas a partir da saída, com 2 horas de tolerância na devolução. Segunda 08:00 a terça 10:00 é 1 diária; terça 10:01 já são 2.";
const LATE_FEE_RULE =
	"Passou da tolerância de 2 horas, cobra mais uma diária cheia (a soma das diárias da locação) a cada 24 horas, sem multa. O valor é sugerido e pode ser editado na volta.";

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
