import { describe, expect, it } from "vitest";
import {
	availableLotQuantity,
	blockingBooking,
	findBookingConflicts,
	freeFrom,
	freeUntil,
	isBookable,
	isUnitAvailable,
	nextBooking,
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

	it("ordena pelo início, não pela ordem da lista", () => {
		const later = { start: at(9), end: at(10), id: "depois" };
		const earlier = { start: at(6), end: at(8), id: "antes" };
		expect(
			findBookingConflicts({
				start: at(7),
				end: at(9, 12),
				bookings: [later, earlier],
				turnaroundHours: 0,
			}).map((booking) => booking.id),
		).toEqual(["antes", "depois"]);
	});
});

const iso = (value: string) => new Date(value).toISOString();
const isoOf = (value: Date | null) => value?.toISOString() ?? null;

describe("janelas da unidade (folga de 12 h, LOC-A de dom 29/11 08:00 a ter 01/12 08:00)", () => {
	const locA = {
		id: "LOC-A",
		start: "2026-11-29T08:00:00-03:00",
		end: "2026-12-01T08:00:00-03:00",
	};
	const request = (start: string, end: string, bookings = [locA]) => ({
		start,
		end,
		bookings,
		turnaroundHours: 12,
	});
	const unit = { status: "AVAILABLE" as const };

	it("sex 27/11 08:00 a seg 30/11 08:00: indisponível, livre até sáb 20:00 e a partir de ter 20:00", () => {
		const asked = request(
			"2026-11-27T08:00:00-03:00",
			"2026-11-30T08:00:00-03:00",
		);
		expect(isUnitAvailable({ ...asked, unit, maintenance: null })).toBe(false);
		expect(blockingBooking(asked)).toBe(locA);
		expect(isoOf(freeUntil(asked))).toBe(iso("2026-11-28T20:00:00-03:00"));
		expect(isoOf(freeFrom(asked))).toBe(iso("2026-12-01T20:00:00-03:00"));
		expect(nextBooking(asked.bookings, asked.start)).toBe(locA);
	});

	it("sex 27/11 08:00 a sáb 28/11 08:00: disponível, livre até sáb 20:00 e a próxima é a LOC-A", () => {
		const asked = request(
			"2026-11-27T08:00:00-03:00",
			"2026-11-28T08:00:00-03:00",
		);
		expect(isUnitAvailable({ ...asked, unit, maintenance: null })).toBe(true);
		expect(blockingBooking(asked)).toBeNull();
		expect(freeFrom(asked)).toBeNull();
		expect(isoOf(freeUntil(asked))).toBe(iso("2026-11-28T20:00:00-03:00"));
		expect(nextBooking(asked.bookings, asked.start)).toBe(locA);
	});

	it("sem locação depois do pedido: freeUntil e nextBooking nulos", () => {
		const asked = request(
			"2026-12-02T08:00:00-03:00",
			"2026-12-04T08:00:00-03:00",
		);
		expect(freeUntil(asked)).toBeNull();
		expect(nextBooking(asked.bookings, asked.start)).toBeNull();
		expect(freeUntil({ ...asked, bookings: [] })).toBeNull();
	});

	it("saída dentro da folga antes da próxima: não dá para sair", () => {
		const asked = request(
			"2026-11-28T21:00:00-03:00",
			"2026-11-28T23:00:00-03:00",
		);
		expect(freeUntil(asked)).toBeNull();
		expect(blockingBooking(asked)).toBe(locA);
	});

	it("saída durante a locação: não dá para sair", () => {
		expect(
			freeUntil(
				request("2026-11-30T08:00:00-03:00", "2026-12-05T08:00:00-03:00"),
			),
		).toBeNull();
	});

	it("a que atrapalha é a que começa antes, não a primeira da lista", () => {
		const later = {
			id: "LOC-B",
			start: "2026-12-03T08:00:00-03:00",
			end: "2026-12-04T08:00:00-03:00",
		};
		const asked = request(
			"2026-11-27T08:00:00-03:00",
			"2026-12-05T08:00:00-03:00",
			[later, locA],
		);
		expect(blockingBooking(asked)).toBe(locA);
		expect(nextBooking(asked.bookings, asked.start)).toBe(locA);
	});

	it("pula locações encadeadas, inclusive a que começa dentro da folga", () => {
		const chained = {
			id: "LOC-B",
			start: "2026-12-02T02:00:00-03:00",
			end: "2026-12-03T08:00:00-03:00",
		};
		const asked = request(
			"2026-11-27T08:00:00-03:00",
			"2026-11-30T08:00:00-03:00",
			[locA, chained],
		);
		expect(isoOf(freeFrom(asked))).toBe(iso("2026-12-03T20:00:00-03:00"));
		const gap = { ...chained, start: "2026-12-02T09:00:00-03:00" };
		expect(isoOf(freeFrom({ ...asked, bookings: [locA, gap] }))).toBe(
			iso("2026-12-01T20:00:00-03:00"),
		);
	});

	it("locação atrasada que atrapalha: sem freeFrom", () => {
		const now = "2026-11-27T10:00:00-03:00";
		const overdue = {
			id: "LOC-ATRASADA",
			start: "2026-11-20T08:00:00-03:00",
			end: now,
			overdue: true,
		};
		const asked = request(
			"2026-11-27T12:00:00-03:00",
			"2026-11-28T12:00:00-03:00",
			[overdue],
		);
		expect(blockingBooking(asked)).toBe(overdue);
		expect(freeFrom(asked)).toBeNull();
		expect(freeUntil(asked)).toBeNull();
	});

	it("locação atrasada que já não segura a saída não atrapalha a conta", () => {
		const now = "2026-11-25T10:00:00-03:00";
		const overdue = {
			id: "LOC-ATRASADA",
			start: "2026-11-20T08:00:00-03:00",
			end: now,
			overdue: true,
		};
		const asked = request(
			"2026-11-27T08:00:00-03:00",
			"2026-11-30T08:00:00-03:00",
			[overdue, locA],
		);
		expect(isoOf(freeFrom(asked))).toBe(iso("2026-12-01T20:00:00-03:00"));
	});
});

