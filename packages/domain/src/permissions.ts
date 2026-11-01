import type { Role } from "./enums";

const ALL: readonly Role[] = ["MANAGER", "ATTENDANT", "EQUIPMENT"];

export const PERMISSIONS = {
	"catalog:manage": ["MANAGER"],
	"settings:manage": ["MANAGER"],
	"users:manage": ["MANAGER"],
	"money:read": ["MANAGER", "ATTENDANT"],
	"money:write": ["MANAGER", "ATTENDANT"],
	"customers:read": ["MANAGER", "ATTENDANT"],
	"customers:write": ["MANAGER", "ATTENDANT"],
	"rentals:read": ALL,
	"rentals:sell": ["MANAGER", "ATTENDANT"],
	"rentals:separate": ["MANAGER", "EQUIPMENT"],
	"rentals:close": ["MANAGER", "ATTENDANT"],
	"lostDemand:write": ["MANAGER", "ATTENDANT"],
	"inspections:run": ALL,
	"units:read": ALL,
	"units:operate": ["MANAGER", "EQUIPMENT"],
	"maintenance:read": ["MANAGER", "EQUIPMENT"],
	"maintenance:write": ["MANAGER", "EQUIPMENT"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
	return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}
