import { describe, expect, it } from "vitest";
import {
	availableLotQuantity,
	findBookingConflicts,
	firstFreeFrom,
	isBookable,
	isUnitAvailable,
	overlaps,
} from "./availability";

const at = (day: number, hour = 8) =>
	new Date(Date.UTC(2026, 10, day, hour + 3)).toISOString();

describe("overlaps", () => {
	it("detecta cruzamento", () => {
		expect(
			overlaps({ start: at(1), end: at(5) }, { start: at(4), end: at(8) }),
		).toBe(true);
	});

	it("intervalos encostados não cruzam", () => {
		expect(
			overlaps({ start: at(1), end: at(4) }, { start: at(4), end: at(8) }),
		).toBe(false);
	});

	it("um dentro do outro cruza", () => {
		expect(
			overlaps({ start: at(1), end: at(9) }, { start: at(4), end: at(5) }),
		).toBe(true);
	});
});

describe("isBookable", () => {
	it("só recusa os status fora da agenda", () => {
		expect(isBookable("AVAILABLE")).toBe(true);
		expect(isBookable("IN_INSPECTION")).toBe(true);
		expect(isBookable("BLOCKED")).toBe(false);
		expect(isBookable("DAMAGED")).toBe(false);
		expect(isBookable("NOT_RETURNED")).toBe(false);
		expect(isBookable("RETIRED")).toBe(false);
	});
});

describe("isUnitAvailable", () => {
	const base = {
		unit: { status: "AVAILABLE" as const },
		start: at(7),
		end: at(10, 17),
		bookings: [],
		maintenance: null,
		turnaroundHours: 12,
	};

	it("unidade sem reservas está livre", () => {
		expect(isUnitAvailable(base)).toBe(true);
	});

	it.each(["BLOCKED", "DAMAGED", "NOT_RETURNED", "RETIRED"] as const)(
		"%s nunca está livre",
		(status) => {
			expect(isUnitAvailable({ ...base, unit: { status } })).toBe(false);
		},
	);

	it("em manutenção só fica livre se a volta for antes da saída", () => {
		const unit = { status: "IN_MAINTENANCE" as const };
		expect(
			isUnitAvailable({
				...base,
				unit,
				maintenance: { expectedBackAt: at(5) },
			}),
		).toBe(true);
		expect(
			isUnitAvailable({
				...base,
				unit,
				maintenance: { expectedBackAt: at(8) },
			}),
		).toBe(false);
		expect(isUnitAvailable({ ...base, unit, maintenance: null })).toBe(false);
	});

	it("reserva no período ocupa a unidade", () => {
		expect(
			isUnitAvailable({
				...base,
				bookings: [{ start: at(8), end: at(9) }],
			}),
		).toBe(false);
	});

	it("a folga depois do fim conflita com a próxima reserva", () => {
		expect(
			isUnitAvailable({
				...base,
				bookings: [{ start: at(11, 2), end: at(13) }],
			}),
		).toBe(false);
		expect(
			isUnitAvailable({
				...base,
				bookings: [{ start: at(11, 8), end: at(13) }],
			}),
		).toBe(true);
	});

	it("a folga da reserva anterior também segura a saída", () => {
		expect(
			isUnitAvailable({
				...base,
				bookings: [{ start: at(1), end: at(6, 23) }],
			}),
		).toBe(false);
		expect(
			isUnitAvailable({
				...base,
				bookings: [{ start: at(1), end: at(6, 17) }],
			}),
		).toBe(true);
	});
});

describe("findBookingConflicts", () => {
	it("devolve só as reservas que cruzam", () => {
		const hit = { start: at(8), end: at(9), id: "a" };
		const miss = { start: at(20), end: at(22), id: "b" };
		expect(
			findBookingConflicts({
				start: at(7),
				end: at(10),
				bookings: [hit, miss],
				turnaroundHours: 0,
			}),
		).toEqual([hit]);
	});
});

describe("firstFreeFrom", () => {
	it("pula reservas em sequência somando a folga", () => {
		const free = firstFreeFrom({
			after: at(2),
			bookings: [
				{ start: at(1), end: at(3, 17) },
				{ start: at(3, 20), end: at(5, 17) },
			],
			turnaroundHours: 12,
		});
		expect(free.toISOString()).toBe(
			new Date(Date.parse(at(5, 17)) + 12 * 3_600_000).toISOString(),
		);
	});

	it("sem reservas devolve o próprio início", () => {
		expect(
			firstFreeFrom({
				after: at(2),
				bookings: [],
				turnaroundHours: 12,
			}).toISOString(),
		).toBe(new Date(at(2)).toISOString());
	});
});

describe("availableLotQuantity", () => {
	const base = {
		total: 20,
		inMaintenance: 0,
		retired: 0,
		start: at(7),
		end: at(10, 17),
	};

	it("desconta as reservas do período", () => {
		expect(
			availableLotQuantity({
				...base,
				bookings: [
					{ start: at(2), end: at(16), quantity: 8 },
					{ start: at(7), end: at(10), quantity: 12 },
				],
			}),
		).toBe(0);
	});

	it("reservas sem sobreposição entre si não somam", () => {
		expect(
			availableLotQuantity({
				...base,
				start: at(1),
				end: at(20),
				bookings: [
					{ start: at(2), end: at(4), quantity: 10 },
					{ start: at(6), end: at(8), quantity: 12 },
				],
			}),
		).toBe(8);
	});

	it("reserva encostada no fim da outra não soma", () => {
		expect(
			availableLotQuantity({
				...base,
				start: at(1),
				end: at(20),
				bookings: [
					{ start: at(2), end: at(4), quantity: 10 },
					{ start: at(4), end: at(8), quantity: 10 },
				],
			}),
		).toBe(10);
	});

	it("tira manutenção e aposentadas", () => {
		expect(
			availableLotQuantity({
				...base,
				inMaintenance: 2,
				retired: 3,
				bookings: [],
			}),
		).toBe(15);
	});

	it("nunca fica negativo", () => {
		expect(
			availableLotQuantity({
				...base,
				bookings: [{ start: at(7), end: at(9), quantity: 25 }],
			}),
		).toBe(0);
	});

	it("considera a folga quando informada", () => {
		const bookings = [{ start: at(1), end: at(6, 23), quantity: 8 }];
		expect(availableLotQuantity({ ...base, bookings })).toBe(20);
		expect(
			availableLotQuantity({ ...base, bookings, turnaroundHours: 12 }),
		).toBe(12);
	});
});
