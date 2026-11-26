import {
	type AppClient,
	CalendarDay,
	CustomerKind,
	CustomerOrigin,
	CustomerSegment,
	DeliveryMode,
	Id,
	IsoDateTime,
	ItemCode,
	ItemKind,
	LedgerAccount,
	LedgerCategory,
	LedgerDirection,
	type Lot,
	PaymentKind,
	PaymentMethod,
	RentalNumber,
	UnitStatus,
} from "@marinho-gestao/contract";
import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import type { Mode } from "./config";
import {
	businessDay,
	failure,
	idempotencyKey,
	ok,
	publicCustomer,
	publicCustomerDetail,
	publicLedgerEntry,
} from "./results";

export type ToolDeps = {
	api: AppClient;
	mode: Mode;
	apiUrl: string;
	now: () => Date;
	/** Envolve cada chamada (refaz o login se a sessão caiu). */
	call: <T>(run: () => Promise<T>) => Promise<T>;
	/** Registro de cada chamada, sem os argumentos (podem ter dados de cliente). */
	audit?: (entry: ToolAudit) => void;
};

export type ToolAudit = {
	tool: string;
	write: boolean;
	ok: boolean;
	error: string | null;
	durationMs: number;
};

type ToolDef<S extends z.ZodObject> = {
	name: string;
	title: string;
	description: string;
	input: S;
	/** Ferramentas que mudam dados só existem no modo `completo`. */
	write?: { destructive: boolean };
	run: (args: z.output<S>, deps: ToolDeps) => Promise<unknown>;
};

const dateTime = (what: string) =>
	IsoDateTime.describe(
		`${what}, ISO 8601 com fuso de Maceió. Ex.: 2026-12-01T08:00:00-03:00`,
	);
const rentalNumber = RentalNumber.describe("Número da locação, ex.: LOC-0012");
const cents = (what: string) =>
	z.number().int().describe(`${what}, em centavos (R$ 80,00 = 8000)`);

const noInput = z.object({});

