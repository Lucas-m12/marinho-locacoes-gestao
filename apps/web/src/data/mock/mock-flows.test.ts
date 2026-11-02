import type { Session } from "@marinho-gestao/contract";
import type { Role } from "@marinho-gestao/domain";
import {
	addCalendarDays,
	calendarDay,
	zonedTimeToIso,
} from "@marinho-gestao/domain";
import { isDefinedError, ORPCError } from "@orpc/client";
import { createRouterClient } from "@orpc/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setMockLatency } from "./base";
import { resetMockClock, setMockClock } from "./clock";
import { getDb, resetDb } from "./db";
import { mockRouter } from "./router";

const NOW = new Date("2026-11-02T13:00:00.000Z");
const TODAY = calendarDay(NOW);
const day = (offset: number, time = "08:00") =>
	zonedTimeToIso(addCalendarDays(TODAY, offset), time);

function sessionOf(role: Role): Session {
	const user = getDb().users.find((entry) => entry.role === role);
	if (!user) throw new Error(`sem usuário ${role}`);
	return {
		user: { id: user.id, name: user.name, email: user.email, role },
		expiresAt: day(30),
	};
}

function clientAs(role: Role) {
	return createRouterClient(mockRouter, {
		context: { session: sessionOf(role) },
	});
}

async function errorOf(
	promise: Promise<unknown>,
): Promise<ORPCError<string, unknown>> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof ORPCError) return error;
		throw error;
	}
	throw new Error("deveria ter falhado");
}

const quote = {
	customerId: "c-maria",
	deliveryMode: "PICKUP" as const,
	siteAddress: null,
	siteCity: null,
	sitePinUrl: null,
	deliveryFeeCents: null,
	discountCents: 0,
	notes: null,
};

afterAll(resetMockClock);

beforeEach(() => {
	setMockLatency(false);
	setMockClock(() => NOW);
	resetDb();
});

