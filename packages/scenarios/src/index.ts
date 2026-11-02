import {
	type AppClient,
	contract,
	type Session,
} from "@marinho-gestao/contract";
import {
	addCalendarDays,
	calendarDay,
	PERMISSIONS,
	type Permission,
	ROLES,
	type Role,
	zonedTimeToIso,
} from "@marinho-gestao/domain";
import { isDefinedError, ORPCError } from "@orpc/client";
import { beforeEach, describe, expect, it } from "vitest";

export type ScenarioHarness = {
	reset(now: Date): Promise<void>;
	setNow(now: Date): void;
	clientAs(role: Role): AppClient;
	anonymous(): AppClient;
	signIn(username: string, password: string): Promise<Session>;
};

export const SCENARIO_NOW = new Date("2026-11-02T13:00:00.000Z");

export function defineScenarios(harness: ScenarioHarness): void {
	const NOW = SCENARIO_NOW;
	const TODAY = calendarDay(NOW);
	const day = (offset: number, time = "08:00") =>
		zonedTimeToIso(addCalendarDays(TODAY, offset), time);

	const clientAs = (role: Role) => harness.clientAs(role);

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

	async function customerIdOf(name: string): Promise<string> {
		const { customers } = await clientAs("MANAGER").customers.list({ q: name });
		const customer = customers.find((entry) => entry.name === name);
		if (!customer) throw new Error(`sem cliente ${name}`);
		return customer.id;
	}

	async function lotIdOf(name: string): Promise<string> {
		const { lots } = await clientAs("MANAGER").settings.get();
		const lot = lots.find((entry) => entry.name === name);
		if (!lot) throw new Error(`sem lote ${name}`);
		return lot.lotId;
	}

	async function userIdOf(username: string): Promise<string> {
		const users = await clientAs("MANAGER").users.list();
		const user = users.find((entry) => entry.username === username);
		if (!user) throw new Error(`sem usuário ${username}`);
		return user.id;
	}

	let keySequence = 0;
	const newKey = () => {
		keySequence += 1;
		return `chave-de-teste-${keySequence}`;
	};

	const quote = {
		customerId: "",
		deliveryMode: "PICKUP" as const,
		siteAddress: null,
		siteCity: null,
		sitePinUrl: null,
		deliveryFeeCents: null,
		discountCents: 0,
		notes: null,
	};

	beforeEach(async () => {
		await harness.reset(NOW);
		quote.customerId = await customerIdOf("Maria do Carmo");
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

			const jose = await client.customers.get({
				id: await customerIdOf("José Carlos"),
			});
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
			expect(
				results.find((result) => result.code === "MAR-001")?.available,
			).toBe(true);
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
			expect(
				(await errorOf(client.rentals.get({ number: "LOC-0034" }))).code,
			).toBe("NOT_FOUND");
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
				conflicts: [
					{ code: "ANDAIME", freeQuantity: 12, requestedQuantity: 13 },
				],
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

			harness.setNow(new Date(NOW.getTime() + 6 * 3_600_000));

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
			const lotId = await lotIdOf("Carrocinha");
			const raise = (dailyPriceCents: number) =>
				manager.settings.update({
					lots: [{ lotId, dailyPriceCents }],
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
				idempotencyKey: newKey(),
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
			const anonymous = harness.anonymous();
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
					(order) =>
						order.unitCode === "MAR-006" && order.status === "IN_REPAIR",
				),
			).toBe(true);
			const customer = await clientAs("MANAGER").customers.get({
				id: await customerIdOf("Rafael Lima"),
			});
			expect(customer.tier).toBe("ATTENTION");
		});

		it("sem divergência, unidade volta disponível", async () => {
			const client = clientAs("EQUIPMENT");
			const inspection = await answerAll(
				client,
				"LOC-0026",
				"MAR-006",
				"RETURN",
			);
			const { rental, unitStatus } = await client.inspections.complete({
				inspectionId: inspection.id,
			});
			expect(unitStatus).toBe("AVAILABLE");
			expect(rental.occurrences).toEqual([]);
		});

		it("registra o atraso com a regra provisória", async () => {
			const client = clientAs("EQUIPMENT");
			const inspection = await answerAll(
				client,
				"LOC-0028",
				"MAR-008",
				"RETURN",
			);
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
				idempotencyKey: newKey(),
			});
			expect(rental.deposit.heldCents).toBe(12000);
			expect(rental.balanceCents).toBe(0);

			const range = { from: day(-29, "00:00"), to: day(1, "00:00") };
			const summary = await manager.dashboard.summary(range);
			expect(summary.inCents).toBe(234000 + 8000);
			expect(summary.depositHeldCents).toBe(90000 - 8000);
			const totals = await manager.ledger.byCategory(range);
			expect(
				totals.in.find((row) => row.category === "DEPOSIT_RETAINED")
					?.amountCents,
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

			const held = await errorOf(
				attendant.rentals.close({ number: "LOC-0026" }),
			);
			expect(held.data).toMatchObject({ reason: "DEPOSIT_NOT_SETTLED" });

			const refunded = await attendant.deposits.recordRefund({
				rentalNumber: "LOC-0026",
				amountCents: 20000,
				method: "PIX",
				idempotencyKey: newKey(),
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
					idempotencyKey: newKey(),
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
				client.rentals.extend({
					number: "LOC-0029",
					newEndAt: day(10, "17:00"),
				}),
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
					idempotencyKey: newKey(),
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
			const unit = await clientAs("MANAGER").equipment.getUnit({
				code: "MAR-002",
			});
			expect(unit.status).toBe("AVAILABLE");
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

	describe("pessoas", () => {
		it("cria pessoa que consegue entrar", async () => {
			const client = clientAs("MANAGER");
			const user = await client.users.create({
				name: "Maria",
				username: " Maria.Silva ",
				role: "ATTENDANT",
				password: "senha-forte",
			});
			expect(user.username).toBe("maria.silva");
			const session = await harness.signIn("maria.silva", "senha-forte");
			expect(session.user.role).toBe("ATTENDANT");
		});

		it("recusa usuário repetido e senha curta", async () => {
			const client = clientAs("MANAGER");
			const repeated = await errorOf(
				client.users.create({
					name: "Outro",
					username: "lucas",
					role: "ATTENDANT",
					password: "senha-forte",
				}),
			);
			expect(repeated.data).toMatchObject({ reason: "DUPLICATE" });
			const short = await errorOf(
				client.users.create({
					name: "Outro",
					username: "outro",
					role: "ATTENDANT",
					password: "curta",
				}),
			);
			expect(short.code).toBe("BAD_REQUEST");
		});

		it("muda o papel e redefine a senha", async () => {
			const client = clientAs("MANAGER");
			const id = await userIdOf("atendimento");
			const role = await client.users.setRole({ id, role: "EQUIPMENT" });
			expect(role.role).toBe("EQUIPMENT");

			await client.users.setPassword({ id, newPassword: "senha-nova-1" });
			await expect(
				harness.signIn("atendimento", "marinho123"),
			).rejects.toThrow();
			const session = await harness.signIn("atendimento", "senha-nova-1");
			expect(session.user.role).toBe("EQUIPMENT");
		});

		it("só gestão redefine senha", async () => {
			const id = await userIdOf("lucas");
			const error = await errorOf(
				clientAs("ATTENDANT").users.setPassword({
					id,
					newPassword: "senha-nova-1",
				}),
			);
			expect(error.code).toBe("FORBIDDEN");
		});
	});

	const range = { from: day(-29, "00:00"), to: day(2, "00:00") };

	async function cashEntry(description: string) {
		const { entries } = await clientAs("MANAGER").ledger.list({
			...range,
			account: "CASH",
		});
		const entry = entries.find((item) => item.description === description);
		if (!entry) throw new Error(`sem lançamento ${description}`);
		return entry;
	}

	describe("estorno", () => {
		it("anula o saldo e liga o inverso ao original", async () => {
			const client = clientAs("MANAGER");
			const before = await client.dashboard.summary(range);
			const entry = await client.ledger.create({
				direction: "IN",
				category: "OTHER_IN",
				amountCents: 12345,
				occurredAt: day(0, "09:00"),
				method: "PIX",
				description: "Entrada lançada errada",
				rentalNumber: null,
				unitCode: null,
				receiptFileKey: null,
				idempotencyKey: newKey(),
			});
			const reversal = await client.ledger.reverse({
				entryId: entry.id,
				reason: "Lançada na conta errada",
				idempotencyKey: newKey(),
			});

			expect(reversal).toMatchObject({
				direction: "OUT",
				amountCents: 12345,
				reversalOfId: entry.id,
				reversalOfDescription: "Entrada lançada errada",
				reversalReason: "Lançada na conta errada",
			});
			expect(await client.dashboard.summary(range)).toEqual(before);

			const original = await cashEntry("Entrada lançada errada");
			expect(original.reversedById).toBe(reversal.id);
			const totals = await client.ledger.byCategory(range);
			expect(totals.in.some((row) => row.category === "OTHER_IN")).toBe(false);
		});

		it("lançamento nunca muda: o original continua na lista", async () => {
			const client = clientAs("MANAGER");
			const original = await cashEntry("Anúncio no Google");
			await client.ledger.reverse({
				entryId: original.id,
				reason: "Foi pago pelo cartão pessoal",
				idempotencyKey: newKey(),
			});
			const after = await cashEntry("Anúncio no Google");
			expect(after.amountCents).toBe(original.amountCents);
			expect(after.direction).toBe(original.direction);
			expect(after.occurredAt).toBe(original.occurredAt);
		});

		it("não estorna duas vezes nem estorna um estorno", async () => {
			const client = clientAs("MANAGER");
			const entry = await cashEntry("Anúncio no Google");
			const reversal = await client.ledger.reverse({
				entryId: entry.id,
				reason: "Lançado errado",
				idempotencyKey: newKey(),
			});
			const twice = await errorOf(
				client.ledger.reverse({
					entryId: entry.id,
					reason: "De novo",
					idempotencyKey: newKey(),
				}),
			);
			expect(twice.data).toMatchObject({ reason: "ALREADY_REVERSED" });
			const ofReversal = await errorOf(
				client.ledger.reverse({
					entryId: reversal.id,
					reason: "Desfazer",
					idempotencyKey: newKey(),
				}),
			);
			expect(ofReversal.data).toMatchObject({ reason: "IS_REVERSAL" });
		});

		it("estornar pagamento devolve o saldo da locação", async () => {
			const client = clientAs("ATTENDANT");
			const signal = await cashEntry("Sinal da LOC-0029");
			await client.ledger.reverse({
				entryId: signal.id,
				reason: "Pix voltou",
				idempotencyKey: newKey(),
			});
			const rental = await client.rentals.get({ number: "LOC-0029" });
			expect(rental.balanceCents).toBe(70000);
			expect(rental.signalPaidCents).toBe(0);
			expect(rental.payments[0]?.reversedAt).not.toBeNull();
			expect(rental.history[0]?.message).toContain("Pix voltou");
		});

		it("saldo estornado de locação entregue fica em aberto", async () => {
			const client = clientAs("ATTENDANT");
			await client.ledger.reverse({
				entryId: (await cashEntry("Saldo da LOC-0026")).id,
				reason: "Pix devolvido",
				idempotencyKey: newKey(),
			});
			const { items } = await client.ledger.receivables();
			expect(
				items.find((item) => item.rentalNumber === "LOC-0026"),
			).toMatchObject({
				kind: "BALANCE",
				amountCents: 15000,
				delivered: true,
			});
			expect(
				items.find((item) => item.rentalNumber === "LOC-0029")?.delivered,
			).toBe(false);
		});

		it("sinal estornado volta a exigir sinal e deixa expirar", async () => {
			const client = clientAs("ATTENDANT");
			await client.rentals.recordPayment({
				number: "LOC-0031",
				kind: "SIGNAL",
				amountCents: 3000,
				method: "PIX",
				idempotencyKey: newKey(),
			});
			await client.ledger.reverse({
				entryId: (await cashEntry("Sinal da LOC-0031")).id,
				reason: "Pix não caiu",
				idempotencyKey: newKey(),
			});
			const confirm = await errorOf(
				client.rentals.confirm({ number: "LOC-0031" }),
			);
			expect(confirm.data).toMatchObject({ reason: "SIGNAL_REQUIRED" });

			harness.setNow(new Date(NOW.getTime() + 6 * 3_600_000));
			const rental = await client.rentals.get({ number: "LOC-0031" });
			expect(rental.status).toBe("EXPIRED");
		});

		it("caução recebida estornada sai de mãos", async () => {
			const client = clientAs("MANAGER");
			const { entries } = await client.ledger.list({
				...range,
				account: "DEPOSIT",
			});
			const deposit = entries.find(
				(entry) => entry.rentalNumber === "LOC-0026",
			);
			if (!deposit) throw new Error("sem caução");
			await client.ledger.reverse({
				entryId: deposit.id,
				reason: "Valor anotado errado",
				idempotencyKey: newKey(),
			});
			const rental = await client.rentals.get({ number: "LOC-0026" });
			expect(rental.deposit.heldCents).toBe(0);
			expect(rental.deposit.receivedAt).toBeNull();
			expect((await client.dashboard.summary(range)).depositHeldCents).toBe(
				70000,
			);
		});

		it("não estorna caução recebida que já foi devolvida", async () => {
			const client = clientAs("MANAGER");
			await client.deposits.recordRefund({
				rentalNumber: "LOC-0026",
				amountCents: 20000,
				method: "PIX",
				idempotencyKey: newKey(),
			});
			const { entries } = await client.ledger.list({
				...range,
				account: "DEPOSIT",
			});
			const received = entries.find(
				(entry) =>
					entry.rentalNumber === "LOC-0026" &&
					entry.category === "DEPOSIT_RECEIVED",
			);
			if (!received) throw new Error("sem caução");
			const error = await errorOf(
				client.ledger.reverse({
					entryId: received.id,
					reason: "Lançado errado",
					idempotencyKey: newKey(),
				}),
			);
			expect(error.data).toMatchObject({ reason: "INSUFFICIENT_DEPOSIT" });
		});

		it("estornar retenção desfaz os dois lados", async () => {
			const client = clientAs("MANAGER");
			await client.deposits.recordRetention({
				rentalNumber: "LOC-0026",
				amountCents: 8000,
				reason: "Disco quebrado",
				idempotencyKey: newKey(),
			});
			const before = await client.dashboard.summary(range);
			expect(before.inCents).toBe(234000 + 8000);

			const retained = await cashEntry(
				"Caução retida da LOC-0026: Disco quebrado",
			);
			await client.ledger.reverse({
				entryId: retained.id,
				reason: "Cliente trouxe o disco",
				idempotencyKey: newKey(),
			});

			const after = await client.dashboard.summary(range);
			expect(after.inCents).toBe(234000);
			expect(after.depositHeldCents).toBe(90000);
			const rental = await client.rentals.get({ number: "LOC-0026" });
			expect(rental.deposit.retainedCents).toBe(0);
			expect(rental.deposit.retentionReason).toBeNull();
		});

		it("estorno de manutenção volta a cobrar o que faltava", async () => {
			const client = clientAs("MANAGER");
			await client.ledger.reverse({
				entryId: (await cashEntry("Escovas da serra tico-tico")).id,
				reason: "Devolvidas na loja",
				idempotencyKey: newKey(),
			});
			const { orders, spentLast30DaysCents } = await client.maintenance.list();
			expect(spentLast30DaysCents).toBe(0);
			expect(
				orders.find((order) => order.number === "OS-004")?.alreadyPostedCents,
			).toBe(0);
		});

		it("equipamentos não estorna", async () => {
			const error = await errorOf(
				clientAs("EQUIPMENT").ledger.reverse({
					entryId: "qualquer",
					reason: "Sem acesso",
					idempotencyKey: newKey(),
				}),
			);
			expect(error.code).toBe("FORBIDDEN");
		});
	});

	describe("idempotência", () => {
		const expense = {
			direction: "OUT" as const,
			category: "FUEL" as const,
			amountCents: 5000,
			occurredAt: day(0, "09:00"),
			method: "CASH" as const,
			description: "Combustível repetido",
			rentalNumber: null,
			unitCode: null,
			receiptFileKey: null,
		};

		it("a mesma chave não duplica o lançamento", async () => {
			const client = clientAs("MANAGER");
			const idempotencyKey = newKey();
			const first = await client.ledger.create({ ...expense, idempotencyKey });
			const second = await client.ledger.create({ ...expense, idempotencyKey });
			expect(second).toEqual(first);
			const { outCents } = await client.dashboard.summary(range);
			expect(outCents).toBe(61000 + 5000);
		});

		it("chaves diferentes lançam duas vezes", async () => {
			const client = clientAs("MANAGER");
			await client.ledger.create({ ...expense, idempotencyKey: newKey() });
			await client.ledger.create({ ...expense, idempotencyKey: newKey() });
			const { outCents } = await client.dashboard.summary(range);
			expect(outCents).toBe(61000 + 10000);
		});

		it("não repete pagamento nem devolve o saldo errado", async () => {
			const client = clientAs("ATTENDANT");
			const input = {
				number: "LOC-0029",
				kind: "BALANCE" as const,
				amountCents: 10000,
				method: "PIX" as const,
				idempotencyKey: newKey(),
			};
			const first = await client.rentals.recordPayment(input);
			const second = await client.rentals.recordPayment(input);
			expect(second.balanceCents).toBe(first.balanceCents);
			const rental = await client.rentals.get({ number: "LOC-0029" });
			expect(rental.payments).toHaveLength(2);
			expect(rental.balanceCents).toBe(40000);
		});

		it("não repete caução, devolução, retenção nem estorno", async () => {
			const client = clientAs("MANAGER");
			const received = {
				rentalNumber: "LOC-0029",
				amountCents: 30000,
				method: "PIX" as const,
				idempotencyKey: newKey(),
			};
			await client.deposits.recordReceived(received);
			await client.deposits.recordReceived(received);

			const retained = {
				rentalNumber: "LOC-0029",
				amountCents: 5000,
				reason: "Peça perdida",
				idempotencyKey: newKey(),
			};
			await client.deposits.recordRetention(retained);
			await client.deposits.recordRetention(retained);

			const refunded = {
				rentalNumber: "LOC-0029",
				amountCents: 5000,
				method: "PIX" as const,
				idempotencyKey: newKey(),
			};
			await client.deposits.recordRefund(refunded);
			await client.deposits.recordRefund(refunded);

			const rental = await client.rentals.get({ number: "LOC-0029" });
			expect(rental.deposit).toMatchObject({
				receivedCents: 30000,
				retainedCents: 5000,
				refundedCents: 5000,
				heldCents: 20000,
			});

			const reverse = {
				entryId: (await cashEntry("Anúncio no Google")).id,
				reason: "Lançado errado",
				idempotencyKey: newKey(),
			};
			const first = await client.ledger.reverse(reverse);
			const second = await client.ledger.reverse(reverse);
			expect(second.id).toBe(first.id);
		});

		it("chave de outra pessoa ou outro procedimento não colide", async () => {
			const idempotencyKey = newKey();
			const manager = clientAs("MANAGER");
			const attendant = clientAs("ATTENDANT");
			await manager.ledger.create({ ...expense, idempotencyKey });
			await attendant.ledger.create({ ...expense, idempotencyKey });
			const { outCents } = await manager.dashboard.summary(range);
			expect(outCents).toBe(61000 + 10000);
		});

		it("tentativa que falhou não consome a chave", async () => {
			const client = clientAs("MANAGER");
			const input = {
				rentalNumber: "LOC-0029",
				amountCents: 1000,
				method: "PIX" as const,
				idempotencyKey: newKey(),
			};
			const failed = await errorOf(client.deposits.recordRefund(input));
			expect(failed.data).toMatchObject({ reason: "INSUFFICIENT_DEPOSIT" });
			await client.deposits.recordReceived({
				...input,
				idempotencyKey: newKey(),
			});
			const rental = await client.deposits.recordRefund(input);
			expect(rental.deposit.refundedCents).toBe(1000);
		});
	});

	describe("exportação CSV", () => {
		const month = TODAY.slice(0, 7);

		it("gera o arquivo do mês com BOM, ponto e vírgula e vírgula decimal", async () => {
			const client = clientAs("ATTENDANT");
			const { fileName, content } = await client.ledger.exportCsv({ month });
			expect(fileName).toBe(`marinho-caixa-${month}.csv`);
			expect(content.charCodeAt(0)).toBe(0xfeff);
			const [header, ...rows] = content.slice(1).trimEnd().split("\r\n");
			expect(header).toBe(
				"Data;Tipo;Categoria;Descrição;Forma;Valor;Locação;Unidade",
			);
			expect(rows.length).toBeGreaterThan(0);
			expect(content).toContain(
				";Saída;Combustível;Combustível da entrega em Capela;Dinheiro;40,00;LOC-0029;",
			);
		});

		it("deixa a caução de fora e inclui a retida no caixa", async () => {
			const client = clientAs("MANAGER");
			await client.deposits.recordRetention({
				rentalNumber: "LOC-0026",
				amountCents: 8000,
				reason: "Disco quebrado",
				idempotencyKey: newKey(),
			});
			const { content } = await client.ledger.exportCsv({ month });
			expect(content).not.toContain("Caução recebida");
			expect(content).not.toContain("Caução da LOC-0026");
			expect(content.match(/Caução retida da LOC-0026/g)).toHaveLength(1);
		});

		it("estorno entra com o sinal invertido", async () => {
			const client = clientAs("MANAGER");
			const entry = await client.ledger.create({
				direction: "IN",
				category: "OTHER_IN",
				amountCents: 12345,
				occurredAt: day(0, "09:00"),
				method: "PIX",
				description: "Entrada errada",
				rentalNumber: null,
				unitCode: null,
				receiptFileKey: null,
				idempotencyKey: newKey(),
			});
			await client.ledger.reverse({
				entryId: entry.id,
				reason: "Duplicada",
				idempotencyKey: newKey(),
			});
			const { content } = await client.ledger.exportCsv({ month });
			expect(content).toContain(
				";Entrada;Outras entradas;Entrada errada;Pix;123,45;;",
			);
			expect(content).toContain(
				";Entrada;Outras entradas;Estorno de Entrada errada: Duplicada;Pix;-123,45;;",
			);
		});

		it("equipamentos não exporta", async () => {
			const error = await errorOf(
				clientAs("EQUIPMENT").ledger.exportCsv({ month }),
			);
			expect(error.code).toBe("FORBIDDEN");
		});

		it("recusa mês inválido", async () => {
			const error = await errorOf(
				clientAs("MANAGER").ledger.exportCsv({ month: "2026-13" }),
			);
			expect(error.code).toBe("BAD_REQUEST");
		});
	});

	async function settledErrors(
		promises: Promise<unknown>[],
	): Promise<{ ok: number; errors: ORPCError<string, unknown>[] }> {
		const results = await Promise.allSettled(promises);
		const errors = results.flatMap((result) => {
			if (result.status === "fulfilled") return [];
			if (result.reason instanceof ORPCError) return [result.reason];
			throw result.reason;
		});
		return { ok: results.length - errors.length, errors };
	}

	describe("reservas ao mesmo tempo", () => {
		it("duas reservas da mesma unidade em paralelo: só uma passa", async () => {
			const input = {
				...quote,
				startAt: day(20),
				endAt: day(22),
				items: [{ kind: "UNIT" as const, code: "MAR-003", quantity: 1 }],
				send: true,
			};
			const { ok, errors } = await settledErrors([
				clientAs("ATTENDANT").rentals.createQuote(input),
				clientAs("MANAGER").rentals.createQuote(input),
			]);
			expect(ok).toBe(1);
			expect(errors.map((error) => error.code)).toEqual(["CONFLICT"]);
			expect(errors[0]?.data).toMatchObject({
				conflicts: [{ code: "MAR-003" }],
			});
		});

		it("duas reservas de andaime em paralelo que passam do total: só uma passa", async () => {
			const input = {
				...quote,
				startAt: day(20),
				endAt: day(21),
				items: [{ kind: "LOT" as const, code: "ANDAIME", quantity: 12 }],
				send: true,
			};
			const { ok, errors } = await settledErrors([
				clientAs("ATTENDANT").rentals.createQuote(input),
				clientAs("MANAGER").rentals.createQuote(input),
			]);
			expect(ok).toBe(1);
			expect(errors.map((error) => error.code)).toEqual(["CONFLICT"]);
			expect(errors[0]?.data).toMatchObject({
				conflicts: [
					{ code: "ANDAIME", freeQuantity: 8, requestedQuantity: 12 },
				],
			});
		});

		it("sinal vencido libera a agenda para outra reserva", async () => {
			const client = clientAs("ATTENDANT");
			const input = {
				...quote,
				startAt: day(1, "09:00"),
				endAt: day(1, "16:00"),
				items: [{ kind: "LOT" as const, code: "CARROCINHA", quantity: 1 }],
				send: true,
			};
			const busy = await errorOf(client.rentals.createQuote(input));
			expect(busy.code).toBe("CONFLICT");

			harness.setNow(new Date(NOW.getTime() + 6 * 3_600_000));
			const rental = await client.rentals.createQuote(input);
			expect(rental.status).toBe("AWAITING_DEPOSIT");
			const expired = await client.rentals.get({ number: "LOC-0031" });
			expect(expired.status).toBe("EXPIRED");
		});

		it("unidade com sinal vencido pode ser reservada de novo", async () => {
			const client = clientAs("ATTENDANT");
			const input = {
				...quote,
				startAt: day(10),
				endAt: day(11),
				items: [{ kind: "UNIT" as const, code: "MAR-004", quantity: 1 }],
				send: true,
			};
			await client.rentals.createQuote(input);
			expect((await errorOf(client.rentals.createQuote(input))).code).toBe(
				"CONFLICT",
			);
			harness.setNow(new Date(NOW.getTime() + 25 * 3_600_000));
			const again = await client.rentals.createQuote(input);
			expect(again.status).toBe("AWAITING_DEPOSIT");
		});
	});

	describe("transição de status", () => {
		it("recusa separar locação encerrada", async () => {
			const error = await errorOf(
				clientAs("MANAGER").rentals.markSeparated({ number: "LOC-0009" }),
			);
			expect(error.code).toBe("INVALID_TRANSITION");
			expect(error.data).toMatchObject({
				entity: "RENTAL",
				from: "CLOSED",
				to: "SEPARATED",
				allowed: [],
			});
		});
	});

	type RestrictedCall = {
		procedure: string;
		permission: Permission;
		call: (client: AppClient) => Promise<unknown>;
	};

	const OPEN_TO_EVERY_ROLE = [
		"session.me",
		"dashboard.today",
		"availability.search",
		"availability.calendar",
		"equipment.listTypes",
		"equipment.listUnits",
		"equipment.getUnit",
		"equipment.listLots",
		"rentals.list",
		"rentals.get",
		"rentals.copyQuoteText",
		"rentals.listLostDemand",
		"inspections.get",
		"inspections.saveItem",
		"inspections.attachMedia",
		"inspections.complete",
		"settings.get",
		"uploads.requestUpload",
		"uploads.completeUpload",
		"files.getDownloadUrl",
	];

	function restrictedCalls(): RestrictedCall[] {
		const period = { from: day(-29, "00:00"), to: day(1, "00:00") };
		const money = { amountCents: 100, method: "PIX" as const };
		const entry = {
			direction: "OUT" as const,
			category: "FUEL" as const,
			amountCents: 100,
			occurredAt: day(0, "09:00"),
			method: "PIX" as const,
			description: "Sem acesso",
			rentalNumber: null,
			unitCode: null,
			receiptFileKey: null,
		};
		const unitFields = {
			name: "Unidade nova",
			shortName: null,
			voltage: null,
			serialNumber: null,
			accessories: null,
			owner: null,
			labelApplied: true,
			purchaseValueCents: null,
			replacementValueCents: null,
			notes: null,
		};
		const calls: [
			string,
			Permission,
			(client: AppClient) => Promise<unknown>,
		][] = [
			["users.list", "users:manage", (c) => c.users.list()],
			[
				"users.create",
				"users:manage",
				(c) =>
					c.users.create({
						name: "Fulano",
						username: "fulano",
						role: "ATTENDANT",
						password: "senha-forte",
					}),
			],
			[
				"users.setRole",
				"users:manage",
				(c) => c.users.setRole({ id: "qualquer", role: "ATTENDANT" }),
			],
			[
				"users.setPassword",
				"users:manage",
				(c) =>
					c.users.setPassword({ id: "qualquer", newPassword: "senha-forte" }),
			],
			["dashboard.summary", "money:read", (c) => c.dashboard.summary(period)],
			[
				"equipment.createType",
				"catalog:manage",
				(c) =>
					c.equipment.createType({
						name: "Tipo novo",
						nicknames: [],
						description: null,
						dailyPriceCents: null,
						depositCents: null,
						turnaroundHours: 12,
						accessories: null,
					}),
			],
			[
				"equipment.updateType",
				"catalog:manage",
				(c) => c.equipment.updateType({ id: "qualquer" }),
			],
			[
				"equipment.createUnit",
				"catalog:manage",
				(c) =>
					c.equipment.createUnit({
						...unitFields,
						typeId: "qualquer",
						code: null,
					}),
			],
			[
				"equipment.updateUnit",
				"catalog:manage",
				(c) => c.equipment.updateUnit({ code: "MAR-003", notes: "x" }),
			],
			[
				"equipment.updateLot",
				"catalog:manage",
				(c) => c.equipment.updateLot({ id: "qualquer" }),
			],
			[
				"equipment.changeUnitStatus",
				"units:operate",
				(c) =>
					c.equipment.changeUnitStatus({
						code: "MAR-003",
						to: "BLOCKED",
						reason: "Sem acesso",
					}),
			],
			[
				"equipment.addUnitPhoto",
				"units:operate",
				(c) =>
					c.equipment.addUnitPhoto({
						code: "MAR-003",
						slot: "MAIN",
						fileKey: "unit_photo/x.jpg",
					}),
			],
			[
				"equipment.addKnownDamage",
				"units:operate",
				(c) =>
					c.equipment.addKnownDamage({
						code: "MAR-003",
						description: "Risco novo",
						fileKey: null,
					}),
			],
			["customers.list", "customers:read", (c) => c.customers.list({})],
			[
				"customers.get",
				"customers:read",
				(c) => c.customers.get({ id: "qualquer" }),
			],
			[
				"customers.create",
				"customers:write",
				(c) =>
					c.customers.create({
						kind: "INDIVIDUAL",
						name: "Cliente novo",
						taxId: null,
						responsible: null,
						authorizedReceivers: [],
						whatsapp: "(82) 99999-0000",
						alternatePhone: null,
						address: null,
						neighborhood: null,
						city: "Cajueiro",
						occupation: null,
						origin: null,
						referredBy: null,
						acceptsPromotions: false,
						notes: null,
					}),
			],
			[
				"customers.update",
				"customers:write",
				(c) => c.customers.update({ id: "qualquer", notes: "x" }),
			],
			[
				"customers.addDocument",
				"customers:write",
				(c) =>
					c.customers.addDocument({
						customerId: "qualquer",
						kind: "OTHER",
						fileKey: "customer_document/x.pdf",
					}),
			],
			[
				"rentals.createQuote",
				"rentals:sell",
				(c) =>
					c.rentals.createQuote({
						...quote,
						startAt: day(20),
						endAt: day(21),
						items: [{ kind: "UNIT", code: "MAR-003", quantity: 1 }],
						send: false,
					}),
			],
			[
				"rentals.sendQuote",
				"rentals:sell",
				(c) => c.rentals.sendQuote({ number: "LOC-0033" }),
			],
			[
				"rentals.recordPayment",
				"money:write",
				(c) =>
					c.rentals.recordPayment({
						...money,
						number: "LOC-0029",
						kind: "BALANCE",
						idempotencyKey: newKey(),
					}),
			],
			[
				"rentals.confirm",
				"rentals:sell",
				(c) => c.rentals.confirm({ number: "LOC-0031" }),
			],
			[
				"rentals.markSeparated",
				"rentals:separate",
				(c) => c.rentals.markSeparated({ number: "LOC-0030" }),
			],
			[
				"rentals.previewExtend",
				"rentals:sell",
				(c) =>
					c.rentals.previewExtend({ number: "LOC-0029", newEndAt: day(8) }),
			],
			[
				"rentals.extend",
				"rentals:sell",
				(c) => c.rentals.extend({ number: "LOC-0029", newEndAt: day(8) }),
			],
			[
				"rentals.cancel",
				"rentals:sell",
				(c) => c.rentals.cancel({ number: "LOC-0029", reason: "Sem acesso" }),
			],
			[
				"rentals.close",
				"rentals:close",
				(c) => c.rentals.close({ number: "LOC-0026" }),
			],
			[
				"rentals.recordLostDemand",
				"lostDemand:write",
				(c) =>
					c.rentals.recordLostDemand({
						item: "Betoneira",
						typeId: null,
						reason: "Não temos",
						city: null,
						requestedOn: TODAY,
					}),
			],
			[
				"deposits.recordReceived",
				"money:write",
				(c) =>
					c.deposits.recordReceived({
						...money,
						rentalNumber: "LOC-0029",
						idempotencyKey: newKey(),
					}),
			],
			[
				"deposits.recordRefund",
				"money:write",
				(c) =>
					c.deposits.recordRefund({
						...money,
						rentalNumber: "LOC-0026",
						idempotencyKey: newKey(),
					}),
			],
			[
				"deposits.recordRetention",
				"money:write",
				(c) =>
					c.deposits.recordRetention({
						amountCents: 100,
						rentalNumber: "LOC-0026",
						reason: "Sem acesso",
						idempotencyKey: newKey(),
					}),
			],
			[
				"ledger.list",
				"money:read",
				(c) => c.ledger.list({ ...period, account: "CASH" }),
			],
			[
				"ledger.create",
				"money:write",
				(c) => c.ledger.create({ ...entry, idempotencyKey: newKey() }),
			],
			[
				"ledger.reverse",
				"money:write",
				(c) =>
					c.ledger.reverse({
						entryId: "qualquer",
						reason: "Sem acesso",
						idempotencyKey: newKey(),
					}),
			],
			[
				"ledger.exportCsv",
				"money:read",
				(c) => c.ledger.exportCsv({ month: TODAY.slice(0, 7) }),
			],
			["ledger.byCategory", "money:read", (c) => c.ledger.byCategory(period)],
			["ledger.receivables", "money:read", (c) => c.ledger.receivables()],
			[
				"ledger.depositSummary",
				"money:read",
				(c) => c.ledger.depositSummary(period),
			],
			["maintenance.list", "maintenance:read", (c) => c.maintenance.list()],
			[
				"maintenance.open",
				"maintenance:write",
				(c) =>
					c.maintenance.open({
						unitCode: "MAR-003",
						reason: "Sem acesso",
						location: "BASE",
						locationName: null,
						estimatedCostCents: null,
						expectedBackAt: null,
					}),
			],
			[
				"maintenance.complete",
				"maintenance:write",
				(c) =>
					c.maintenance.complete({
						number: "OS-004",
						finalCostCents: 4500,
						method: "PIX",
						unitStatusAfter: "AVAILABLE",
					}),
			],
			[
				"settings.update",
				"settings:manage",
				(c) => c.settings.update({ signalDeadlineHours: 24 }),
			],
		];
		return calls.map(([procedure, permission, call]) => ({
			procedure,
			permission,
			call,
		}));
	}

	describe("permissão por procedimento", () => {
		it("todo procedimento restrito está na tabela de permissões", () => {
			const restricted = restrictedCalls().map((entry) => entry.procedure);
			const all = Object.entries(contract).flatMap(([module, procedures]) =>
				Object.keys(procedures).map((name) => `${module}.${name}`),
			);
			const uncovered = all.filter(
				(name) =>
					!restricted.includes(name) && !OPEN_TO_EVERY_ROLE.includes(name),
			);
			expect(uncovered).toEqual([]);
		});

		it("papel sem permissão recebe FORBIDDEN em cada procedimento restrito", async () => {
			const unexpected: string[] = [];
			for (const { procedure, permission, call } of restrictedCalls()) {
				const allowed = PERMISSIONS[permission] as readonly Role[];
				for (const role of ROLES.filter((entry) => !allowed.includes(entry))) {
					const error = await errorOf(call(clientAs(role)));
					if (error.code !== "FORBIDDEN") {
						unexpected.push(`${procedure} como ${role}: ${error.code}`);
					}
				}
			}
			expect(unexpected).toEqual([]);
		});
	});

	describe("caução retida", () => {
		it("lança saída na caução e entrada no caixa, ligadas", async () => {
			const manager = clientAs("MANAGER");
			await manager.deposits.recordRetention({
				rentalNumber: "LOC-0026",
				amountCents: 8000,
				reason: "Disco quebrado",
				idempotencyKey: newKey(),
			});
			const description = "Caução retida da LOC-0026: Disco quebrado";
			const cash = (
				await manager.ledger.list({ ...range, account: "CASH" })
			).entries.find((item) => item.description === description);
			const deposit = (
				await manager.ledger.list({ ...range, account: "DEPOSIT" })
			).entries.find((item) => item.description === description);
			expect(cash).toMatchObject({
				direction: "IN",
				category: "DEPOSIT_RETAINED",
				amountCents: 8000,
			});
			expect(deposit).toMatchObject({
				direction: "OUT",
				category: "DEPOSIT_TO_CASH",
				amountCents: 8000,
			});
		});
	});

	describe("idempotência em paralelo", () => {
		it("a mesma chave em duas requisições ao mesmo tempo lança uma vez só", async () => {
			const client = clientAs("MANAGER");
			const input = {
				direction: "OUT" as const,
				category: "FUEL" as const,
				amountCents: 5000,
				occurredAt: day(0, "09:00"),
				method: "CASH" as const,
				description: "Combustível em dobro",
				rentalNumber: null,
				unitCode: null,
				receiptFileKey: null,
				idempotencyKey: newKey(),
			};
			const [first, second] = await Promise.all([
				client.ledger.create(input),
				client.ledger.create(input),
			]);
			expect(second.id).toBe(first.id);
			const { outCents } = await client.dashboard.summary(range);
			expect(outCents).toBe(61000 + 5000);
		});
	});
}
