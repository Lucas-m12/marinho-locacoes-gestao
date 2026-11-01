import type { ChecklistTemplateItem } from "@marinho-gestao/contract";
import {
	addCalendarDays,
	addHours,
	calendarDay,
	type LedgerCategory,
	type LedgerDirection,
	type OccurrenceKind,
	type PaymentKind,
	type PaymentMethod,
	type RentalStatus,
	type Role,
	toMs,
	zonedTimeToIso,
} from "@marinho-gestao/domain";
import type {
	CustomerRecord,
	DepositRecord,
	InspectionRecord,
	LedgerRecord,
	LotRecord,
	MaintenanceRecord,
	MockDb,
	PaymentRecord,
	RentalEventRecord,
	RentalItemRecord,
	RentalRecord,
	TypeRecord,
	UnitRecord,
	UserRecord,
} from "./db";

const PLACEHOLDER_FILE_PREFIX = "seed/";
export const isSeedFile = (fileKey: string) =>
	fileKey.startsWith(PLACEHOLDER_FILE_PREFIX);

const check = (
	id: string,
	label: string,
	note: string,
	occurrenceKind: OccurrenceKind = "DAMAGE",
): ChecklistTemplateItem => ({ id, label, note, occurrenceKind });

const ACCESSORIES = check(
	"acessorios",
	"Acessórios",
	"Conferidos e na maleta",
	"MISSING_PART",
);
const CLEAN = check(
	"limpo",
	"Limpo",
	"Sem pó de concreto ou argamassa",
	"DIRT",
);
const TURNS_ON = check(
	"liga",
	"Liga e funciona",
	"Testado na frente do cliente",
);
const BODY = check("carcaca", "Carcaça", "Sem trinca ou peça solta");

function corded(test: ChecklistTemplateItem): ChecklistTemplateItem[] {
	return [
		TURNS_ON,
		test,
		check("cabo", "Cabo sem emenda ou corte", "Conferir perto do plugue"),
		check("plugue", "Plugue inteiro", "Pinos firmes, sem queimado"),
		BODY,
		ACCESSORIES,
		CLEAN,
	];
}

function battery(test: ChecklistTemplateItem): ChecklistTemplateItem[] {
	return [
		TURNS_ON,
		test,
		check("bateria", "Bateria carregada", "Carga completa na saída"),
		check("carregador", "Carregador", "Liga e carrega", "MISSING_PART"),
		BODY,
		ACCESSORIES,
		CLEAN,
	];
}

const HAMMER_CHECKLIST: ChecklistTemplateItem[] = [
	TURNS_ON,
	check("rompe", "Rompe com força normal", "Teste curto em bloco de concreto"),
	check("cabo", "Cabo sem emenda ou corte", "Conferir perto do plugue"),
	check("plugue", "Plugue inteiro", "Pinos firmes, sem queimado"),
	BODY,
	check("maleta", "Maleta fecha", "Travas funcionando"),
	ACCESSORIES,
	CLEAN,
];

const type = (
	id: string,
	name: string,
	dailyReais: number | null,
	checklist: ChecklistTemplateItem[],
	extra: Partial<TypeRecord> = {},
): TypeRecord => ({
	id,
	name,
	nicknames: [],
	description: null,
	dailyPriceCents: dailyReais === null ? null : dailyReais * 100,
	depositCents: null,
	turnaroundHours: 12,
	accessories: null,
	checklist,
	...extra,
});

const runTest = check("gira", "Gira sem folga", "Sem barulho estranho");
const cutTest = check("corte", "Corta reto", "Disco ou lâmina firme");