describe("seed", () => {
	it("reproduz os números do painel", async () => {
		const client = clientAs("MANAGER");
		const summary = await client.dashboard.summary({
			from: day(-29, "00:00"),
			to: day(1, "00:00"),
		});
		expect(summary.inCents).toBe(234000);
		expect(summary.outCents).toBe(61000);
		expect(summary.resultCents).toBe(173000);
		expect(summary.depositHeldCents).toBe(90000);
		expect(summary.depositHeldRentalCount).toBe(4);
	});

	it("divide os lançamentos como no desenho", async () => {
		const totals = await clientAs("MANAGER").ledger.byCategory({
			from: day(-29, "00:00"),
			to: day(1, "00:00"),
		});
		const byName = (rows: typeof totals.in) =>
			Object.fromEntries(
				rows.map((row) => [row.category, row.amountCents / 100]),
			);
		expect(byName(totals.in)).toEqual({
			RENTAL: 2180,
			DELIVERY: 120,
			CONSUMABLE_SOLD: 40,
		});
		expect(byName(totals.out)).toEqual({
			CONSUMABLE_BOUGHT: 255,
			FUEL: 160,
			ADVERTISING: 150,
			MAINTENANCE: 45,
		});
	});

	it("reproduz os valores das locações do desenho", async () => {
		const client = clientAs("MANAGER");
		const { rentals, counts } = await client.rentals.list({ tab: "OPEN" });
		const totals = Object.fromEntries(
			rentals.map((rental) => [rental.number, rental.totalCents / 100]),
		);
		expect(totals).toEqual({
			"LOC-0026": 200,
			"LOC-0027": 320,
			"LOC-0028": 160,
			"LOC-0029": 700,
			"LOC-0030": 240,
			"LOC-0031": 80,
			"LOC-0032": 80,
			"LOC-0033": 296,
		});
		expect(counts.OPEN).toBe(8);
		expect(counts.LOST).toBe(3);
		expect(rentals[0]?.displayStatus).toBe("OVERDUE");
		expect(rentals[0]?.number).toBe("LOC-0028");
	});

	it("calcula a situação e os números dos clientes", async () => {
		const client = clientAs("MANAGER");
		const { customers, counts } = await client.customers.list({});
		const summary = Object.fromEntries(
			customers.map((customer) => [
				customer.name,
				[customer.tier, customer.stats.rentalCount],
			]),
		);
		expect(summary).toEqual({
			"José Carlos": ["TRUSTED", 3],
			"Antônio Ferreira": ["TRUSTED", 4],
			"Pedro Henrique": ["RECURRING", 2],
			"Rafael Lima": ["RECURRING", 2],
			"João Batista": ["ATTENTION", 1],
			"Maria do Carmo": ["NEW", 1],
			"Ana Paula": ["NEW", 1],
			"Cícero Santos": ["NEW", 0],
		});
		expect(counts).toEqual({
			ALL: 8,
			PROFESSIONALS: 6,
			HOME_RENOVATION: 2,
			ATTENTION: 1,
		});

		const jose = await client.customers.get({ id: "c-jose" });
		expect(jose.stats.totalSpentCents).toBe(100000);
		expect(jose.stats.openBalanceCents).toBe(0);
		expect(jose.stats.lateCount).toBe(0);
	});

	it("conta os status do estoque e as peças de andaime", async () => {
		const today = await clientAs("MANAGER").dashboard.today();
		const counts = Object.fromEntries(
			today.unitCounts.map((entry) => [entry.status, entry.count]),
		);
		expect(counts).toEqual({
			AVAILABLE: 10,
			SEPARATED: 2,
			RENTED: 3,
			IN_INSPECTION: 1,
			IN_MAINTENANCE: 1,
		});
		expect(today.scaffold).toMatchObject({ free: 12, reserved: 8 });
		expect(today.overdue.map((rental) => rental.rentalNumber)).toEqual([
			"LOC-0028",
		]);
		expect(today.leaving.map((rental) => rental.rentalNumber)).toEqual([
			"LOC-0029",
			"LOC-0030",
			"LOC-0032",
		]);
		expect(today.returning.map((rental) => rental.rentalNumber)).toEqual([
			"LOC-0027",
			"LOC-0026",
		]);
	});

	it("mostra os números da unidade como no desenho", async () => {
		const unit = await clientAs("MANAGER").equipment.getUnit({
			code: "MAR-002",
		});
		expect(unit.stats).toEqual({
			rentalCount: 2,
			rentedDays: 4,
			revenueCents: 40000,
			maintenanceCents: 0,
		});
		expect(unit.rentals.map((rental) => rental.number)).toEqual([
			"LOC-0029",
			"LOC-0021",
			"LOC-0015",
		]);
	});
});

describe("agenda", () => {
	it("acha a serra mármore pelo apelido", async () => {
		const { results, dailies } = await clientAs(
			"ATTENDANT",
		).availability.search({
			query: "maquita",
			start: day(5),
			end: day(8, "17:00"),
		});
		expect(dailies).toBe(4);
		expect(results.map((result) => result.code)).toEqual(["MAR-008"]);
		expect(results[0]?.periodTotalCents).toBe(16000);
	});

	it("diz até quando a unidade está ocupada", async () => {
		const { results } = await clientAs("ATTENDANT").availability.search({
			query: "martelete ou demolidor",
			start: day(5),
			end: day(8, "17:00"),
		});
		const hammer = results.find((result) => result.code === "MAR-002");
		expect(results.find((result) => result.code === "MAR-001")?.available).toBe(
			true,
		);
		expect(hammer?.available).toBe(false);
		expect(hammer?.blockingRental?.number).toBe("LOC-0029");
		expect(hammer?.freeFrom && calendarDay(hammer.freeFrom)).toBe(
			addCalendarDays(TODAY, 7),
		);
	});

	it("mostra as peças de andaime livres por dia", async () => {
		const { rows } = await clientAs("ATTENDANT").availability.calendar({
			start: TODAY,
			days: 10,
		});
		const scaffold = rows.find((row) => row.code === "ANDAIME");
		expect(scaffold?.cells.map((cell) => cell.freeQuantity)).toEqual([
			12, 12, 12, 12, 12, 0, 0, 0, 0, 12,
		]);
		const trailer = rows.find((row) => row.code === "CARROCINHA");
		expect(trailer?.cells[0]?.state).toBe("FREE");
		expect(trailer?.cells[1]?.state).toBe("AWAITING_DEPOSIT");
		const overdue = rows.find((row) => row.code === "MAR-008");
		expect(overdue?.cells[0]?.state).toBe("OVERDUE");
		expect(overdue?.cells[1]?.state).toBe("FREE");
		const repair = rows.find((row) => row.code === "MAR-011");
		expect(repair?.cells.slice(0, 5).map((cell) => cell.state)).toEqual([
			"MAINTENANCE",
			"MAINTENANCE",
			"MAINTENANCE",
			"MAINTENANCE",
			"FREE",
		]);
	});
});

