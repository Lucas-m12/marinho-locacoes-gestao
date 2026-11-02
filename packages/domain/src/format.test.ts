import { describe, expect, it } from "vitest";
import {
	dailiesLabel,
	formatDate,
	formatTime,
	formatWeekdayDateTime,
} from "./format";

describe("formatação no fuso de Maceió", () => {
	it("mostra dia, mês e hora locais", () => {
		const at = "2026-11-02T13:30:00.000Z";
		expect(formatDate(at)).toBe("02/11");
		expect(formatTime(at)).toBe("10:30");
		expect(formatWeekdayDateTime(at)).toBe("Seg, 02/11 · 10:30");
	});

	it("vira o dia pelo fuso e não pelo UTC", () => {
		expect(formatWeekdayDateTime("2026-11-08T02:00:00.000Z")).toBe(
			"Sáb, 07/11 · 23:00",
		);
	});

	it("escreve diárias no singular e no plural", () => {
		expect(dailiesLabel(1)).toBe("1 diária");
		expect(dailiesLabel(4)).toBe("4 diárias");
	});
});
