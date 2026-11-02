import { ORPCError } from "@orpc/server";

export function pending(): never {
	throw new ORPCError("NOT_IMPLEMENTED");
}
