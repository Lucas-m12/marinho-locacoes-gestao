import { describe, expect, it } from "vitest";
import { countDailies } from "./dailies";

// Horários em UTC; Maceió é UTC-3 (11:00Z = 08:00 local).
describe("countDailies", () => {
	it("24 horas são 1 diária", () => {
		expect(countDailies("2026-11-09T11:00:00Z", "2026-11-10T11:00:00Z")).toBe(
			1,
		);
	});

	it("dentro da tolerância de 2 horas continua 1 diária", () => {
		expect(countDailies("2026-11-09T11:00:00Z", "2026-11-10T13:00:00Z")).toBe(
			1,
		);
	});

	it("passou da tolerância abre outra diária", () => {
		expect(countDailies("2026-11-09T11:00:00Z", "2026-11-10T13:01:00Z")).toBe(
			2,
		);
	});

	it("mesmo dia conta uma diária", () => {
		expect(countDailies("2026-11-07T11:00:00Z", "2026-11-07T20:00:00Z")).toBe(
			1,
		);
	});

	it("sábado 08:00 → terça 17:00 = 4 diárias", () => {
		expect(countDailies("2026-11-07T11:00:00Z", "2026-11-10T20:00:00Z")).toBe(
			4,
		);
	});

	it("tarde de um dia até a manhã seguinte é 1 diária", () => {
		expect(countDailies("2026-11-09T19:00:00Z", "2026-11-10T12:00:00Z")).toBe(
			1,
		);
	});

	it("devolução antes da saída não gera diária", () => {
		expect(countDailies("2026-11-08T11:00:00Z", "2026-11-07T11:00:00Z")).toBe(
			0,
		);
	});
});