describe("reserva dupla", () => {
	it("recusa enviar orçamento para unidade ocupada", async () => {
		const client = clientAs("ATTENDANT");
		const error = await errorOf(
			client.rentals.createQuote({
				...quote,
				startAt: day(2),
				endAt: day(3),
				items: [{ kind: "UNIT", code: "MAR-002", quantity: 1 }],
				send: true,
			}),
		);
		expect(isDefinedError(error)).toBe(true);
		expect(error.code).toBe("CONFLICT");
		expect(error.data).toMatchObject({
			conflicts: [{ code: "MAR-002", rentalNumber: "LOC-0029" }],
		});
		expect(getDb().rentals.some((rental) => rental.number === "LOC-0034")).toBe(
			false,
		);
	});

	it("deixa salvar rascunho, mas recusa ao enviar", async () => {
		const client = clientAs("ATTENDANT");
		const draft = await client.rentals.createQuote({
			...quote,
			startAt: day(2),
			endAt: day(3),
			items: [{ kind: "UNIT", code: "MAR-002", quantity: 1 }],
			send: false,
		});
		expect(draft.status).toBe("QUOTE");
		const error = await errorOf(
			client.rentals.sendQuote({ number: draft.number }),
		);
		expect(error.code).toBe("CONFLICT");
	});

	it("rascunho não segura a unidade", async () => {
		const client = clientAs("ATTENDANT");
		const input = {
			...quote,
			startAt: day(20),
			endAt: day(21),
			items: [{ kind: "UNIT" as const, code: "MAR-003", quantity: 1 }],
		};
		await client.rentals.createQuote({ ...input, send: false });
		const sent = await client.rentals.createQuote({ ...input, send: true });
		expect(sent.status).toBe("AWAITING_DEPOSIT");
		const error = await errorOf(
			client.rentals.createQuote({ ...input, send: true }),
		);
		expect(error.code).toBe("CONFLICT");
	});

	it("respeita a folga entre locações", async () => {
		const client = clientAs("ATTENDANT");
		const error = await errorOf(
			client.rentals.createQuote({
				...quote,
				startAt: day(6, "22:00"),
				endAt: day(8),
				items: [{ kind: "UNIT", code: "MAR-002", quantity: 1 }],
				send: true,
			}),
		);
		expect(error.code).toBe("CONFLICT");
	});

	it("recusa peças de andaime além do que está livre", async () => {
		const client = clientAs("ATTENDANT");
		const error = await errorOf(
			client.rentals.createQuote({
				...quote,
				startAt: day(1),
				endAt: day(2),
				items: [{ kind: "LOT", code: "ANDAIME", quantity: 13 }],
				send: true,
			}),
		);
		expect(error.data).toMatchObject({
			conflicts: [{ code: "ANDAIME", freeQuantity: 12, requestedQuantity: 13 }],
		});
	});

	it("recusa tipo sem preço", async () => {
		const client = clientAs("ATTENDANT");
		const error = await errorOf(
			client.rentals.createQuote({
				...quote,
				startAt: day(2),
				endAt: day(3),
				items: [{ kind: "UNIT", code: "MAR-005", quantity: 1 }],
				send: false,
			}),
		);
		expect(error.code).toBe("PRECONDITION_FAILED");
		expect(error.data).toMatchObject({
			reason: "UNPRICED_TYPE",
			codes: ["MAR-005"],
		});
	});
});

