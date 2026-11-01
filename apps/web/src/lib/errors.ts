import type {
	ConflictErrorData,
	InvalidTransitionData,
	PreconditionFailedData,
} from "@marinho-gestao/contract";
import { ORPCError } from "@orpc/client";
import { PRECONDITION_MESSAGES } from "./labels";

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

export function conflictData(error: unknown): ConflictErrorData | null {
	if (error instanceof ORPCError && error.code === "CONFLICT") {
		return error.data as ConflictErrorData;
	}
	return null;
}

export function describeError(error: unknown): string {
	if (error instanceof ORPCError) {
		if (error.code === "PRECONDITION_FAILED") {
			const { reason } = error.data as PreconditionFailedData;
			return PRECONDITION_MESSAGES[reason];
		}
		if (error.code === "INVALID_TRANSITION") {
			const data = error.data as InvalidTransitionData;
			return data.allowed.length === 0
				? "Este registro não aceita mais mudanças de status."
				: "Essa mudança de status não é permitida agora.";
		}
		if (error.code === "CONFLICT") {
			return "Parte do que foi pedido está ocupado no período.";
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
