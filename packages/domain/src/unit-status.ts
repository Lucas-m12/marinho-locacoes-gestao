import type { UnitStatus } from "./enums";

const TRANSITIONS: Record<UnitStatus, readonly UnitStatus[]> = {
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

const REASON_REQUIRED: readonly UnitStatus[] = [
	"BLOCKED",
	"DAMAGED",
	"RETIRED",
];

export const unitStatusMachine = {
	allowedFrom(status: UnitStatus): readonly UnitStatus[] {
		return TRANSITIONS[status];
	},
	canTransition(from: UnitStatus, to: UnitStatus): boolean {
		return TRANSITIONS[from].includes(to);
	},
	requiresReason(to: UnitStatus): boolean {
		return REASON_REQUIRED.includes(to);
	},
	isFinal(status: UnitStatus): boolean {
		return TRANSITIONS[status].length === 0;
	},
};
