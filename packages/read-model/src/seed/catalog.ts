import type { ChecklistTemplateItem } from "@marinho-gestao/contract";
import type { OccurrenceKind, Role } from "@marinho-gestao/domain";
import type { LotRecord, TypeRecord, UnitRecord, UserRecord } from "../records";

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

export function buildTypes(): TypeRecord[] {
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

export const CATALOG_UNITS: readonly UnitRecord[] = [
	unit(
		"MAR-001",
		"t-martelete",
		"Martelete Bosch GBH 2-28 D",
		"Martelete Bosch",
	),
	unit(
		"MAR-002",
		"t-demolidor",
		"Martelo demolidor Bosch GSH 500",
		"Martelo demolidor",
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
	),
	unit("MAR-011", "t-tico-tico", "Serra tico-tico Wesco", "Serra tico-tico"),
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
	),
];

export type CatalogUser = Pick<UserRecord, "username" | "name" | "role">;

export const CATALOG_USERS: readonly CatalogUser[] = [
	{ username: "lucas", name: "Lucas", role: "MANAGER" satisfies Role },
	{ username: "atendimento", name: "Atendimento", role: "ATTENDANT" },
	{ username: "equipamentos", name: "Equipamentos", role: "EQUIPMENT" },
];

export const DELIVERY_CITIES = [
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

export function buildLots(): LotRecord[] {
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

export const CATALOG_SETTINGS = {
	signalDeadlineHours: 24,
	defaultTurnaroundHours: 12,
} as const;
