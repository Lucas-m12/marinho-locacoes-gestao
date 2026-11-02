import {
	BUSINESS_TIME_ZONE,
	calendarDaysBetween,
	type DateInput,
	toMs,
} from "./dates";

/**
 * REGRA PROVISÓRIA: o negócio ainda vai definir como contar diárias.
 *
 * Hoje conta os dias de calendário entre a saída e a devolução, incluindo os
 * dois, no fuso informado. Sábado 08:00 → terça 17:00 = 4 diárias.
 * Toda a contagem do sistema passa por aqui: mudar a regra é mudar esta função.
 */
export function countDailies(
	start: DateInput,
	end: DateInput,
	timeZone: string = BUSINESS_TIME_ZONE,
): number {
	if (toMs(end) < toMs(start)) return 0;
	return calendarDaysBetween(start, end, timeZone) + 1;
}