/** Registra as ferramentas no servidor e devolve os nomes registrados. */
export function registerTools(server: McpServer, deps: ToolDeps): string[] {
	const names: string[] = [];

	function add<S extends z.ZodObject>(def: ToolDef<S>): void {
		if (def.write && deps.mode !== "completo") return;
		// O SDK já validou a entrada; o parse aqui devolve o tipo de cada
		// ferramenta sem cast, e o registro fica com o esquema genérico.
		const inputSchema: z.ZodObject = def.input;
		const handler = async (raw: unknown): Promise<CallToolResult> => {
			const started = performance.now();
			let result: CallToolResult;
			try {
				const args = def.input.parse(raw);
				result = ok(await deps.call(() => def.run(args, deps)));
			} catch (error) {
				result = failure(error);
			}
			deps.audit?.({
				tool: def.name,
				write: Boolean(def.write),
				ok: result.isError !== true,
				error: result.isError ? errorCode(result) : null,
				durationMs: Math.round(performance.now() - started),
			});
			return result;
		};
		server.registerTool(
			def.name,
			{
				title: def.title,
				description: def.description,
				inputSchema,
				annotations: {
					title: def.title,
					readOnlyHint: !def.write,
					destructiveHint: def.write?.destructive ?? false,
					openWorldHint: false,
				},
			},
			handler,
		);
		names.push(def.name);
	}

	// ── Consultas ────────────────────────────────────────────────────────────

	add({
		name: "conferir_conexao",
		title: "Conferir conexão",
		description:
			"Confere se o MCP está conectado ao sistema e com qual usuário e papel. Use quando outra ferramenta der erro de login.",
		input: noInput,
		run: async (_args, { api, mode, apiUrl }) => {
			const session = await api.session.me();
			return {
				api: apiUrl,
				modo: mode,
				usuario: session.user.username,
				nome: session.user.name,
				papel: session.user.role,
				sessaoExpiraEm: session.expiresAt,
			};
		},
	});

	add({
		name: "resumo_do_dia",
		title: "Resumo do dia",
		description:
			"O painel de hoje: locações atrasadas, o que sai e o que volta hoje, orçamentos esperando sinal, andaimes livres e unidades por status.",
		input: noInput,
		run: (_args, { api }) => api.dashboard.today(),
	});

	add({
		name: "verificar_disponibilidade",
		title: "Verificar disponibilidade",
		description:
			"Para cada unidade e lote no período: se está livre; a locação que atrapalha (número, cliente, cidade, saída e devolução); até quando dá para ficar saindo na data pedida (freeUntil, já com a folga); a partir de quando fica livre (freeFrom); e a próxima locação marcada (nextBooking). Para andaime e carrocinha, passe quantity.",
		input: z.object({
			start: dateTime("Saída"),
			end: dateTime("Devolução"),
			query: z
				.string()
				.optional()
				.describe(
					"Filtro por nome, apelido ou código. Ex.: martelete, MAR-002, andaime",
				),
			typeId: Id.optional().describe(
				"Filtra por tipo (id vindo de tabela_de_precos)",
			),
			quantity: z
				.number()
				.int()
				.min(1)
				.optional()
				.describe(
					"Peças pedidas, para andaime e carrocinha (padrão 1). Não vale para unidades MAR-xxx",
				),
		}),
		run: (args, { api }) => api.availability.search(args),
	});

	add({
		name: "agenda",
		title: "Agenda dos equipamentos",
		description:
			"Grade dia a dia de cada unidade e lote: livre, alugado, reservado, esperando sinal, vistoria, manutenção, atrasado ou bloqueado.",
		input: z.object({
			start: CalendarDay.describe("Primeiro dia, AAAA-MM-DD"),
			days: z
				.number()
				.int()
				.min(1)
				.max(31)
				.default(7)
				.describe("Quantos dias mostrar (1 a 31)"),
		}),
		run: (args, { api }) => api.availability.calendar(args),
	});

	add({
		name: "listar_equipamentos",
		title: "Listar equipamentos",
		description:
			"Unidades do estoque (MAR-xxx) com status e onde estão agora (na base, com cliente, em manutenção…), e os lotes (andaime e carrocinha) com o que está livre hoje.",
		input: z.object({
			status: UnitStatus.optional().describe("Só unidades neste status"),
			q: z.string().optional().describe("Busca por nome, apelido ou código"),
		}),
		run: async (args, { api }) => {
			const [units, lots] = await Promise.all([
				api.equipment.listUnits(args),
				args.status ? Promise.resolve([]) : api.equipment.listLots(),
			]);
			return {
				unidades: units.units.map((unit) => ({
					code: unit.code,
					name: unit.name,
					typeName: unit.typeName,
					status: unit.status,
					statusReason: unit.statusReason,
					location: unit.location,
					dailyPriceCents: unit.dailyPriceCents,
					depositCents: unit.depositCents,
					voltage: unit.voltage,
					accessories: unit.accessories,
					owner: unit.owner,
				})),
				contagemPorStatus: units.counts,
				totalDeUnidades: units.total,
				lotes: lots.filter((lot) => matchesLot(lot, args.q)).map(lotSummary),
			};
		},
	});

	add({
		name: "tabela_de_precos",
		title: "Tabela de preços",
		description:
			"Tipos de equipamento com diária, caução, folga entre locações e acessórios, e os lotes (andaime por peça, carrocinha). Valores nulos ainda não foram definidos.",
		input: noInput,
		run: async (_args, { api }) => {
			const [types, lots] = await Promise.all([
				api.equipment.listTypes(),
				api.equipment.listLots(),
			]);
			return {
				tipos: types.map((type) => ({
					id: type.id,
					name: type.name,
					nicknames: type.nicknames,
					dailyPriceCents: type.dailyPriceCents,
					depositCents: type.depositCents,
					turnaroundHours: type.turnaroundHours,
					accessories: type.accessories,
					unitCount: type.unitCount,
				})),
				lotes: lots.map(lotSummary),
			};
		},
	});

	add({
		name: "listar_locacoes",
		title: "Listar locações",
		description:
			"Locações abertas (orçamento, esperando sinal, confirmada, separada, na obra, devolvida) ou encerradas, com cliente, equipamentos, período e total.",
		input: z.object({
			tab: z
				.enum(["OPEN", "CLOSED"])
				.default("OPEN")
				.describe("OPEN = abertas; CLOSED = encerradas, canceladas e vencidas"),
			q: z
				.string()
				.optional()
				.describe("Busca por número, cliente ou equipamento"),
		}),
		run: (args, { api }) => api.rentals.list(args),
	});

	add({
		name: "ver_locacao",
		title: "Ver locação",
		description:
			"Tudo de uma locação: itens, valores, pagamentos, sinal, caução, saldo, ocorrências, pendências de vistoria e histórico.",
		input: z.object({ number: rentalNumber }),
		run: (args, { api }) => api.rentals.get(args),
	});

	add({
		name: "texto_do_orcamento",
		title: "Texto do orçamento",
		description:
			"O texto do orçamento pronto para mandar no WhatsApp, igual ao botão Copiar do sistema.",
		input: z.object({ number: rentalNumber }),
		run: (args, { api }) => api.rentals.copyQuoteText(args),
	});

	add({
		name: "simular_prorrogacao",
		title: "Simular prorrogação",
		description:
			"Mostra se dá para prorrogar até a nova data (conflitos com outras reservas), quantas diárias a mais e a diferença de valor. Não muda nada.",
		input: z.object({
			number: rentalNumber,
			newEndAt: dateTime("Nova devolução"),
		}),
		run: (args, { api }) => api.rentals.previewExtend(args),
	});

	add({
		name: "buscar_clientes",
		title: "Buscar clientes",
		description:
			"Clientes com WhatsApp, cidade, profissão, situação (novo, recorrente, de confiança, atenção, bloqueado), números de locações, atrasos, saldo em aberto e documentos que faltam. CPF/CNPJ e endereço não saem do sistema.",
		input: z.object({
			q: z.string().optional().describe("Nome, WhatsApp ou cidade"),
			segment: CustomerSegment.optional().describe(
				"ALL, PROFESSIONALS, HOME_RENOVATION ou ATTENTION",
			),
		}),
		run: async (args, { api }) => {
			const result = await api.customers.list(args);
			return {
				clientes: result.customers.map(publicCustomer),
				contagem: result.counts,
			};
		},
	});

	add({
		name: "ver_cliente",
		title: "Ver cliente",
		description:
			"Ficha do cliente com as locações dele e quais documentos já foram recebidos (sem os arquivos, sem CPF/CNPJ e sem endereço).",
		input: z.object({
			id: Id.describe("Id do cliente, vindo de buscar_clientes"),
		}),
		run: async (args, { api }) =>
			publicCustomerDetail(await api.customers.get(args)),
	});

	add({
		name: "resumo_financeiro",
		title: "Resumo financeiro",
		description:
			"No período: entradas, saídas e resultado do caixa, totais por categoria, movimento da caução e o que falta receber hoje (saldos, atrasos e cobranças).",
		input: z.object({
			from: dateTime("Início do período"),
			to: dateTime("Fim do período"),
		}),
		run: async (args, { api }) => {
			const [caixa, porCategoria, caucao, aReceber] = await Promise.all([
				api.dashboard.summary(args),
				api.ledger.byCategory(args),
				api.ledger.depositSummary(args),
				api.ledger.receivables(),
			]);
			return { caixa, porCategoria, caucao, aReceber };
		},
	});

	add({
		name: "lancamentos_do_caixa",
		title: "Lançamentos do caixa",
		description:
			"Lançamentos do caixa (CASH) ou da caução (DEPOSIT) no período, com totais. Estornos aparecem como lançamentos próprios.",
		input: z.object({
			account: LedgerAccount.default("CASH").describe(
				"CASH = caixa; DEPOSIT = caução",
			),
			from: dateTime("Início do período"),
			to: dateTime("Fim do período"),
		}),
		run: async (args, { api }) => {
			const result = await api.ledger.list(args);
			return {
				lancamentos: result.entries.map(publicLedgerEntry),
				inCents: result.inCents,
				outCents: result.outCents,
				resultCents: result.resultCents,
			};
		},
	});

	add({
		name: "demanda_perdida",
		title: "Demanda perdida",
		description:
			"Pedidos que não viraram locação (equipamento que não temos, ocupado, cidade fora da área…), agrupados por item e motivo.",
		input: z.object({
			from: dateTime("Início do período").optional(),
			to: dateTime("Fim do período").optional(),
		}),
		run: (args, { api }) =>
			api.rentals.listLostDemand(
				args.from && args.to ? { from: args.from, to: args.to } : undefined,
			),
	});

	// ── Operações (modo completo) ────────────────────────────────────────────

	add({
		name: "cadastrar_cliente",
		title: "Cadastrar cliente",
		description:
			"Cadastra um cliente novo. CPF/CNPJ, endereço e documentos ficam para a tela do sistema. Antes, procure com buscar_clientes para não duplicar.",
		input: z.object({
			kind: CustomerKind.describe(
				"INDIVIDUAL (pessoa física), PROFESSIONAL (pedreiro, pintor…) ou COMPANY",
			),
			name: z.string().min(2),
			whatsapp: z.string().min(8).describe("Com DDD, ex.: 82999990000"),
			city: z.string().min(2),
			neighborhood: z.string().nullable().default(null),
			occupation: z.string().nullable().default(null),
			origin: CustomerOrigin.nullable()
				.default(null)
				.describe("INSTAGRAM, GOOGLE, REFERRAL ou PARTNER_STORE"),
			referredBy: z.string().nullable().default(null),
			responsible: z
				.string()
				.nullable()
				.default(null)
				.describe("Responsável, para empresa"),
			authorizedReceivers: z
				.array(z.string().min(1))
				.default([])
				.describe("Quem pode receber o equipamento"),
			alternatePhone: z.string().nullable().default(null),
			acceptsPromotions: z.boolean().default(false),
			notes: z.string().nullable().default(null),
		}),
		write: { destructive: false },
		run: async (args, { api }) =>
			publicCustomer(
				await api.customers.create({ ...args, taxId: null, address: null }),
			),
	});

	add({
		name: "criar_orcamento",
		title: "Criar orçamento",
		description:
			"Cria um orçamento. Confira antes com verificar_disponibilidade. Unidade (MAR-xxx): kind UNIT e quantity 1. Andaime (ANDAIME) e carrocinha (CARROCINHA): kind LOT, com a quantidade de peças. Com send=true o orçamento já vai como enviado: o sistema confere conflito, segura a agenda e abre o prazo do sinal. Com send=false fica como rascunho, que não segura a agenda nem confere conflito (o conflito aparece ao enviar).",
		input: z.object({
			customerId: Id.describe("Id do cliente, vindo de buscar_clientes"),
			startAt: dateTime("Saída"),
			endAt: dateTime("Devolução"),
			items: z
				.array(
					z.object({
						kind: ItemKind,
						code: ItemCode,
						quantity: z.number().int().positive().default(1),
					}),
				)
				.min(1),
			deliveryMode: DeliveryMode.describe(
				"DELIVERY (a gente leva) ou PICKUP (cliente busca)",
			),
			siteAddress: z.string().nullable().default(null),
			siteCity: z.string().nullable().default(null),
			sitePinUrl: z
				.string()
				.nullable()
				.default(null)
				.describe("Link do pino no mapa"),
			deliveryFeeCents: cents("Taxa de entrega")
				.nonnegative()
				.nullable()
				.default(null)
				.describe("Taxa de entrega em centavos; null = a definir"),
			discountCents: cents("Desconto").nonnegative().default(0),
			notes: z.string().nullable().default(null),
			send: z.boolean().default(false),
		}),
		write: { destructive: false },
		run: (args, { api }) => api.rentals.createQuote(args),
	});

	add({
		name: "registrar_locacao_feita",
		title: "Registrar locação que já aconteceu",
		description:
			"Registra uma locação que já aconteceu e cujo equipamento já voltou: período no passado, valor combinado (por exemplo, meia diária) e o pagamento recebido. Não passa por vistoria nem caução. Use só quando a pessoa disser que o equipamento já foi devolvido. Para locação futura, use criar_orcamento.",
		input: z.object({
			customerId: Id.describe("Id do cliente, vindo de buscar_clientes"),
			items: z
				.array(
					z.object({
						kind: ItemKind,
						code: ItemCode,
						quantity: z.number().int().positive().default(1),
					}),
				)
				.min(1)
				.describe(
					"Unidade (MAR-xxx): kind UNIT. Andaime (ANDAIME) e carrocinha (CARROCINHA): kind LOT, com a quantidade de peças",
				),
			startAt: dateTime("Saída"),
			endAt: dateTime("Devolução, já no passado"),
			deliveryMode: DeliveryMode.describe(
				"DELIVERY (a gente levou) ou PICKUP (cliente buscou)",
			),
			siteCity: z.string().nullable().default(null),
			deliveryFeeCents: cents("Taxa de entrega")
				.nonnegative()
				.nullable()
				.default(null)
				.describe("Taxa de entrega em centavos; null = a definir"),
			agreedTotalCents: cents("Valor combinado")
				.nonnegative()
				.nullable()
				.default(null)
				.describe(
					"Valor combinado com o cliente, em centavos; null = total pela tabela. Não pode passar do total pela tabela. Ex.: meia diária da carrocinha = 4000",
				),
			payment: z
				.object({
					amountCents: cents("Valor recebido").positive(),
					method: PaymentMethod.describe("PIX ou CASH (dinheiro)"),
					paidAt: dateTime("Quando foi pago (padrão: a devolução)").optional(),
				})
				.nullable()
				.default(null)
				.describe("O que o cliente já pagou; null = ainda não pagou"),
			notes: z.string().nullable().default(null),
			reference: z
				.string()
				.optional()
				.describe("Só para diferenciar dois registros iguais no mesmo dia"),
		}),
		write: { destructive: false },
		run: ({ reference, payment, ...rental }, { api, now }) => {
			const input = {
				...rental,
				payment: payment
					? { ...payment, paidAt: payment.paidAt ?? rental.endAt }
					: null,
			};
			return api.rentals.recordCompleted({
				...input,
				idempotencyKey: idempotencyKey(
					"registrar_locacao_feita",
					{ ...input, reference: reference ?? null },
					businessDay(now()),
				),
			});
		},
	});

	add({
		name: "enviar_orcamento",
		title: "Marcar orçamento como enviado",
		description:
			"Marca um orçamento em rascunho como enviado ao cliente: segura a agenda e abre o prazo do sinal.",
		input: z.object({ number: rentalNumber }),
		write: { destructive: false },
		run: (args, { api }) => api.rentals.sendQuote(args),
	});

	add({
		name: "registrar_pagamento",
		title: "Registrar pagamento",
		description:
			"Lança um pagamento da locação no caixa: SIGNAL (sinal), BALANCE (saldo), DELIVERY_FEE (entrega), CONSUMABLE (consumível) ou EXTRA_DAILY (diária extra). Caução não entra aqui. Repetir a mesma chamada no mesmo dia não lança duas vezes; para dois pagamentos iguais no mesmo dia, mude reference.",
		input: z.object({
			number: rentalNumber,
			kind: PaymentKind,
			amountCents: cents("Valor pago").positive(),
			method: PaymentMethod.describe("PIX ou CASH (dinheiro)"),
			paidAt: dateTime("Quando foi pago (padrão: agora)").optional(),
			reference: z
				.string()
				.optional()
				.describe("Só para diferenciar dois pagamentos iguais no mesmo dia"),
		}),
		write: { destructive: false },
		run: ({ reference, ...payment }, { api, now }) =>
			api.rentals.recordPayment({
				...payment,
				receiptFileKey: null,
				idempotencyKey: idempotencyKey(
					"registrar_pagamento",
					{ ...payment, reference: reference ?? null },
					businessDay(now()),
				),
			}),
	});

	add({
		name: "confirmar_locacao",
		title: "Confirmar locação",
		description: "Confirma a locação depois que o sinal foi pago.",
		input: z.object({ number: rentalNumber }),
		write: { destructive: false },
		run: (args, { api }) => api.rentals.confirm(args),
	});

	add({
		name: "prorrogar_locacao",
		title: "Prorrogar locação",
		description:
			"Muda a devolução para a nova data. Use simular_prorrogacao antes para ver conflito e diferença de valor.",
		input: z.object({
			number: rentalNumber,
			newEndAt: dateTime("Nova devolução"),
		}),
		write: { destructive: false },
		run: (args, { api }) => api.rentals.extend(args),
	});

	add({
		name: "cancelar_locacao",
		title: "Cancelar locação",
		description: "Cancela a locação e libera a agenda. Não dá para desfazer.",
		input: z.object({
			number: rentalNumber,
			reason: z.string().min(3).describe("Motivo do cancelamento"),
		}),
		write: { destructive: true },
		run: (args, { api }) => api.rentals.cancel(args),
	});

	add({
		name: "encerrar_locacao",
		title: "Encerrar locação",
		description:
			"Encerra uma locação devolvida, com a caução já devolvida ou retida. Não dá para desfazer.",
		input: z.object({ number: rentalNumber }),
		write: { destructive: true },
		run: (args, { api }) => api.rentals.close(args),
	});

	add({
		name: "registrar_demanda_perdida",
		title: "Registrar demanda perdida",
		description:
			"Registra um pedido que não virou locação, para saber o que comprar ou onde atender.",
		input: z.object({
			item: z.string().min(2).describe("O que foi pedido"),
			typeId: Id.nullable()
				.default(null)
				.describe("Tipo, se for um equipamento que temos"),
			reason: z
				.string()
				.min(2)
				.describe("Ex.: não temos, ocupado, cidade fora da área, preço"),
			city: z.string().nullable().default(null),
			requestedOn: CalendarDay.optional().describe(
				"Dia do pedido, AAAA-MM-DD (padrão: hoje)",
			),
		}),
		write: { destructive: false },
		run: (args, { api, now }) =>
			api.rentals.recordLostDemand({
				...args,
				requestedOn: args.requestedOn ?? businessDay(now()),
			}),
	});

	add({
		name: "lancar_no_caixa",
		title: "Lançar no caixa",
		description:
			"Lança uma entrada ou saída avulsa no caixa (não é pagamento de locação). Entradas: RENTAL, DELIVERY, CONSUMABLE_SOLD, EXTRA_FEES, OTHER_IN. Saídas: EQUIPMENT_PURCHASE, MAINTENANCE, FUEL, ADVERTISING, CONSUMABLE_BOUGHT, OTHER_OUT. Lançamento não se edita: erro se corrige com estorno, pela tela do sistema.",
		input: z.object({
			direction: LedgerDirection.describe("IN = entrada; OUT = saída"),
			category: LedgerCategory,
			amountCents: cents("Valor").positive(),
			method: PaymentMethod.describe("PIX ou CASH (dinheiro)"),
			description: z.string().min(3),
			occurredAt: dateTime("Quando aconteceu (padrão: agora)").optional(),
			rentalNumber: RentalNumber.nullable().default(null),
			unitCode: ItemCode.nullable()
				.default(null)
				.describe("Unidade ligada ao gasto, ex.: MAR-004"),
			reference: z
				.string()
				.optional()
				.describe("Só para diferenciar dois lançamentos iguais no mesmo dia"),
		}),
		write: { destructive: false },
		run: async ({ reference, ...entry }, { api, now }) => {
			const occurredAt = entry.occurredAt ?? now().toISOString();
			const created = await api.ledger.create({
				...entry,
				occurredAt,
				receiptFileKey: null,
				idempotencyKey: idempotencyKey(
					"lancar_no_caixa",
					{ ...entry, reference: reference ?? null },
					businessDay(now()),
				),
			});
			return publicLedgerEntry(created);
		},
	});

	return names;
}

function errorCode(result: CallToolResult): string {
	const first = result.content[0];
	if (first?.type !== "text") return "FALHA";
	try {
		const parsed = JSON.parse(first.text) as { erro?: unknown };
		return typeof parsed.erro === "string" ? parsed.erro : "FALHA";
	} catch {
		return "FALHA";
	}
}

function lotSummary(lot: Lot) {
	return {
		code: lot.code,
		name: lot.name,
		pricing: lot.pricing,
		dailyPriceCents: lot.dailyPriceCents,
		depositCents: lot.depositCents,
		total: lot.total,
		inMaintenance: lot.inMaintenance,
		retired: lot.retired,
		freeToday: lot.freeToday,
		reservedToday: lot.reservedToday,
		nextBooking: lot.nextBooking,
		kitComposition: lot.kitComposition,
		turnaroundHours: lot.turnaroundHours,
	};
}

function matchesLot(lot: Lot, query: string | undefined): boolean {
	if (!query) return true;
	const needle = query.trim().toLowerCase();
	return [lot.code, lot.name, ...lot.nicknames].some((value) =>
		value.toLowerCase().includes(needle),
	);
}