describe("sinal", () => {
	it("vencido expira e libera a unidade", async () => {
		const client = clientAs("ATTENDANT");
		const before = await client.availability.search({
			query: "carrocinha",
			start: day(1),
			end: day(1, "17:00"),
		});
		expect(before.results[0]?.available).toBe(false);

		setMockClock(() => new Date(NOW.getTime() + 6 * 3_600_000));

		const rental = await client.rentals.get({ number: "LOC-0031" });
		expect(rental.status).toBe("EXPIRED");
		expect(rental.history[0]?.message).toContain("expirou");
		const after = await client.availability.search({
			query: "carrocinha",
			start: day(1),
			end: day(1, "17:00"),
		});
		expect(after.results[0]?.available).toBe(true);
	});

	it("congela o preço quando entra e confirma a reserva", async () => {
		const attendant = clientAs("ATTENDANT");
		const manager = clientAs("MANAGER");
		const cost = async () =>
			(await attendant.rentals.get({ number: "LOC-0031" })).totalCents;
		const raise = (dailyPriceCents: number) =>
			manager.settings.update({
				lots: [{ lotId: "lot-carrocinha", dailyPriceCents }],
			});

		await raise(9000);
		expect(await cost()).toBe(9000);

		const noSignal = await errorOf(
			attendant.rentals.confirm({ number: "LOC-0031" }),
		);
		expect(noSignal.code).toBe("PRECONDITION_FAILED");

		await attendant.rentals.recordPayment({
			number: "LOC-0031",
			kind: "SIGNAL",
			amountCents: 3000,
			method: "PIX",
		});
		await raise(12000);
		expect(await cost()).toBe(9000);

		const confirmed = await attendant.rentals.confirm({ number: "LOC-0031" });
		expect(confirmed.status).toBe("CONFIRMED");
		expect(confirmed.balanceCents).toBe(6000);
	});
});

describe("permissões", () => {
	it("só gestão mexe em configurações e usuários", async () => {
		const attendant = clientAs("ATTENDANT");
		expect(
			(await errorOf(attendant.settings.update({ signalDeadlineHours: 12 })))
				.code,
		).toBe("FORBIDDEN");
		expect((await errorOf(attendant.users.list())).code).toBe("FORBIDDEN");
	});

	it("equipamentos não vê dinheiro nem clientes", async () => {
		const equipment = clientAs("EQUIPMENT");
		const range = { from: day(-29), to: day(1) };
		expect((await errorOf(equipment.dashboard.summary(range))).code).toBe(
			"FORBIDDEN",
		);
		expect(
			(await errorOf(equipment.ledger.list({ ...range, account: "CASH" })))
				.code,
		).toBe("FORBIDDEN");
		expect((await errorOf(equipment.customers.list({}))).code).toBe(
			"FORBIDDEN",
		);
	});

	it("sem sessão não entra", async () => {
		const anonymous = createRouterClient(mockRouter, {
			context: { session: null },
		});
		expect((await errorOf(anonymous.session.me())).code).toBe("UNAUTHORIZED");
	});
});

