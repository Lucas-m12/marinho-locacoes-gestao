import type {
	AvailabilityBlock,
	PreconditionReason,
} from "@marinho-gestao/contract";
import type {
	CalendarState,
	ChecklistMediaSlot,
	CustomerKind,
	CustomerOrigin,
	CustomerTier,
	DeliveryMode,
	LedgerAccount,
	MaintenanceLocation,
	MaintenanceStatus,
	OccurrenceDecision,
	OccurrenceKind,
	RentalDisplayStatus,
	Role,
	UnitPhotoSlot,
	UnitStatus,
} from "@marinho-gestao/domain";

export {
	DOCUMENT_KIND_LABELS,
	LEDGER_CATEGORY_LABELS,
	PAYMENT_KIND_LABELS,
	PAYMENT_METHOD_LABELS,
} from "@marinho-gestao/domain";

export const ROLE_LABELS: Record<Role, string> = {
	MANAGER: "Gestão",
	ATTENDANT: "Atendimento",
	EQUIPMENT: "Equipamentos",
};

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
	AVAILABLE: "Disponível",
	SEPARATED: "Separado",
	RENTED: "Alugado",
	IN_INSPECTION: "Em inspeção",
	IN_MAINTENANCE: "Em manutenção",
	DAMAGED: "Danificado",
	NOT_RETURNED: "Não devolvido",
	BLOCKED: "Bloqueado",
	RETIRED: "Aposentado",
};

export const RENTAL_STATUS_LABELS: Record<RentalDisplayStatus, string> = {
	QUOTE: "Orçamento",
	AWAITING_DEPOSIT: "Aguardando sinal",
	CONFIRMED: "Confirmada",
	SEPARATED: "Separada",
	ON_SITE: "Na obra",
	RETURNED: "Devolvida",
	CLOSED: "Encerrada",
	CANCELED: "Cancelada",
	EXPIRED: "Expirada",
	OVERDUE: "Atrasada",
};

export const CUSTOMER_TIER_LABELS: Record<CustomerTier, string> = {
	BLOCKED: "Bloqueado",
	ATTENTION: "Atenção",
	TRUSTED: "Confiável",
	RECURRING: "Recorrente",
	NEW: "Novo",
};

export const CUSTOMER_KIND_LABELS: Record<CustomerKind, string> = {
	INDIVIDUAL: "Pessoa física",
	PROFESSIONAL: "Profissional",
	COMPANY: "Empresa",
};

export const CUSTOMER_ORIGIN_LABELS: Record<CustomerOrigin, string> = {
	INSTAGRAM: "Instagram",
	GOOGLE: "Google",
	REFERRAL: "Indicação",
	PARTNER_STORE: "Loja parceira",
};

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
	DELIVERY: "Entrega e coleta na obra",
	PICKUP: "Cliente busca e devolve",
};

export const OCCURRENCE_KIND_LABELS: Record<OccurrenceKind, string> = {
	DAMAGE: "Dano",
	MISSING_PART: "Peça faltando",
	DIRT: "Sujeira",
	LATE: "Atraso",
};

export const OCCURRENCE_DECISION_LABELS: Record<OccurrenceDecision, string> = {
	CHARGE: "Cobrar",
	WAIVE: "Perdoar",
	DISPUTE: "Em disputa",
};

export const LEDGER_ACCOUNT_LABELS: Record<LedgerAccount, string> = {
	CASH: "Caixa",
	DEPOSIT: "Caução",
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
	IN_REPAIR: "Em conserto",
	AWAITING_INSPECTION: "Aguardando inspeção",
	DONE: "Concluída",
};

export const MAINTENANCE_LOCATION_LABELS: Record<MaintenanceLocation, string> =
	{
		WORKSHOP: "Assistência",
		BASE: "Na base",
	};

export const UNIT_PHOTO_SLOT_LABELS: Record<UnitPhotoSlot, string> = {
	MAIN: "Foto principal",
	FRONT: "Frente",
	BACK: "Verso",
	PLATE: "Placa",
	SERIAL: "Nº de série",
};

export const CHECKLIST_MEDIA_LABELS: Record<ChecklistMediaSlot, string> = {
	FRONT: "Frente",
	BACK: "Verso",
	LEFT: "Lado esquerdo",
	RIGHT: "Lado direito",
	PLATE_SERIAL: "Placa e série",
	TEST_VIDEO: "Vídeo do teste",
};

export const CALENDAR_STATE_LABELS: Record<CalendarState, string> = {
	FREE: "Livre",
	RENTED: "Alugado",
	RESERVED: "Reservado",
	AWAITING_DEPOSIT: "Aguardando sinal",
	INSPECTION: "Em inspeção",
	MAINTENANCE: "Em manutenção",
	OVERDUE: "Atrasado",
	BLOCKED: "Indisponível",
};

export const AVAILABILITY_BLOCK_LABELS: Record<AvailabilityBlock, string> = {
	RENTED: "Alugado",
	RESERVED: "Reservado",
	AWAITING_DEPOSIT: "Aguardando sinal",
	OVERDUE: "Atrasado",
	MAINTENANCE: "Em manutenção",
	BLOCKED: "Bloqueado",
	DAMAGED: "Danificado",
	NOT_RETURNED: "Não devolvido",
	RETIRED: "Aposentado",
	NO_PIECES: "Sem peças suficientes",
};

export const PRECONDITION_MESSAGES: Record<PreconditionReason, string> = {
	UNPRICED_TYPE:
		"Este equipamento ainda não tem preço. Cadastre a diária em Configurações antes de orçar.",
	NO_ITEMS: "Adicione pelo menos um equipamento.",
	REASON_REQUIRED: "Informe o motivo para esta mudança.",
	SIGNAL_REQUIRED: "Registre o sinal antes de confirmar a reserva.",
	SIGNAL_EXPIRED: "O prazo do sinal venceu e o orçamento expirou.",
	DEPOSIT_NOT_SETTLED:
		"Ainda há caução em mãos. Devolva ou retenha antes de encerrar.",
	CHECKLIST_INCOMPLETE:
		"Responda todos os itens do checklist antes de concluir.",
	CHECKLIST_ALREADY_DONE: "Este checklist já foi concluído.",
	TERM_NOT_SIGNED: "Marque o termo como assinado antes de concluir a saída.",
	UNITS_NOT_SEPARATED: "Separe os equipamentos antes de registrar a entrega.",
	INSUFFICIENT_DEPOSIT: "O valor é maior do que a caução em mãos.",
	CUSTOMER_BLOCKED: "Este cliente está bloqueado e não pode alugar agora.",
	INVALID_DATE: "Confira as datas informadas.",
	DUPLICATE:
		"Já existe um cadastro com esses dados. Se for um usuário, escolha outro nome.",
	UPLOAD_MISSING: "O arquivo não chegou. Envie de novo.",
	UPLOAD_INVALID: "Esse tipo ou tamanho de arquivo não é aceito.",
	ALREADY_REVERSED: "Este lançamento já foi estornado.",
	IS_REVERSAL: "Um estorno não pode ser estornado.",
};
