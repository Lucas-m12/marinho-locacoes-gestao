import {
	addCalendarDays,
	calendarDay,
	endOfZonedDay,
	zonedTimeToIso,
} from "@marinho-gestao/domain";

const WINDOW_DAYS = 30;

export function last30Days(now: Date): { from: string; to: string } {
	return {
		from: zonedTimeToIso(
			addCalendarDays(calendarDay(now), 1 - WINDOW_DAYS),
			"00:00",
		),
		to: endOfZonedDay(now),
	};
}
