import { describe, expect, it } from "vitest";
import { countDailies } from "./dailies";

const tz = "America/Maceio";

describe("countDailies", () => {
	it("sábado 08:00 → terça 17:00 = 4 diárias", () => {
		expect(
			countDailies("2026-11-07T11:00:00Z", "2026-11-10T20:00:00Z", tz),
		).toBe(4);
	});

	it("mesmo dia conta uma diária", () => {
		expect(
			countDailies("2026-11-07T11:00:00Z", "2026-11-07T20:00:00Z", tz),
		).toBe(1);
	});

	it("usa o dia do fuso de negócio", () => {
		expect(
			countDailies("2026-11-08T02:00:00Z", "2026-11-08T04:00:00Z", tz),
		).toBe(2);
	});

	it("devolução antes da saída não gera diária", () => {
		expect(
			countDailies("2026-11-08T11:00:00Z", "2026-11-07T11:00:00Z", tz),
		).toBe(0);
	});
});