describe("status da unidade", () => {
	it("recusa transição fora da máquina", async () => {
		const error = await errorOf(
			clientAs("MANAGER").equipment.changeUnitStatus({
				code: "MAR-003",
				to: "RENTED",
			}),
		);
		expect(error.code).toBe("INVALID_TRANSITION");
		expect(error.data).toMatchObject({ from: "AVAILABLE", to: "RENTED" });
	});

	it("exige motivo para bloquear", async () => {
		const client = clientAs("MANAGER");
		const error = await errorOf(
			client.equipment.changeUnitStatus({ code: "MAR-003", to: "BLOCKED" }),
		);
		expect(error.code).toBe("PRECONDITION_FAILED");
		const unit = await client.equipment.changeUnitStatus({
			code: "MAR-003",
			to: "BLOCKED",
			reason: "Uso da família",
		});
		expect(unit.status).toBe("BLOCKED");
	});
});

async function answerAll(
	client: ReturnType<typeof clientAs>,
	rentalNumber: string,
	unitCode: string,
	kind: "CHECKOUT" | "RETURN",
	notOk: string[] = [],
) {
	const inspection = await client.inspections.get({
		rentalNumber,
		unitCode,
		kind,
	});
	for (const item of inspection.items) {
		if (item.preexisting) continue;
		await client.inspections.saveItem({
			inspectionId: inspection.id,
			itemId: item.id,
			answer: notOk.includes(item.id) ? "NOT_OK" : "OK",
			observation: null,
		});
	}
	return inspection;
}

describe("saída", () => {
	it("leva a unidade para alugado e a locação para na obra", async () => {
		const client = clientAs("EQUIPMENT");
		const inspection = await answerAll(
			client,
			"LOC-0029",
			"MAR-002",
			"CHECKOUT",
		);
		expect(inspection.items[0]?.preexisting).toBe(true);
		expect(inspection.items[0]?.label).toContain("Risco na lateral esquerda");

		const noTerm = await errorOf(
			client.inspections.complete({ inspectionId: inspection.id }),
		);
		expect(noTerm.data).toMatchObject({ reason: "TERM_NOT_SIGNED" });

		const { rental, unitStatus } = await client.inspections.complete({
			inspectionId: inspection.id,
			termSigned: true,
			balance: { amountCents: 50000, method: "PIX" },
			deposit: { amountCents: 30000, method: "PIX" },
		});
		expect(unitStatus).toBe("RENTED");
		expect(rental.status).toBe("ON_SITE");
		expect(rental.balanceCents).toBe(0);
		expect(rental.deposit.heldCents).toBe(30000);

		const manager = clientAs("MANAGER");
		const summary = await manager.dashboard.summary({
			from: day(-29, "00:00"),
			to: day(1, "00:00"),
		});
		expect(summary.inCents).toBe(234000 + 50000);
		expect(summary.depositHeldCents).toBe(90000 + 30000);
	});

	it("não conclui com item sem resposta", async () => {
		const client = clientAs("EQUIPMENT");
		const inspection = await client.inspections.get({
			rentalNumber: "LOC-0029",
			unitCode: "MAR-002",
			kind: "CHECKOUT",
		});
		const error = await errorOf(
			client.inspections.complete({
				inspectionId: inspection.id,
				termSigned: true,
			}),
		);
		expect(error.data).toMatchObject({ reason: "CHECKLIST_INCOMPLETE" });
	});

	it("não entrega o que não foi separado", async () => {
		const client = clientAs("MANAGER");
		const inspection = await answerAll(
			client,
			"LOC-0030",
			"ANDAIME",
			"CHECKOUT",
		);
		const error = await errorOf(
			client.inspections.complete({
				inspectionId: inspection.id,
				termSigned: true,
			}),
		);
		expect(error.data).toMatchObject({ reason: "UNITS_NOT_SEPARATED" });

		await client.rentals.markSeparated({ number: "LOC-0030" });
		const { rental } = await client.inspections.complete({
			inspectionId: inspection.id,
			termSigned: true,
		});
		expect(rental.status).toBe("ON_SITE");
	});
});

