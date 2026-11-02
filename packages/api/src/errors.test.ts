import { contract } from "@marinho-gestao/contract";
import { describe, expect, it } from "vitest";
import {
	conflict,
	invalidTransition,
	isExclusionViolation,
	isUniqueViolation,
	isUuid,
	notFound,
	precondition,
} from "./errors";

function prismaError(code: string, originalCode: string) {
	const error = new Error("Prisma error") as Error & {
		code: string;
		meta: unknown;
	};
	error.code = code;
	error.meta = {
		modelName: "RentalItem",
		driverAdapterError: {
			name: "DriverAdapterError",
			cause: {
				originalCode,
				kind: "postgres",
				code: originalCode,
				message:
					'conflicting key value violates exclusion constraint "rental_item_unit_no_overlap"',
			},
		},
	};
	return error;
}

describe("isExclusionViolation", () => {
	it("reconhece o 23P01 que o Prisma devolve numa escrita", () => {
		expect(isExclusionViolation(prismaError("P2039", "23P01"))).toBe(true);
	});

	it("reconhece o 23P01 numa consulta crua", () => {
		expect(isExclusionViolation(prismaError("P2010", "23P01"))).toBe(true);
	});

	it("reconhece o erro do driver sem o envelope do Prisma", () => {
		expect(isExclusionViolation({ cause: { code: "23P01" } })).toBe(true);
	});

	it("não confunde com outras violações", () => {
		expect(isExclusionViolation(prismaError("P2002", "23505"))).toBe(false);
		expect(isExclusionViolation(new Error("qualquer"))).toBe(false);
		expect(isExclusionViolation(null)).toBe(false);
	});
});

describe("isUniqueViolation", () => {
	it("reconhece P2002 e 23505", () => {
		expect(isUniqueViolation(prismaError("P2002", "23505"))).toBe(true);
		expect(isUniqueViolation(prismaError("P2039", "23P01"))).toBe(false);
	});
});

describe("isUuid", () => {
	it("aceita só UUID", () => {
		expect(isUuid("01a19c57-6196-7b93-802c-dea38c767cdf")).toBe(true);
		expect(isUuid("c-maria")).toBe(false);
	});
});

describe("erros de negócio", () => {
	const contractStatus = (code: string) =>
		(
			contract.rentals.markSeparated["~orpc"].errorMap as Record<
				string,
				{ status?: number }
			>
		)[code]?.status;

	it.each([
		["NOT_FOUND", notFound("unit", "MAR-999")],
		["CONFLICT", conflict([])],
		[
			"INVALID_TRANSITION",
			invalidTransition({
				entity: "UNIT",
				from: "RENTED",
				to: "SEPARATED",
				allowed: [],
			}),
		],
		["PRECONDITION_FAILED", precondition("SIGNAL_REQUIRED")],
	])("%s sai com o status do contrato, não 500", (code, error) => {
		expect(error.code).toBe(code);
		expect(error.status).toBe(contractStatus(code));
		expect(error.status).toBeLessThan(500);
	});
});