describe("janelas do lote", () => {
	// 20 peças: A segura 8 do dia 1 ao 15; B segura 12 do dia 5 ao 8.
	const holdA = { id: "A", start: at(1), end: at(15, 17), quantity: 8 };
	const holdB = { id: "B", start: at(5), end: at(8, 17), quantity: 12 };
	const scaffold = (quantity: number, start: string, end: string) => ({
		start,
		end,
		bookings: [holdA, holdB],
		turnaroundHours: 12,
		usable: 20,
		quantity,
	});
	const plus12 = (value: string) =>
		new Date(Date.parse(value) + 12 * 3_600_000).toISOString();

	it("cabe a quantidade pedida: livre até a saída de B menos a folga", () => {
		const asked = scaffold(12, at(2), at(3));
		expect(
			availableLotQuantity({
				...asked,
				total: 20,
				inMaintenance: 0,
				retired: 0,
			}),
		).toBe(12);
		expect(blockingBooking(asked)).toBeNull();
		expect(freeFrom(asked)).toBeNull();
		expect(isoOf(freeUntil(asked))).toBe(
			new Date(Date.parse(at(5)) - 12 * 3_600_000).toISOString(),
		);
		expect(nextBooking(asked.bookings, asked.start)).toBe(holdB);
	});

	it("uma peça a mais: A faz faltar já na saída e só a volta de A libera", () => {
		const asked = scaffold(13, at(2), at(3));
		expect(blockingBooking(asked)).toBe(holdA);
		expect(freeUntil(asked)).toBeNull();
		expect(isoOf(freeFrom(asked))).toBe(plus12(at(15, 17)));
	});

	it("as duas cruzam: atrapalha a que começa antes, e a volta de B já basta", () => {
		const asked = scaffold(1, at(6), at(7));
		expect(blockingBooking(asked)).toBe(holdA);
		expect(isoOf(freeFrom(asked))).toBe(plus12(at(8, 17)));
	});

	it("reserva que não cruza o período não é a culpada", () => {
		const elsewhere = { id: "C", start: at(20), end: at(21), quantity: 20 };
		const asked = {
			...scaffold(1, at(6), at(7)),
			bookings: [elsewhere, holdB, holdA],
		};
		expect(blockingBooking(asked)).toBe(holdA);
	});

	it("pedido maior que o estoque: ninguém atrapalha e não há data", () => {
		const asked = scaffold(21, at(2), at(3));
		expect(blockingBooking(asked)).toBeNull();
		expect(freeFrom(asked)).toBeNull();
		expect(freeUntil(asked)).toBeNull();
	});

	it("atrasada segurando peças: só conta a volta das outras", () => {
		const overdue = {
			id: "ATRASADA",
			start: at(1),
			end: at(2),
			quantity: 8,
			overdue: true,
		};
		const rest = { id: "D", start: at(1), end: at(4), quantity: 12 };
		const asked = (quantity: number) => ({
			start: at(2, 10),
			end: at(3),
			bookings: [overdue, rest],
			turnaroundHours: 12,
			usable: 20,
			quantity,
		});
		expect(isoOf(freeFrom(asked(5)))).toBe(plus12(at(4)));
		expect(freeFrom(asked(13))).toBeNull();
	});

	it("carrocinha (uma peça) dá o mesmo que uma unidade", () => {
		const locA = { start: at(29), end: at(31) };
		const unit = {
			start: at(27),
			end: at(30),
			bookings: [locA],
			turnaroundHours: 12,
		};
		const trailer = { ...unit, usable: 1, quantity: 1 };
		expect(blockingBooking(trailer)).toBe(blockingBooking(unit));
		expect(isoOf(freeUntil(trailer))).toBe(isoOf(freeUntil(unit)));
		expect(isoOf(freeFrom(trailer))).toBe(isoOf(freeFrom(unit)));
		expect(isoOf(freeFrom(unit))).toBe(plus12(at(31)));
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