describe("checklist concluído", () => {
	it("não conclui duas vezes nem lança o saldo em dobro", async () => {
		const client = clientAs("EQUIPMENT");
		const inspection = await answerAll(
			client,
			"LOC-0029",
			"MAR-002",
			"CHECKOUT",
		);
		const finish = {
			inspectionId: inspection.id,
			termSigned: true,
			balance: { amountCents: 50000, method: "PIX" as const },
		};
		await client.inspections.complete(finish);

		const again = await errorOf(client.inspections.complete(finish));
		expect(again.data).toMatchObject({ reason: "CHECKLIST_ALREADY_DONE" });

		const edit = await errorOf(
			client.inspections.saveItem({
				inspectionId: inspection.id,
				itemId: "liga",
				answer: "NOT_OK",
				observation: null,
			}),
		);
		expect(edit.data).toMatchObject({ reason: "CHECKLIST_ALREADY_DONE" });

		const summary = await clientAs("MANAGER").dashboard.summary({
			from: day(-29, "00:00"),
			to: day(1, "00:00"),
		});
		expect(summary.inCents).toBe(234000 + 50000);
	});
});

describe("volta", () => {
	it("gera ocorrências para cada divergência", async () => {
		const client = clientAs("EQUIPMENT");
		const inspection = await answerAll(
			client,
			"LOC-0026",
			"MAR-006",
			"RETURN",
			["cabo", "limpo"],
		);
		expect(inspection.items[0]?.checkoutAnswer).toBe("OK");

		const { rental, unitStatus } = await client.inspections.complete({
			inspectionId: inspection.id,
			resolutions: [
				{
					itemId: "cabo",
					kind: "DAMAGE",
					description: "Cabo cortado",
					amountCents: 8000,
					decision: "CHARGE",
				},
			],
			outcome: "IN_MAINTENANCE",
		});

		expect(rental.status).toBe("RETURNED");
		expect(unitStatus).toBe("IN_MAINTENANCE");
		expect(
			rental.occurrences.map((occurrence) => [
				occurrence.kind,
				occurrence.amountCents,
				occurrence.decision,
			]),
		).toEqual([
			["DAMAGE", 8000, "CHARGE"],
			["DIRT", 5000, "DISPUTE"],
		]);
		expect(rental.balanceCents).toBe(8000);

		const orders = await clientAs("MANAGER").maintenance.list();
		expect(
			orders.orders.some(
				(order) => order.unitCode === "MAR-006" && order.status === "IN_REPAIR",
			),
		).toBe(true);
		const customer = await clientAs("MANAGER").customers.get({
			id: "c-rafael",
		});
		expect(customer.tier).toBe("ATTENTION");
	});

	it("sem divergência, unidade volta disponível", async () => {
		const client = clientAs("EQUIPMENT");
		const inspection = await answerAll(client, "LOC-0026", "MAR-006", "RETURN");
		const { rental, unitStatus } = await client.inspections.complete({
			inspectionId: inspection.id,
		});
		expect(unitStatus).toBe("AVAILABLE");
		expect(rental.occurrences).toEqual([]);
	});

	it("registra o atraso com a regra provisória", async () => {
		const client = clientAs("EQUIPMENT");
		const inspection = await answerAll(client, "LOC-0028", "MAR-008", "RETURN");
		expect(inspection.lateFee).toEqual({
			extraDailies: 1,
			suggestedCents: 4000,
		});
		const { rental } = await client.inspections.complete({
			inspectionId: inspection.id,
			lateFee: { amountCents: 4000, decision: "CHARGE" },
		});
		expect(rental.occurrences[0]).toMatchObject({
			kind: "LATE",
			amountCents: 4000,
		});
		expect(rental.balanceCents).toBe(4000);
	});
});

