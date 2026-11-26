import { createHash } from "node:crypto";
import type {
	Customer,
	CustomerDetail,
	LedgerEntry,
} from "@marinho-gestao/contract";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { ORPCError } from "@orpc/client";
import { SignInError } from "./api";
import { ConfigError } from "./config";

export function ok(data: unknown): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export function failure(error: unknown): CallToolResult {
	return {
		isError: true,
		content: [{ type: "text", text: JSON.stringify(describeError(error)) }],
	};
}

export type ErrorReport = {
	erro: string;
	mensagem: string;
	detalhes?: unknown;
};

/**
 * Erros de regra do sistema (CONFLICT, PRECONDITION_FAILED…) voltam com o
 * código e os dados do contrato, para o Claude explicar o que faltou. Falha de
 * rede ou erro inesperado não leva stack trace.
 */
export function describeError(error: unknown): ErrorReport {
	if (error instanceof SignInError || error instanceof ConfigError) {
		return { erro: "LOGIN", mensagem: error.message };
	}
	if (error instanceof ORPCError) {
		const report: ErrorReport = { erro: error.code, mensagem: error.message };
		if (error.data !== undefined) report.detalhes = error.data;
		return report;
	}
	return {
		erro: "FALHA",
		mensagem: `Não consegui concluir a chamada à API: ${error instanceof Error ? error.message : String(error)}`,
	};
}

/**
 * Dados do cliente que o MCP devolve. Lista do que pode sair, não do que
 * não pode: CPF/CNPJ, endereço e arquivos de documento ficam no sistema.
 */
export function publicCustomer(customer: Customer) {
	return {
		id: customer.id,
		kind: customer.kind,
		name: customer.name,
		responsible: customer.responsible,
		authorizedReceivers: customer.authorizedReceivers,
		whatsapp: customer.whatsapp,
		alternatePhone: customer.alternatePhone,
		neighborhood: customer.neighborhood,
		city: customer.city,
		occupation: customer.occupation,
		origin: customer.origin,
		referredBy: customer.referredBy,
		acceptsPromotions: customer.acceptsPromotions,
		notes: customer.notes,
		blockedManually: customer.blockedManually,
		blockReason: customer.blockReason,
		createdAt: customer.createdAt,
		tier: customer.tier,
		stats: customer.stats,
		lastRental: customer.lastRental,
		missingDocuments: customer.missingDocuments,
	};
}

export function publicCustomerDetail(customer: CustomerDetail) {
	return {
		...publicCustomer(customer),
		documentsReceived: customer.documents.map((document) => ({
			kind: document.kind,
			label: document.label,
			receivedAt: document.receivedAt,
		})),
		rentals: customer.rentals,
	};
}

export function publicLedgerEntry(entry: LedgerEntry) {
	return {
		id: entry.id,
		account: entry.account,
		direction: entry.direction,
		category: entry.category,
		amountCents: entry.amountCents,
		occurredAt: entry.occurredAt,
		method: entry.method,
		description: entry.description,
		rentalNumber: entry.rentalNumber,
		unitCode: entry.unitCode,
		hasReceipt: entry.receiptFileKey !== null,
		recordedBy: entry.recordedBy,
		reversalOfId: entry.reversalOfId,
		reversalReason: entry.reversalReason,
		reversedById: entry.reversedById,
	};
}

/** Dia de hoje no fuso do negócio, como AAAA-MM-DD. */
export function businessDay(now: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/Maceio",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

/**
 * Chave de idempotência das ferramentas de dinheiro. Mesma ferramenta, mesmos
 * dados e mesmo dia geram a mesma chave, então uma chamada repetida por engano
 * devolve o lançamento já feito em vez de lançar de novo.
 */
export function idempotencyKey(
	tool: string,
	args: unknown,
	day: string,
): string {
	const digest = createHash("sha256")
		.update(JSON.stringify({ tool, args, day }))
		.digest("hex");
	return `mcp-${digest.slice(0, 40)}`;
}
