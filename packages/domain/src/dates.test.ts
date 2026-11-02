import { describe, expect, it } from "vitest";
import {
	addCalendarDays,
	addHours,
	calendarDay,
	calendarDaysBetween,
	endOfZonedDay,
	startOfZonedDay,
	zonedLocalInputValue,
	zonedTimeToIso,
} from "./dates";

describe("calendarDay", () => {
	it("usa o dia no fuso de negócio, não o UTC", () => {
		expect(calendarDay("2026-11-08T01:00:00Z")).toBe("2026-11-07");
		expect(calendarDay("2026-11-08T03:00:00Z")).toBe("2026-11-08");
	});
});

describe("calendarDaysBetween", () => {
	it("conta a diferença de dias de calendário", () => {
		expect(
			calendarDaysBetween("2026-11-07T11:00:00Z", "2026-11-10T20:00:00Z"),
		).toBe(3);
	});
});

describe("zonedTimeToIso", () => {
	it("converte hora de Maceió para UTC", () => {
		expect(zonedTimeToIso("2026-11-07", "08:00")).toBe(
			"2026-11-07T11:00:00.000Z",
		);
	});

	it("respeita outro fuso", () => {
		expect(zonedTimeToIso("2026-07-01", "12:00", "America/New_York")).toBe(
			"2026-07-01T16:00:00.000Z",
		);
	});
});

describe("zonedLocalInputValue", () => {
	it("gera o valor do campo datetime-local", () => {
		expect(zonedLocalInputValue("2026-11-07T11:00:00Z")).toBe(
			"2026-11-07T08:00",
		);
	});
});

describe("limites do dia", () => {
	it("calcula início e fim no fuso de negócio", () => {
		expect(startOfZonedDay("2026-11-07T11:00:00Z")).toBe(
			"2026-11-07T03:00:00.000Z",
		);
		expect(endOfZonedDay("2026-11-07T11:00:00Z")).toBe(
			"2026-11-08T03:00:00.000Z",
		);
	});
});

describe("aritmética", () => {
	it("soma horas e dias", () => {
		expect(addHours("2026-11-07T11:00:00Z", 12).toISOString()).toBe(
			"2026-11-07T23:00:00.000Z",
		);
		expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
		expect(addCalendarDays("2026-11-02", -3)).toBe("2026-10-30");
	});
});