describe("caução", () => {
	it("retenção lança no caixa e abate a cobrança", async () => {
		const equipment = clientAs("EQUIPMENT");
		const attendant = clientAs("ATTENDANT");
		const manager = clientAs("MANAGER");
		const inspection = await answerAll(
			equipment,
			"LOC-0026",
			"MAR-006",
			"RETURN",
			["cabo"],
		);
		await equipment.inspections.complete({
			inspectionId: inspection.id,
			resolutions: [
				{
					itemId: "cabo",
					kind: "DAMAGE",
					description: "Cabo cortado",
					amountCents: 8000,
					decision: "CHARGE",
				},
			],
		});

		const rental = await attendant.deposits.recordRetention({
			rentalNumber: "LOC-0026",
			amountCents: 8000,
			reason: "Cabo cortado",
		});
		expect(rental.deposit.heldCents).toBe(12000);
		expect(rental.balanceCents).toBe(0);

		const range = { from: day(-29, "00:00"), to: day(1, "00:00") };
		const summary = await manager.dashboard.summary(range);
		expect(summary.inCents).toBe(234000 + 8000);
		expect(summary.depositHeldCents).toBe(90000 - 8000);
		const totals = await manager.ledger.byCategory(range);
		expect(
			totals.in.find((row) => row.category === "DEPOSIT_RETAINED")?.amountCents,
		).toBe(8000);
	});

	it("devolução não entra no caixa e libera o encerramento", async () => {
		const equipment = clientAs("EQUIPMENT");
		const attendant = clientAs("ATTENDANT");
		const inspection = await answerAll(
			equipment,
			"LOC-0026",
			"MAR-006",
			"RETURN",
		);
		await equipment.inspections.complete({ inspectionId: inspection.id });

		const held = await errorOf(attendant.rentals.close({ number: "LOC-0026" }));
		expect(held.data).toMatchObject({ reason: "DEPOSIT_NOT_SETTLED" });

		const refunded = await attendant.deposits.recordRefund({
			rentalNumber: "LOC-0026",
			amountCents: 20000,
			method: "PIX",
		});
		expect(refunded.deposit.heldCents).toBe(0);

		const closed = await attendant.rentals.close({ number: "LOC-0026" });
		expect(closed.status).toBe("CLOSED");

		const summary = await clientAs("MANAGER").dashboard.summary({
			from: day(-29, "00:00"),
			to: day(1, "00:00"),
		});
		expect(summary.inCents).toBe(234000);
	});

	it("não devolve mais do que tem em mãos", async () => {
		const error = await errorOf(
			clientAs("ATTENDANT").deposits.recordRefund({
				rentalNumber: "LOC-0026",
				amountCents: 90000,
				method: "PIX",
			}),
		);
		expect(error.data).toMatchObject({ reason: "INSUFFICIENT_DEPOSIT" });
	});
});

describe("manutenção", () => {
	it("concluir lança a despesa e muda o status", async () => {
		const client = clientAs("MANAGER");
		await client.maintenance.open({
			unitCode: "MAR-003",
			reason: "Trocar mandril",
			location: "WORKSHOP",
			locationName: null,
			estimatedCostCents: 6000,
			expectedBackAt: day(4),
		});
		const unit = await client.equipment.getUnit({ code: "MAR-003" });
		expect(unit.status).toBe("IN_MAINTENANCE");

		const order = await client.maintenance.complete({
			number: "OS-005",
			finalCostCents: 7500,
			method: "PIX",
			unitStatusAfter: "AVAILABLE",
		});
		expect(order.status).toBe("DONE");
		expect((await client.equipment.getUnit({ code: "MAR-003" })).status).toBe(
			"AVAILABLE",
		);
		const summary = await client.dashboard.summary({
			from: day(-29, "00:00"),
			to: day(1, "00:00"),
		});
		expect(summary.outCents).toBe(61000 + 7500);
	});

	it("não cobra de novo o que já foi lançado", async () => {
		const client = clientAs("MANAGER");
		await client.maintenance.complete({
			number: "OS-004",
			finalCostCents: 4500,
			method: "CASH",
			unitStatusAfter: "AVAILABLE",
		});
		const summary = await client.dashboard.summary({
			from: day(-29, "00:00"),
			to: day(1, "00:00"),
		});
		expect(summary.outCents).toBe(61000);
	});

	it("unidade em manutenção só fica livre depois da previsão", async () => {
		const { results } = await clientAs("ATTENDANT").availability.search({
			query: "MAR-011",
			start: day(2),
			end: day(3),
		});
		expect(results[0]?.available).toBe(false);
		expect(results[0]?.block).toBe("MAINTENANCE");
		const later = await clientAs("ATTENDANT").availability.search({
			query: "MAR-011",
			start: day(4),
			end: day(5),
		});
		expect(later.results[0]?.available).toBe(true);
	});
});

