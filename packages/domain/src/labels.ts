import type {
	DocumentKind,
	LedgerCategory,
	PaymentKind,
	PaymentMethod,
} from "./enums";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
	PIX: "Pix",
	CASH: "Dinheiro",
};

export const LEDGER_CATEGORY_LABELS: Record<LedgerCategory, string> = {
	RENTAL: "Locações",
	DELIVERY: "Entrega e coleta",
	CONSUMABLE_SOLD: "Consumíveis vendidos",
	EXTRA_FEES: "Diárias extras e taxas",
	DEPOSIT_RETAINED: "Caução retida",
	OTHER_IN: "Outras entradas",
	EQUIPMENT_PURCHASE: "Compra de equipamento",
	MAINTENANCE: "Manutenção",
	FUEL: "Combustível",
	ADVERTISING: "Anúncio",
	CONSUMABLE_BOUGHT: "Consumíveis comprados",
	OTHER_OUT: "Outras saídas",
	DEPOSIT_RECEIVED: "Caução recebida",
	DEPOSIT_REFUNDED: "Caução devolvida",
	DEPOSIT_TO_CASH: "Caução retida",
};

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
	SIGNAL: "Sinal",
	BALANCE: "Saldo",
	DELIVERY_FEE: "Taxa de entrega",
	CONSUMABLE: "Consumível",
	EXTRA_DAILY: "Diária extra",
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
	PHOTO_ID: "Documento com foto",
	TAX_ID: "CPF ou CNPJ",
	PROOF_OF_ADDRESS: "Comprovante de endereço",
	OTHER: "Outro documento",
};
