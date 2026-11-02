import { describe, expect, it } from "vitest";
import {
	holdsBooking,
	isQuoteExpired,
	isRentalOverdue,
	rentalDisplayStatus,
	rentalStatusMachine,
} from "./rental-status";

describe("rentalStatusMachine", () => {
	it("segue o caminho feliz", () => {
		const path = [
			"QUOTE",
			"AWAITING_DEPOSIT",
			"CONFIRMED",
			"SEPARATED",
			"ON_SITE",
			"RETURNED",
			"CLOSED",
		] as const;
		path.slice(0, -1).forEach((from, index) => {
			const to = path[index + 1];
			if (to) expect(rentalStatusMachine.canTransition(from, to)).toBe(true);
		});
	});

	it("não pula etapas", () => {
		expect(rentalStatusMachine.canTransition("QUOTE", "CONFIRMED")).toBe(false);
		expect(rentalStatusMachine.canTransition("CONFIRMED", "ON_SITE")).toBe(
			false,
		);
		expect(rentalStatusMachine.canTransition("ON_SITE", "CLOSED")).toBe(false);
	});

	it("só expira quem aguarda sinal", () => {
		expect(
			rentalStatusMachine.canTransition("AWAITING_DEPOSIT", "EXPIRED"),
		).toBe(true);
		expect(rentalStatusMachine.canTransition("CONFIRMED", "EXPIRED")).toBe(
			false,
		);
	});

	it("não cancela depois que saiu", () => {
		expect(rentalStatusMachine.canTransition("ON_SITE", "CANCELED")).toBe(
			false,
		);
	});

	it("estados finais não saem do lugar", () => {
		expect(rentalStatusMachine.isFinal("CLOSED")).toBe(true);
		expect(rentalStatusMachine.isFinal("CANCELED")).toBe(true);
		expect(rentalStatusMachine.isFinal("EXPIRED")).toBe(true);
		expect(rentalStatusMachine.isFinal("ON_SITE")).toBe(false);
	});
});

describe("atraso derivado", () => {
	const now = "2026-11-02T13:00:00Z";

	it("na obra com devolução no passado está atrasada", () => {
		const rental = {
			status: "ON_SITE" as const,
			endAt: "2026-11-01T20:00:00Z",
		};
		expect(isRentalOverdue(rental, now)).toBe(true);
		expect(rentalDisplayStatus(rental, now)).toBe("OVERDUE");
	});

	it("na obra dentro do prazo não está atrasada", () => {
		const rental = {
			status: "ON_SITE" as const,
			endAt: "2026-11-03T20:00:00Z",
		};
		expect(rentalDisplayStatus(rental, now)).toBe("ON_SITE");
	});

	it("outros status nunca ficam atrasados", () => {
		const rental = {
			status: "CONFIRMED" as const,
			endAt: "2026-11-01T20:00:00Z",
		};
		expect(rentalDisplayStatus(rental, now)).toBe("CONFIRMED");
	});
});

describe("holdsBooking", () => {
	it("rascunho e encerradas não seguram a agenda", () => {
		expect(holdsBooking("QUOTE")).toBe(false);
		expect(holdsBooking("CLOSED")).toBe(false);
		expect(holdsBooking("CANCELED")).toBe(false);
		expect(holdsBooking("EXPIRED")).toBe(false);
		expect(holdsBooking("RETURNED")).toBe(false);
	});

	it("do envio do orçamento até a volta, segura", () => {
		expect(holdsBooking("AWAITING_DEPOSIT")).toBe(true);
		expect(holdsBooking("CONFIRMED")).toBe(true);
		expect(holdsBooking("SEPARATED")).toBe(true);
		expect(holdsBooking("ON_SITE")).toBe(true);
	});
});

describe("isQuoteExpired", () => {
	const quote = {
		status: "AWAITING_DEPOSIT" as const,
		signalDueAt: "2026-11-02T12:00:00.000Z",
		hasPaidSignal: false,
	};

	it("vence depois do prazo, sem sinal", () => {
		expect(isQuoteExpired(quote, "2026-11-02T12:00:00.001Z")).toBe(true);
		expect(isQuoteExpired(quote, "2026-11-02T12:00:00.000Z")).toBe(false);
	});

	it("não vence com sinal pago nem fora de aguardando sinal", () => {
		const late = "2026-11-03T00:00:00.000Z";
		expect(isQuoteExpired({ ...quote, hasPaidSignal: true }, late)).toBe(false);
		expect(isQuoteExpired({ ...quote, status: "CONFIRMED" }, late)).toBe(false);
	});
});
