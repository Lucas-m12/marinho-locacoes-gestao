import type {
	ConflictingItem,
	InvalidTransitionData,
	PreconditionReason,
} from "@marinho-gestao/contract";
import { ORPCError } from "@orpc/client";

export function notFound(
	resource: string,
	id: string,
): ORPCError<"NOT_FOUND", unknown> {
	return new ORPCError("NOT_FOUND", { data: { resource, id } });
}

export function conflict(
	conflicts: ConflictingItem[],
): ORPCError<"CONFLICT", unknown> {
	return new ORPCError("CONFLICT", { data: { conflicts } });
}

export function invalidTransition(
	data: InvalidTransitionData,
): ORPCError<"INVALID_TRANSITION", unknown> {
	return new ORPCError("INVALID_TRANSITION", { data });
}

export function precondition(
	reason: PreconditionReason,
	codes: string[] = [],
): ORPCError<"PRECONDITION_FAILED", unknown> {
	return new ORPCError("PRECONDITION_FAILED", { data: { reason, codes } });
}