function buildTypes(): TypeRecord[] {
	return [
		type(
			"t-martelete",
			"Martelete 2 kg",
			80,
			corded(check("fura", "Fura e rompe", "Teste curto em concreto")),
			{
				description: "Fura e quebra concreto · SDS-plus",
			},
		),
		type("t-demolidor", "Martelo demolidor 5 kg", 100, HAMMER_CHECKLIST, {
			nicknames: ["rompedor", "demolidor"],
			description: "Quebra piso e parede",
		}),
		type(
			"t-furadeira",
			"Furadeira de impacto",
			30,
			corded(check("impacto", "Impacto funcionando", "Teste em alvenaria")),
			{
				nicknames: ["furadeira"],
			},
		),
		type(
			"t-parafusadeira",
			"Parafusadeira a bateria 21 V",
			null,
			battery(check("torque", "Torque funcionando", "Teste em madeira")),
		),
		type(
			"t-esmerilhadeira",
			"Esmerilhadeira 4 1/2",
			50,
			corded(check("disco", "Disco firme", "Proteção no lugar")),
			{
				nicknames: ["lixadeira de disco"],
			},
		),
		type("t-serra-marmore", "Serra mármore", 40, corded(cutTest), {
			nicknames: ["maquita", "makita"],
		}),
		type("t-serra-circular-7", "Serra circular 7 1/4", 60, corded(cutTest)),
		type(
			"t-serra-circular-1100",
			"Serra circular 1.100 W",
			40,
			corded(cutTest),
		),
		type("t-tico-tico", "Serra tico-tico", 40, corded(cutTest)),
		type("t-plaina", "Plaina elétrica", null, corded(runTest)),
		type("t-tupia", "Tupia laminadora 800 W", 40, corded(runTest)),
		type("t-lixadeira", "Lixadeira roto-orbital", 40, corded(runTest)),
		type(
			"t-pistola",
			"Pistola de pintura a bateria",
			50,
			battery(check("jato", "Jato uniforme", "Teste com água")),
		),
		type(
			"t-solda",
			"Máquina de solda",
			null,
			corded(check("arco", "Abre arco", "Teste com eletrodo")),
		),
		type(
			"t-aspirador",
			"Aspirador de pó e água",
			40,
			corded(check("suga", "Suga com força", "Sem furo na mangueira")),
		),
	];
}

const unit = (
	code: string,
	typeId: string,
	name: string,
	shortName: string,
	extra: Partial<UnitRecord> = {},
): UnitRecord => ({
	id: `u-${code}`,
	code,
	typeId,
	name,
	shortName,
	status: "AVAILABLE",
	statusReason: null,
	voltage: null,
	serialNumber: null,
	accessories: null,
	owner: null,
	labelApplied: true,
	purchaseValueCents: null,
	replacementValueCents: null,
	notes: null,
	returnedAt: null,
	photos: [],
	knownDamages: [],
	...extra,
});

const USERS: UserRecord[] = [
	{
		id: "user-lucas",
		name: "Lucas",
		email: "lucas@marinho.local",
		role: "MANAGER",
		password: "marinho123",
	},
	{
		id: "user-atendimento",
		name: "Esposa",
		email: "atendimento@marinho.local",
		role: "ATTENDANT",
		password: "marinho123",
	},
	{
		id: "user-equipamentos",
		name: "Pai",
		email: "equipamentos@marinho.local",
		role: "EQUIPMENT",
		password: "marinho123",
	},
];

const ACTOR: Record<Role, string> = {
	MANAGER: "Lucas",
	ATTENDANT: "Esposa",
	EQUIPMENT: "Pai",
};

const DELIVERY_CITIES = [
	"Cajueiro",
	"Capela",
	"Viçosa",
	"Chã Preta",
	"Paulo Jacinto",
	"Mar Vermelho",
	"Maribondo",
	"Pindoba",
	"Atalaia",
	"Pilar",
	"Murici",
];

const PIECE_CHECKS = [
	check(
		"contagem",
		"Peças contadas",
		"Quantidade igual à da locação",
		"MISSING_PART",
	),
	check("encaixes", "Encaixes e travas", "Sem folga, travas firmes"),
	check("estrutura", "Sem amassado ou trinca", "Conferir os tubos"),
	check("limpo", "Limpo", "Sem massa ou tinta seca", "DIRT"),
];

const TRAILER_CHECKS = [
	check("pneus", "Pneus calibrados", "Sem corte ou bolha"),
	check("engate", "Engate e trava", "Trava fecha sem folga"),
	check("carroceria", "Carroceria", "Sem amassado novo"),
	check("limpo", "Limpa", "Sem entulho", "DIRT"),
];

function buildLots(): LotRecord[] {
	return [
		{
			id: "lot-andaime",
			code: "ANDAIME",
			name: "Andaime",
			nicknames: ["andaimes"],
			pricing: "PER_PIECE",
			total: 20,
			inMaintenance: 0,
			retired: 0,
			dailyPriceCents: 200,
			depositCents: null,
			kitComposition: null,
			assetCode: null,
			turnaroundHours: 12,
			checklist: PIECE_CHECKS,
		},
		{
			id: "lot-carrocinha",
			code: "CARROCINHA",
			name: "Carrocinha",
			nicknames: ["reboque", "carretinha"],
			pricing: "PER_LOT",
			total: 1,
			inMaintenance: 0,
			retired: 0,
			dailyPriceCents: 8000,
			depositCents: null,
			kitComposition: null,
			assetCode: null,
			turnaroundHours: 12,
			checklist: TRAILER_CHECKS,
		},
	];
}

