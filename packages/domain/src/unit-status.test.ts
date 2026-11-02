import { describe, expect, it } from "vitest";
import { UNIT_STATUSES, type UnitStatus } from "./enums";
import { unitStatusMachine } from "./unit-status";

const expected: Record<UnitStatus, UnitStatus[]> = {
	AVAILABLE: ["SEPARATED", "BLOCKED", "IN_MAINTENANCE", "RETIRED"],
	SEPARATED: ["RENTED", "AVAILABLE"],
	RENTED: ["IN_INSPECTION", "NOT_RETURNED"],
	IN_INSPECTION: ["AVAILABLE", "IN_MAINTENANCE", "DAMAGED"],
	IN_MAINTENANCE: ["AVAILABLE", "IN_INSPECTION"],
	DAMAGED: ["IN_MAINTENANCE", "RETIRED"],
	NOT_RETURNED: ["IN_INSPECTION", "RETIRED"],
	BLOCKED: ["AVAILABLE"],
	RETIRED: [],
};

describe("unitStatusMachine", () => {
	it.each(UNIT_STATUSES)("transições a partir de %s", (from) => {
		expect([...unitStatusMachine.allowedFrom(from)].sort()).toEqual(
			[...expected[from]].sort(),
		);
	});

	it("recusa todo o resto", () => {
		for (const from of UNIT_STATUSES) {
			for (const to of UNIT_STATUSES) {
				expect(unitStatusMachine.canTransition(from, to)).toBe(
					expected[from].includes(to),
				);
			}
		}
	});

	it("exige motivo para bloqueado, danificado e aposentado", () => {
		expect(unitStatusMachine.requiresReason("BLOCKED")).toBe(true);
		expect(unitStatusMachine.requiresReason("DAMAGED")).toBe(true);
		expect(unitStatusMachine.requiresReason("RETIRED")).toBe(true);
		expect(unitStatusMachine.requiresReason("AVAILABLE")).toBe(false);
		expect(unitStatusMachine.requiresReason("IN_MAINTENANCE")).toBe(false);
	});

	it("aposentado é final", () => {
		expect(unitStatusMachine.isFinal("RETIRED")).toBe(true);
		expect(unitStatusMachine.isFinal("AVAILABLE")).toBe(false);
	});
});
