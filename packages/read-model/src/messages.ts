import {
	formatBRLShort,
	formatWeekdayDateTime,
	PAYMENT_KIND_LABELS,
	PAYMENT_METHOD_LABELS,
	type PaymentKind,
	type PaymentMethod,
} from "@marinho-gestao/domain";

export const RENTAL_EVENTS = {
	quoteDrafted: "Rascunho de orçamento criado",
	quoteSent: "Orçamento enviado ao cliente",
	quoteExpired: "Orçamento expirou sem sinal e a agenda foi liberada",
	confirmed: "Reserva confirmada",
	separated: "Separado e conferido",
	closed: "Locação encerrada",
	paymentReceived: (kind: PaymentKind, cents: number, method: PaymentMethod) =>
		`${PAYMENT_KIND_LABELS[kind]} de ${formatBRLShort(cents)} recebido por ${PAYMENT_METHOD_LABELS[method]}`,
	depositReceived: (cents: number, method: PaymentMethod) =>
		`Caução de ${formatBRLShort(cents)} recebida por ${PAYMENT_METHOD_LABELS[method]}`,
	depositRefunded: (cents: number, method: PaymentMethod) =>
		`Caução de ${formatBRLShort(cents)} devolvida por ${PAYMENT_METHOD_LABELS[method]}`,
	depositRetained: (cents: number, reason: string) =>
		`Caução de ${formatBRLShort(cents)} retida: ${reason}`,
	reversed: (cents: number, reason: string) =>
		`Estorno de ${formatBRLShort(cents)}: ${reason}`,
	extended: (newEndAt: string, differenceCents: number) =>
		`Prorrogada até ${formatWeekdayDateTime(newEndAt)}, mais ${formatBRLShort(differenceCents)}`,
	canceled: (reason: string) => `Cancelada: ${reason}`,
	checkedOut: (code: string) => `${code} entregue, termo assinado`,
	returned: (code: string, occurrences: number) =>
		occurrences > 0
			? `${code} voltou com ${occurrences} ocorrência(s)`
			: `${code} voltou sem ocorrências`,
};

export const LEDGER_DESCRIPTIONS = {
	payment: (kind: PaymentKind, rentalNumber: string) =>
		`${PAYMENT_KIND_LABELS[kind]} da ${rentalNumber}`,
	depositReceived: (rentalNumber: string) => `Caução da ${rentalNumber}`,
	depositRefunded: (rentalNumber: string) =>
		`Caução devolvida da ${rentalNumber}`,
	depositRetained: (rentalNumber: string, reason: string) =>
		`Caução retida da ${rentalNumber}: ${reason}`,
	reversal: (description: string, reason: string) =>
		`Estorno de ${description}: ${reason}`,
	maintenance: (reason: string, orderNumber: string) =>
		`${reason} · ${orderNumber}`,
};

export const RETURN_TEXTS = {
	repairReason: (rentalNumber: string) => `Conserto depois da ${rentalNumber}`,
	damagedReason: (rentalNumber: string) => `Voltou com dano da ${rentalNumber}`,
	lateOccurrence: (extraDailies: number) => `Atraso de ${extraDailies} dia(s)`,
};