describe("prorrogação", () => {
	it("checa a agenda e recalcula o valor", async () => {
		const client = clientAs("ATTENDANT");
		const preview = await client.rentals.previewExtend({
			number: "LOC-0029",
			newEndAt: day(8, "17:00"),
		});
		expect(preview).toMatchObject({
			available: true,
			addedDailies: 2,
			differenceCents: 20000,
			newTotalCents: 90000,
		});
		const extended = await client.rentals.extend({
			number: "LOC-0029",
			newEndAt: day(8, "17:00"),
		});
		expect(extended.totalCents).toBe(90000);
		expect(extended.balanceCents).toBe(70000);
	});

	it("recusa quando a unidade já tem outra reserva", async () => {
		const client = clientAs("ATTENDANT");
		await client.rentals.createQuote({
			...quote,
			startAt: day(10),
			endAt: day(11),
			items: [{ kind: "UNIT", code: "MAR-002", quantity: 1 }],
			send: true,
		});
		const error = await errorOf(
			client.rentals.extend({ number: "LOC-0029", newEndAt: day(10, "17:00") }),
		);
		expect(error.code).toBe("CONFLICT");
	});
});

describe("status da locação", () => {
	it("não aceita pagamento em rascunho", async () => {
		const client = clientAs("ATTENDANT");
		const draft = await client.rentals.createQuote({
			...quote,
			startAt: day(20),
			endAt: day(21),
			items: [{ kind: "UNIT", code: "MAR-004", quantity: 1 }],
			send: false,
		});
		const error = await errorOf(
			client.rentals.recordPayment({
				number: draft.number,
				kind: "SIGNAL",
				amountCents: 1000,
				method: "PIX",
			}),
		);
		expect(error.code).toBe("INVALID_TRANSITION");
	});

	it("não prorroga locação encerrada", async () => {
		const error = await errorOf(
			clientAs("ATTENDANT").rentals.extend({
				number: "LOC-0009",
				newEndAt: day(5),
			}),
		);
		expect(error.code).toBe("INVALID_TRANSITION");
	});
});

describe("cancelamento", () => {
	it("devolve a unidade separada e registra o motivo", async () => {
		const rental = await clientAs("ATTENDANT").rentals.cancel({
			number: "LOC-0029",
			reason: "Cliente desistiu",
		});
		expect(rental.status).toBe("CANCELED");
		expect(rental.cancelReason).toBe("Cliente desistiu");
		expect(getDb().units.find((unit) => unit.code === "MAR-002")?.status).toBe(
			"AVAILABLE",
		);
	});
});

describe("texto do orçamento", () => {
	it("mostra valores e pendências", async () => {
		const { text } = await clientAs("ATTENDANT").rentals.copyQuoteText({
			number: "LOC-0033",
		});
		expect(text).toContain("Orçamento LOC-0033");
		expect(text).toContain("Cícero Santos");
		expect(text).toContain("R$ 2 × 12 × 4 = R$ 96");
		expect(text).toContain("Total: R$ 296 + taxa de entrega");
		expect(text).toContain("Caução, devolvida depois: a definir");
	});
});
