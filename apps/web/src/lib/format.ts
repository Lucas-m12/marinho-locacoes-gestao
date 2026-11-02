import { TZDate } from "@date-fns/tz";
import {
	BUSINESS_TIME_ZONE,
	calendarDay,
	calendarDaysBetween,
	type DateInput,
	formatBRLShort,
	formatDate,
	formatTime,
	weekdayAbbreviation,
} from "@marinho-gestao/domain";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function zoned(value: DateInput): TZDate {
	return new TZDate(new Date(value).getTime(), BUSINESS_TIME_ZONE);
}

function capitalize(text: string): string {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatZoned(value: DateInput, pattern: string): string {
	return format(zoned(value), pattern, { locale: ptBR });
}

export {
	dailiesLabel,
	formatDate,
	formatTime,
	formatWeekdayDateTime,
} from "@marinho-gestao/domain";

export function formatFullDate(value: DateInput): string {
	return formatZoned(value, "dd/MM/yyyy");
}

export function formatDateAndTime(value: DateInput): string {
	return `${formatDate(value)} · ${formatTime(value)}`;
}

export function formatWeekdayFullDateTime(value: DateInput): string {
	return `${weekdayAbbreviation(value)}, ${formatFullDate(value)} · ${formatTime(value)}`;
}

export function formatLongDay(value: DateInput): string {
	const weekday = formatZoned(value, "EEEE").replace("-feira", "");
	return `${capitalize(weekday)}, ${formatZoned(value, "d 'de' MMMM")}`;
}

export function formatWeekdayName(value: DateInput): string {
	return formatZoned(value, "EEEE").replace("-feira", "");
}

export function formatMonthYear(month: string): string {
	return capitalize(
		formatZoned(`${month}-15T12:00:00-03:00`, "MMMM 'de' yyyy"),
	);
}

export function formatMonthName(value: DateInput): string {
	return formatZoned(value, "MMMM");
}

export function formatWeekdayShort(day: string): string {
	return weekdayAbbreviation(`${day}T12:00:00-03:00`);
}

export function formatDayOfMonth(day: string): string {
	return formatZoned(`${day}T12:00:00-03:00`, "dd");
}

export function formatPeriod(start: DateInput, end: DateInput): string {
	const from = formatDate(start);
	const to = formatDate(end);
	return from === to ? from : `${from} a ${to}`;
}

export function isSameBusinessDay(a: DateInput, b: DateInput): boolean {
	return calendarDay(a) === calendarDay(b);
}

export function relativeDay(value: DateInput, now: DateInput): string {
	const difference = calendarDaysBetween(now, value);
	if (difference === 0) return "hoje";
	if (difference === 1) return "amanhã";
	if (difference === -1) return "ontem";
	return formatDate(value);
}

export function greeting(now: DateInput): string {
	const hour = Number(formatZoned(now, "H"));
	if (hour < 12) return "Bom dia";
	if (hour < 18) return "Boa tarde";
	return "Boa noite";
}

export function money(cents: number): string {
	return formatBRLShort(cents);
}

export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part.charAt(0).toUpperCase())
		.join("");
}

export function hoursRemaining(until: DateInput, now: DateInput): number {
	const ms = new Date(until).getTime() - new Date(now).getTime();
	return Math.max(0, Math.ceil(ms / 3_600_000));
}
