export const BUSINESS_TIME_ZONE = "America/Maceio";

export type DateInput = string | Date;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export function toMs(value: DateInput): number {
	return typeof value === "string" ? Date.parse(value) : value.getTime();
}

export function addHours(value: DateInput, hours: number): Date {
	return new Date(toMs(value) + hours * MS_PER_HOUR);
}

export function calendarDay(
	value: DateInput,
	timeZone: string = BUSINESS_TIME_ZONE,
): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date(toMs(value)));
}

function dayNumber(day: string): number {
	return Date.parse(`${day}T00:00:00Z`) / MS_PER_DAY;
}

export function calendarDaysBetween(
	from: DateInput,
	to: DateInput,
	timeZone: string = BUSINESS_TIME_ZONE,
): number {
	return (
		dayNumber(calendarDay(to, timeZone)) -
		dayNumber(calendarDay(from, timeZone))
	);
}

export function addCalendarDays(day: string, days: number): string {
	const date = new Date(Date.parse(`${day}T00:00:00Z`) + days * MS_PER_DAY);
	return date.toISOString().slice(0, 10);
}

function zoneOffsetMs(instant: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).formatToParts(new Date(instant));
	const get = (type: string) =>
		Number(parts.find((part) => part.type === type)?.value);
	const asUtc = Date.UTC(
		get("year"),
		get("month") - 1,
		get("day"),
		get("hour"),
		get("minute"),
		get("second"),
	);
	return asUtc - Math.floor(instant / 1000) * 1000;
}

export function zonedTimeToIso(
	day: string,
	time: string,
	timeZone: string = BUSINESS_TIME_ZONE,
): string {
	const wall = Date.parse(`${day}T${time}:00Z`);
	const offset = zoneOffsetMs(wall, timeZone);
	return new Date(wall - offset).toISOString();
}

export function zonedLocalInputValue(
	value: DateInput,
	timeZone: string = BUSINESS_TIME_ZONE,
): string {
	const time = new Intl.DateTimeFormat("en-GB", {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(new Date(toMs(value)));
	return `${calendarDay(value, timeZone)}T${time}`;
}

export function startOfZonedDay(
	value: DateInput,
	timeZone: string = BUSINESS_TIME_ZONE,
): string {
	return zonedTimeToIso(calendarDay(value, timeZone), "00:00", timeZone);
}

export function endOfZonedDay(
	value: DateInput,
	timeZone: string = BUSINESS_TIME_ZONE,
): string {
	const nextDay = addCalendarDays(calendarDay(value, timeZone), 1);
	return zonedTimeToIso(nextDay, "00:00", timeZone);
}