const emptyDeposit: DepositRecord = {
	receivedCents: 0,
	receivedAt: null,
	receivedMethod: null,
	refundedCents: 0,
	refundedAt: null,
	refundedMethod: null,
	retainedCents: 0,
	retentionReason: null,
	retainedAt: null,
};

export function buildSeed(now: Date): MockDb {
	const today = calendarDay(now);
	const day = (offset: number, time = "08:00") =>
		zonedTimeToIso(addCalendarDays(today, offset), time);

	const returnsToday = (time: string, hoursFromNow: number) => {
		const stillOpen = Math.max(
			toMs(day(0, time)),
			addHours(now, hoursFromNow).getTime(),
		);
		return new Date(Math.min(stillOpen, toMs(day(0, "23:59")))).toISOString();
	};

	const customerBase = {
		responsible: null,
		authorizedReceivers: [],
		alternatePhone: null,
		neighborhood: null,
		referredBy: null,
		acceptsPromotions: true,
		blockedManually: false,
		blockReason: null,
	};

	const documents = (id: string, receivedAt: string) =>
		(["PHOTO_ID", "TAX_ID", "PROOF_OF_ADDRESS"] as const).map((kind) => ({
			id: `doc-${id}-${kind}`,
			kind,
			receivedAt,
			fileKey: `${PLACEHOLDER_FILE_PREFIX}${id}-${kind}`,
		}));

	const customer = (
		id: string,
		name: string,
		occupation: string,
		city: string,
		createdAt: string,
		phoneSuffix: string,
		extra: Partial<CustomerRecord> = {},
	): CustomerRecord => ({
		...customerBase,
		id,
		kind: "PROFESSIONAL",
		name,
		taxId: `000.000.0${phoneSuffix}-00`,
		whatsapp: `(82) 90000-${phoneSuffix}`,
		address: null,
		city,
		occupation,
		origin: null,
		notes: null,
		createdAt,
		documents: documents(id, createdAt),
		...extra,
	});

	const customers: CustomerRecord[] = [
		customer("c-jose", "José Carlos", "Pedreiro", "Capela", day(-18), "0001", {
			origin: "PARTNER_STORE",
			notes:
				"Prefere entrega cedo, antes das 7h. Costuma alugar para obras em Capela e Cajueiro.",
		}),
		customer(
			"c-antonio",
			"Antônio Ferreira",
			"Pequeno empreiteiro",
			"Cajueiro",
			day(-14),
			"0002",
			{
				origin: "REFERRAL",
			},
		),
		customer(
			"c-pedro",
			"Pedro Henrique",
			"Eletricista",
			"Cajueiro",
			day(-12),
			"0003",
			{
				origin: "INSTAGRAM",
			},
		),
		customer(
			"c-rafael",
			"Rafael Lima",
			"Encanador",
			"Atalaia",
			day(-15),
			"0004",
			{
				origin: "GOOGLE",
			},
		),
		customer("c-joao", "João Batista", "Pedreiro", "Pilar", day(-5), "0005", {
			origin: "REFERRAL",
		}),
		customer(
			"c-maria",
			"Maria do Carmo",
			"Reforma da casa",
			"Viçosa",
			day(-3),
			"0006",
			{
				kind: "INDIVIDUAL",
				origin: "INSTAGRAM",
			},
		),
		customer(
			"c-ana",
			"Ana Paula",
			"Reforma da casa",
			"Cajueiro",
			day(-21),
			"0007",
			{
				kind: "INDIVIDUAL",
				origin: "GOOGLE",
			},
		),
		customer("c-cicero", "Cícero Santos", "Pintor", "Viçosa", day(-1), "0008", {
			origin: "PARTNER_STORE",
			documents: [],
		}),
	];

	const units: UnitRecord[] = [
		unit(
			"MAR-001",
			"t-martelete",
			"Martelete Bosch GBH 2-28 D",
			"Martelete Bosch",
			{ status: "RENTED" },
		),
		unit(
			"MAR-002",
			"t-demolidor",
			"Martelo demolidor Bosch GSH 500",
			"Martelo demolidor",
			{
				status: "SEPARATED",
				notes: "Vai na maleta",
				knownDamages: [
					{
						id: "dano-mar-002",
						description: "Risco na lateral esquerda",
						recordedAt: day(-13),
						recordedBy: "Lucas",
						fileKey: null,
					},
				],
			},
		),
		unit(
			"MAR-003",
			"t-furadeira",
			"Furadeira de impacto DeWalt",
			"Furadeira DeWalt",
		),
		unit(
			"MAR-004",
			"t-furadeira",
			"Furadeira de impacto Black+Decker",
			"Furadeira Black+Decker",
		),
		unit(
			"MAR-005",
			"t-parafusadeira",
			"Parafusadeira a bateria The Black Tools 21 V",
			"Parafusadeira The Black Tools",
		),
		unit(
			"MAR-006",
			"t-esmerilhadeira",
			"Esmerilhadeira Bosch GWS 6-100",
			"Esmerilhadeira Bosch",
			{ status: "RENTED" },
		),
		unit(
			"MAR-007",
			"t-esmerilhadeira",
			"Esmerilhadeira Black+Decker",
			"Esmerilhadeira Black+Decker",
		),
		unit(
			"MAR-008",
			"t-serra-marmore",
			"Serra mármore Makita 4100NH3",
			"Serra mármore Makita",
			{ status: "RENTED" },
		),
		unit(
			"MAR-009",
			"t-serra-circular-7",
			"Serra circular Makita HS7010",
			"Serra circular Makita",
		),
		unit(
			"MAR-010",
			"t-serra-circular-1100",
			"Serra circular The Black Tools 1.100 W",
			"Serra circular 1.100 W",
			{
				status: "IN_INSPECTION",
				returnedAt: day(-1, "16:00"),
			},
		),
		unit("MAR-011", "t-tico-tico", "Serra tico-tico Wesco", "Serra tico-tico", {
			status: "IN_MAINTENANCE",
		}),
		unit(
			"MAR-012",
			"t-plaina",
			"Plaina elétrica Nakasaki NK2823B",
			"Plaina Nakasaki",
		),
		unit("MAR-013", "t-tupia", "Tupia laminadora 800 W", "Tupia laminadora"),
		unit(
			"MAR-014",
			"t-lixadeira",
			"Lixadeira roto-orbital Arstheco",
			"Lixadeira Arstheco",
		),
		unit(
			"MAR-015",
			"t-pistola",
			"Pistola de pintura a bateria Yankee Ferr",
			"Pistola de pintura",
		),
		unit(
			"MAR-016",
			"t-solda",
			"Máquina de solda Tork KAB 180 BV + máscara",
			"Máquina de solda Tork",
		),
		unit(
			"MAR-017",
			"t-aspirador",
			"Aspirador de pó e água WAP GTW Inox 12",
			"Aspirador WAP",
			{ status: "SEPARATED" },
		),
	];

	const types = buildTypes();
	const lots = buildLots();

	const priceOf = (code: string): number => {
		const lot = lots.find((entry) => entry.code === code);
		if (lot) return lot.dailyPriceCents ?? 0;
		const owner = units.find((entry) => entry.code === code);
		const unitType = types.find((entry) => entry.id === owner?.typeId);
		return unitType?.dailyPriceCents ?? 0;
	};

	let sequence = 0;
	const seedId = (prefix: string) => {
		sequence += 1;
		return `${prefix}-s${sequence}`;
	};

	const event = (
		at: string,
		message: string,
		role: Role | null = null,
	): RentalEventRecord => ({
		id: seedId("evt"),
		at,
		message,
		actorName: role ? ACTOR[role] : "Sistema",
		actorRole: role,
	});

	const payment = (
		kind: PaymentKind,
		reais: number,
		method: PaymentMethod,
		paidAt: string,
	): PaymentRecord => ({
		id: seedId("pay"),
		kind,
		amountCents: reais * 100,
		method,
		paidAt,
		recordedBy: ACTOR.ATTENDANT,
	});

	type RentalSeed = {
		number: string;
		customerId: string;
		status: RentalStatus;
		start: string;
		end: string;
		items: { code: string; quantity?: number }[];
		payments?: PaymentRecord[];
		deposit?: Partial<DepositRecord>;
		history?: RentalEventRecord[];
		createdAt?: string;
		siteCity?: string;
		deliveryFeeReais?: number;
		signalDueAt?: string;
		delivered?: string;
		returned?: string;
		receiverName?: string;
	};

	const delivered = (status: RentalStatus) =>
		status === "ON_SITE" || status === "RETURNED" || status === "CLOSED";
	const returned = (status: RentalStatus) =>
		status === "RETURNED" || status === "CLOSED";
	const frozen = (status: RentalStatus) =>
		status !== "QUOTE" && status !== "AWAITING_DEPOSIT";

	const rental = (seed: RentalSeed): RentalRecord => {
		const owner = customers.find((entry) => entry.id === seed.customerId);
		const deliveredAt = delivered(seed.status)
			? (seed.delivered ?? seed.start)
			: null;
		const returnedAt = returned(seed.status)
			? (seed.returned ?? seed.end)
			: null;
		const items = seed.items.map(
			(item): RentalItemRecord => ({
				id: seedId("item"),
				kind: item.code.startsWith("MAR") ? "UNIT" : "LOT",
				code: item.code,
				quantity: item.quantity ?? 1,
				frozenDailyPriceCents: frozen(seed.status) ? priceOf(item.code) : null,
				frozenDepositCents: null,
				checkoutDoneAt: deliveredAt,
				returnDoneAt: returnedAt,
			}),
		);
		return {
			id: `r-${seed.number}`,
			number: seed.number,
			status: seed.status,
			customerId: seed.customerId,
			startAt: seed.start,
			endAt: seed.end,
			items,
			deliveryMode: "DELIVERY",
			siteAddress: null,
			siteCity: seed.siteCity ?? owner?.city ?? null,
			sitePinUrl: null,
			receiverName: seed.receiverName ?? owner?.name ?? null,
			termSigned: delivered(seed.status),
			notes: null,
			deliveryFeeCents:
				seed.deliveryFeeReais === undefined
					? null
					: seed.deliveryFeeReais * 100,
			discountCents: 0,
			payments: seed.payments ?? [],
			deposit: { ...emptyDeposit, ...seed.deposit },
			occurrences: [],
			history: seed.history ?? [],
			signalDueAt: seed.signalDueAt ?? null,
			priceFrozenAt: frozen(seed.status)
				? (seed.payments?.[0]?.paidAt ?? seed.start)
				: null,
			cancelReason: null,
			lateNoticeGiven: false,
			createdAt: seed.createdAt ?? seed.start,
			sentAt: seed.status === "QUOTE" ? null : (seed.createdAt ?? seed.start),
			confirmedAt: frozen(seed.status)
				? (seed.payments?.[0]?.paidAt ?? seed.start)
				: null,
			separatedAt: deliveredAt,
			deliveredAt,
			returnedAt,
			closedAt: seed.status === "CLOSED" ? returnedAt : null,
		};
	};

	const heldDeposit = (reais: number, at: string, method: PaymentMethod) => ({
		receivedCents: reais * 100,
		receivedAt: at,
		receivedMethod: method,
	});

	const rentals: RentalRecord[] = [
		rental({
			number: "LOC-0006",
			customerId: "c-ana",
			status: "CLOSED",
			start: day(-20),
			end: day(-19, "17:00"),
			items: [{ code: "MAR-014" }],
			deliveryFeeReais: 40,
			payments: [
				payment("BALANCE", 80, "PIX", day(-20)),
				payment("DELIVERY_FEE", 40, "PIX", day(-20)),
			],
		}),
		rental({
			number: "LOC-0009",
			customerId: "c-jose",
			status: "CLOSED",
			start: day(-16),
			end: day(-15, "17:00"),
			items: [{ code: "MAR-008" }, { code: "MAR-006" }],
			payments: [payment("BALANCE", 180, "CASH", day(-16))],
		}),
		rental({
			number: "LOC-0011",
			customerId: "c-rafael",
			status: "CLOSED",
			start: day(-14),
			end: day(-13, "17:00"),
			items: [{ code: "MAR-013" }],
			deliveryFeeReais: 40,
			payments: [
				payment("BALANCE", 80, "PIX", day(-14)),
				payment("DELIVERY_FEE", 40, "PIX", day(-14)),
			],
		}),
		rental({
			number: "LOC-0012",
			customerId: "c-antonio",
			status: "CLOSED",
			start: day(-13),
			end: day(-11, "17:00"),
			items: [{ code: "MAR-009" }],
			deliveryFeeReais: 40,
			payments: [
				payment("BALANCE", 180, "PIX", day(-13)),
				payment("DELIVERY_FEE", 40, "CASH", day(-13)),
			],
		}),
		rental({
			number: "LOC-0015",
			customerId: "c-pedro",
			status: "CLOSED",
			start: day(-11),
			end: day(-10, "17:00"),
			items: [{ code: "MAR-002" }],
			payments: [payment("BALANCE", 200, "PIX", day(-11))],
		}),
		rental({
			number: "LOC-0018",
			customerId: "c-jose",
			status: "CLOSED",
			start: day(-9),
			end: day(-4, "17:00"),
			items: [{ code: "ANDAIME", quantity: 10 }],
			payments: [payment("BALANCE", 120, "PIX", day(-9))],
		}),
		rental({
			number: "LOC-0021",
			customerId: "c-antonio",
			status: "CLOSED",
			start: day(-7),
			end: day(-6, "17:00"),
			items: [{ code: "MAR-002" }],
			payments: [payment("BALANCE", 200, "CASH", day(-7))],
		}),
		rental({
			number: "LOC-0024",
			customerId: "c-antonio",
			status: "CLOSED",
			start: day(-3),
			end: day(-1, "17:00"),
			returned: day(-1, "16:00"),
			items: [{ code: "MAR-010" }],
			payments: [payment("BALANCE", 120, "PIX", day(-3))],
		}),
		rental({
			number: "LOC-0026",
			customerId: "c-rafael",
			status: "ON_SITE",
			start: day(-3),
			end: returnsToday("17:00", 2),
			items: [{ code: "MAR-006" }],
			payments: [
				payment("SIGNAL", 50, "PIX", day(-4, "10:00")),
				payment("BALANCE", 150, "PIX", day(-1, "11:00")),
			],
			deposit: heldDeposit(200, day(-3), "PIX"),
			createdAt: day(-4, "09:00"),
			history: [
				event(
					day(-1, "11:00"),
					"Saldo de R$ 150 recebido por Pix",
					"ATTENDANT",
				),
				event(day(-3), "Entregue na obra, termo assinado", "EQUIPMENT"),
				event(day(-4, "10:00"), "Sinal de R$ 50 recebido por Pix", "ATTENDANT"),
				event(day(-4, "09:00"), "Orçamento enviado ao cliente", "ATTENDANT"),
			],
		}),
		rental({
			number: "LOC-0027",
			customerId: "c-pedro",
			status: "ON_SITE",
			start: day(-3),
			end: returnsToday("12:00", 1),
			items: [{ code: "MAR-001" }],
			payments: [
				payment("SIGNAL", 100, "PIX", day(-4, "15:00")),
				payment("BALANCE", 220, "PIX", day(-3)),
			],
			deposit: heldDeposit(300, day(-3), "PIX"),
			createdAt: day(-4, "14:00"),
			history: [
				event(day(-3), "Entregue na obra, saldo recebido por Pix", "EQUIPMENT"),
				event(
					day(-4, "15:00"),
					"Sinal de R$ 100 recebido por Pix",
					"ATTENDANT",
				),
				event(day(-4, "14:00"), "Orçamento enviado ao cliente", "ATTENDANT"),
			],
		}),
		rental({
			number: "LOC-0028",
			customerId: "c-joao",
			status: "ON_SITE",
			start: day(-4),
			end: day(-1, "17:00"),
			items: [{ code: "MAR-008" }],
			payments: [
				payment("SIGNAL", 60, "PIX", day(-5, "10:00")),
				payment("BALANCE", 100, "CASH", day(-4)),
			],
			deposit: heldDeposit(200, day(-4), "CASH"),
			createdAt: day(-5, "09:00"),
			history: [
				event(
					day(-4),
					"Entregue na obra, saldo recebido em dinheiro",
					"EQUIPMENT",
				),
				event(day(-5, "10:00"), "Sinal de R$ 60 recebido por Pix", "ATTENDANT"),
				event(day(-5, "09:00"), "Orçamento enviado ao cliente", "ATTENDANT"),
			],
		}),
		rental({
			number: "LOC-0029",
			customerId: "c-jose",
			status: "CONFIRMED",
			start: day(0, "08:00"),
			end: day(6, "17:00"),
			items: [{ code: "MAR-002" }],
			payments: [payment("SIGNAL", 200, "PIX", day(-2, "16:40"))],
			createdAt: day(-2, "14:12"),
			history: [
				event(
					day(0, "07:30"),
					"Separado e testado, vídeo do teste salvo",
					"EQUIPMENT",
				),
				event(
					day(-2, "16:40"),
					"Sinal de R$ 200 recebido por Pix",
					"ATTENDANT",
				),
				event(day(-2, "14:12"), "Orçamento enviado ao cliente", "ATTENDANT"),
			],
		}),
		rental({
			number: "LOC-0030",
			customerId: "c-antonio",
			status: "CONFIRMED",
			start: day(0, "09:30"),
			end: day(14, "17:00"),
			items: [{ code: "ANDAIME", quantity: 8 }],
			payments: [payment("SIGNAL", 100, "PIX", day(-3, "11:00"))],
			deposit: heldDeposit(200, day(-3, "11:00"), "PIX"),
			createdAt: day(-3, "10:00"),
			history: [
				event(
					day(-3, "11:00"),
					"Sinal de R$ 100 e caução de R$ 200 recebidos por Pix",
					"ATTENDANT",
				),
				event(day(-3, "10:00"), "Orçamento enviado ao cliente", "ATTENDANT"),
			],
		}),
		rental({
			number: "LOC-0031",
			customerId: "c-ana",
			status: "AWAITING_DEPOSIT",
			start: day(1, "08:00"),
			end: day(1, "17:00"),
			items: [{ code: "CARROCINHA" }],
			signalDueAt: addHours(now, 5).toISOString(),
			createdAt: addHours(now, -19).toISOString(),
			history: [
				event(
					addHours(now, -19).toISOString(),
					"Orçamento enviado ao cliente",
					"ATTENDANT",
				),
			],
		}),
		rental({
			number: "LOC-0032",
			customerId: "c-maria",
			status: "CONFIRMED",
			start: day(0, "14:00"),
			end: day(1, "17:00"),
			items: [{ code: "MAR-017" }],
			payments: [payment("SIGNAL", 40, "PIX", day(-1, "15:00"))],
			createdAt: day(-1, "14:00"),
			history: [
				event(day(0, "07:40"), "Separado e testado", "EQUIPMENT"),
				event(day(-1, "15:00"), "Sinal de R$ 40 recebido por Pix", "ATTENDANT"),
				event(day(-1, "14:00"), "Orçamento enviado ao cliente", "ATTENDANT"),
			],
		}),
		rental({
			number: "LOC-0033",
			customerId: "c-cicero",
			status: "AWAITING_DEPOSIT",
			start: day(5, "08:00"),
			end: day(8, "17:00"),
			items: [{ code: "MAR-015" }, { code: "ANDAIME", quantity: 12 }],
			signalDueAt: addHours(now, 20).toISOString(),
			createdAt: addHours(now, -4).toISOString(),
			history: [
				event(
					addHours(now, -4).toISOString(),
					"Orçamento enviado ao cliente",
					"ATTENDANT",
				),
			],
		}),
	];

	const checkoutOf = (record: RentalRecord): InspectionRecord[] =>
		record.items.map((item) => {
			const owner = units.find((entry) => entry.code === item.code);
			const template =
				types.find((entry) => entry.id === owner?.typeId)?.checklist ?? [];
			return {
				id: `insp-${record.number}-${item.code}-CHECKOUT`,
				rentalNumber: record.number,
				itemCode: item.code,
				kind: "CHECKOUT",
				completedAt: record.deliveredAt,
				items: template.map((entry) => ({
					id: entry.id,
					label: entry.label,
					note: entry.note,
					occurrenceKind: entry.occurrenceKind,
					answer: "OK",
					observation: null,
					preexisting: false,
				})),
				media: [],
			};
		});

	const inspections = rentals
		.filter((record) => record.status === "ON_SITE")
		.flatMap(checkoutOf);

	const entry = (
		direction: LedgerDirection,
		category: LedgerCategory,
		reais: number,
		occurredAt: string,
		method: PaymentMethod,
		description: string,
		links: Partial<
			Pick<
				LedgerRecord,
				"rentalNumber" | "unitCode" | "maintenanceNumber" | "account"
			>
		> = {},
	): LedgerRecord => ({
		id: seedId("led"),
		account: "CASH",
		direction,
		category,
		amountCents: reais * 100,
		occurredAt,
		method,
		description,
		rentalNumber: null,
		unitCode: null,
		receiptFileKey: null,
		recordedBy: direction === "IN" ? ACTOR.ATTENDANT : ACTOR.MANAGER,
		maintenanceNumber: null,
		...links,
	});

	const paymentEntries = rentals.flatMap((record) =>
		record.payments.map((item) => {
			const firstItem = record.items[0];
			const label: Partial<Record<PaymentKind, string>> = {
				SIGNAL: "Sinal",
				BALANCE: "Saldo",
				DELIVERY_FEE: "Entrega e coleta",
			};
			return entry(
				"IN",
				item.kind === "DELIVERY_FEE" ? "DELIVERY" : "RENTAL",
				item.amountCents / 100,
				item.paidAt,
				item.method,
				`${label[item.kind]} da ${record.number}`,
				{
					rentalNumber: record.number,
					unitCode: firstItem?.kind === "UNIT" ? firstItem.code : null,
				},
			);
		}),
	);

	const depositEntries = rentals.flatMap((record) =>
		record.deposit.receivedCents > 0 && record.deposit.receivedAt
			? [
					entry(
						"IN",
						"DEPOSIT_RECEIVED",
						record.deposit.receivedCents / 100,
						record.deposit.receivedAt,
						record.deposit.receivedMethod ?? "PIX",
						`Caução da ${record.number}`,
						{ account: "DEPOSIT", rentalNumber: record.number },
					),
				]
			: [],
	);

	const ledger: LedgerRecord[] = [
		...paymentEntries,
		...depositEntries,
		entry(
			"IN",
			"CONSUMABLE_SOLD",
			40,
			day(-3, "15:00"),
			"CASH",
			"Discos de corte vendidos (3)",
			{ rentalNumber: "LOC-0026" },
		),
		entry(
			"OUT",
			"FUEL",
			40,
			day(0, "07:00"),
			"CASH",
			"Combustível da entrega em Capela",
			{ rentalNumber: "LOC-0029" },
		),
		entry(
			"OUT",
			"CONSUMABLE_BOUGHT",
			70,
			day(-3, "10:00"),
			"PIX",
			"Discos diamantados (2)",
			{ unitCode: "MAR-008" },
		),
		entry(
			"OUT",
			"ADVERTISING",
			50,
			day(-4, "12:00"),
			"PIX",
			"Anúncio no Instagram",
		),
		entry(
			"OUT",
			"MAINTENANCE",
			45,
			day(-5, "12:00"),
			"CASH",
			"Escovas da serra tico-tico",
			{ unitCode: "MAR-011", maintenanceNumber: "OS-004" },
		),
		entry(
			"OUT",
			"CONSUMABLE_BOUGHT",
			115,
			day(-12, "10:00"),
			"PIX",
			"Brocas e lixas para a semana",
		),
		entry(
			"OUT",
			"CONSUMABLE_BOUGHT",
			70,
			day(-20, "10:00"),
			"CASH",
			"Discos de corte (caixa)",
		),
		entry(
			"OUT",
			"FUEL",
			40,
			day(-7, "07:00"),
			"CASH",
			"Combustível das entregas da semana",
		),
		entry(
			"OUT",
			"FUEL",
			40,
			day(-12, "07:00"),
			"PIX",
			"Combustível da entrega em Atalaia",
		),
		entry(
			"OUT",
			"FUEL",
			40,
			day(-20, "07:00"),
			"CASH",
			"Combustível da entrega em Cajueiro",
		),
		entry(
			"OUT",
			"ADVERTISING",
			50,
			day(-14, "12:00"),
			"PIX",
			"Anúncio no Google",
		),
		entry(
			"OUT",
			"ADVERTISING",
			50,
			day(-24, "12:00"),
			"PIX",
			"Anúncio no Instagram",
		),
	];

	const maintenance: MaintenanceRecord[] = [
		{
			id: "os-002",
			number: "OS-002",
			unitCode: "MAR-014",
			reason: "Limpeza interna e saco coletor",
			location: "BASE",
			locationName: null,
			estimatedCostCents: 0,
			finalCostCents: 0,
			expectedBackAt: day(-13, "17:00"),
			status: "DONE",
			openedAt: day(-14),
			completedAt: day(-13, "17:00"),
		},
		{
			id: "os-003",
			number: "OS-003",
			unitCode: "MAR-010",
			reason: "Conferir disco e limpar depois da LOC-0024",
			location: "BASE",
			locationName: null,
			estimatedCostCents: 0,
			finalCostCents: null,
			expectedBackAt: null,
			status: "AWAITING_INSPECTION",
			openedAt: day(-1, "16:00"),
			completedAt: null,
		},
		{
			id: "os-004",
			number: "OS-004",
			unitCode: "MAR-011",
			reason: "Troca de escovas",
			location: "WORKSHOP",
			locationName: null,
			estimatedCostCents: 4500,
			finalCostCents: null,
			expectedBackAt: day(3, "17:00"),
			status: "IN_REPAIR",
			openedAt: day(-5, "12:00"),
			completedAt: null,
		},
	];

	const lost = (
		id: string,
		item: string,
		reason: string,
		city: string,
		offset: number,
		typeId: string | null = null,
	) => ({
		id,
		item,
		typeId,
		reason,
		city,
		requestedOn: addCalendarDays(today, offset),
		recordedBy: ACTOR.ATTENDANT,
	});

	return {
		version: 1,
		seededDay: today,
		touchedByUser: false,
		sequence: 1000,
		users: USERS.map((user) => ({ ...user })),
		types,
		units,
		lots,
		customers,
		rentals,
		inspections,
		ledger,
		maintenance,
		lostDemand: [
			lost("lost-1", "Betoneira", "Não temos no estoque", "Capela", -8),
			lost("lost-2", "Betoneira", "Não temos no estoque", "Atalaia", -3),
			lost(
				"lost-3",
				"Lavadora de alta pressão",
				"Não temos no estoque",
				"Cajueiro",
				-6,
			),
			lost(
				"lost-4",
				"Martelo demolidor",
				"Ocupado no período pedido",
				"Viçosa",
				-1,
				"t-demolidor",
			),
		],
		settings: {
			deliveryFees: DELIVERY_CITIES.map((city) => ({ city, feeCents: null })),
			signal: { mode: null, valueCents: null, percent: null },
			signalDeadlineHours: 24,
		},
		files: {},
		pendingUploads: {},
	};
}
