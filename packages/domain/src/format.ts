import {
	BUSINESS_TIME_ZONE,
	calendarDay,
	type DateInput,
	zonedLocalInputValue,
} from "./dates";

const WEEKDAY_ABBREVIATIONS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function formatDate(
	value: DateInput,
	timeZone: string = BUSINESS_TIME_ZONE,
): string {
	const [, month, day] = calendarDay(value, timeZone).split("-");
	return `${day}/${month}`;
}

export function formatTime(
	value: DateInput,
	timeZone: string = BUSINESS_TIME_ZONE,
): string {
	return zonedLocalInputValue(value, timeZone).slice(11);
}

export function weekdayAbbreviation(
	value: DateInput,
	timeZone: string = BUSINESS_TIME_ZONE,
): string {
	const day = calendarDay(value, timeZone);
	const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
	return WEEKDAY_ABBREVIATIONS[weekday] ?? "";
}

export function formatWeekdayDateTime(
	value: DateInput,
	timeZone: string = BUSINESS_TIME_ZONE,
): string {
	return `${weekdayAbbreviation(value, timeZone)}, ${formatDate(value, timeZone)} · ${formatTime(value, timeZone)}`;
}

export function dailiesLabel(dailies: number): string {
	return dailies === 1 ? "1 diária" : `${dailies} diárias`;
}
