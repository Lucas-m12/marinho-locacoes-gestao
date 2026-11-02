import type {
	ConflictErrorData,
	ConflictingItem,
	InvalidTransitionData,
	PreconditionFailedData,
} from "@marinho-gestao/contract";
import { ORPCError } from "@orpc/client";
import { toast } from "sonner";
import {
	PRECONDITION_MESSAGES,
	RENTAL_STATUS_LABELS,
	UNIT_STATUS_LABELS,
} from "./labels";

function statusLabel(entity: InvalidTransitionData["entity"], status: string) {
	const labels: Record<string, string> =
		entity === "UNIT" ? UNIT_STATUS_LABELS : RENTAL_STATUS_LABELS;
	return labels[status] ?? status;
}

export const LOCALLY_HANDLED_CODES = [
	"CONFLICT",
	"INVALID_TRANSITION",
	"PRECONDITION_FAILED",
] as const;

export function errorCode(error: unknown): string | null {
	return error instanceof ORPCError ? String(error.code) : null;
}

export function isLocallyHandled(error: unknown): boolean {
	const code = errorCode(error);
	return (
		code !== null && (LOCALLY_HANDLED_CODES as readonly string[]).includes(code)
	);
}

export function showLocalError(error: unknown): void {
	if (isLocallyHandled(error)) toast.error(describeError(error));
}

export function conflictData(error: unknown): ConflictErrorData | null {
	if (error instanceof ORPCError && error.code === "CONFLICT") {
		return error.data as ConflictErrorData;
	}
	return null;
}

function describeConflict(entry: ConflictingItem): string {
	if (entry.freeQuantity !== null && entry.requestedQuantity !== null) {
		const free =
			entry.freeQuantity === 1
				? "1 peça livre"
				: `${entry.freeQuantity} peças livres`;
		return `${entry.name}: só ${free} no período (pediu ${entry.requestedQuantity})`;
	}
	return `${entry.code} ocupado no período escolhido`;
}

export function describeError(error: unknown): string {
	if (error instanceof ORPCError) {
		if (error.code === "PRECONDITION_FAILED") {
			const { reason } = error.data as PreconditionFailedData;
			return PRECONDITION_MESSAGES[reason];
		}
		if (error.code === "INVALID_TRANSITION") {
			const data = error.data as InvalidTransitionData;
			if (data.allowed.length === 0) {
				return "Este registro não aceita mais mudanças de status.";
			}
			const subject = data.entity === "UNIT" ? "A unidade" : "A locação";
			return `${subject} está ${statusLabel(data.entity, data.from)}: não dá para passar para ${statusLabel(data.entity, data.to)} agora.`;
		}
		if (error.code === "CONFLICT") {
			const { conflicts } = error.data as ConflictErrorData;
			return `${conflicts.map(describeConflict).join("; ")}.`;
		}
		if (error.code === "FORBIDDEN") {
			return "Seu acesso não permite esta ação.";
		}
		if (error.code === "NOT_FOUND") {
			return "Não encontramos esse registro.";
		}
		if (error.code === "BAD_REQUEST") {
			return "Confira os dados informados.";
		}
		return error.message;
	}
	if (error instanceof Error && error.message) return error.message;
	return "Algo deu errado. Tente de novo.";
}
