import { type DateInput, toMs } from "./dates";

/** Uma diária cobre 24 horas, contadas a partir da saída (entrega). */
export const DAILY_HOURS = 24;
/** Tolerância na devolução: até 2 horas depois de fechar uma diária não abre outra. */
export const RETURN_GRACE_HOURS = 2;

const MS_PER_HOUR = 3_600_000;

/**
 * Regra decidida em 20/11/2026: cada diária vale 24 horas a partir da saída,
 * com 2 horas de tolerância na devolução. Segunda 08:00 → terça 10:00 é
 * 1 diária; terça 10:01 já são 2. Período curto (mesmo dia) conta 1 diária.
 * Toda a contagem do sistema passa por aqui: mudar a regra é mudar esta função.
 */
export function countDailies(start: DateInput, end: DateInput): number {
	const elapsed = toMs(end) - toMs(start);
	if (elapsed < 0) return 0;
	const billable = elapsed - RETURN_GRACE_HOURS * MS_PER_HOUR;
	return Math.max(1, Math.ceil(billable / (DAILY_HOURS * MS_PER_HOUR)));
}
