import { describe, expect, it } from "vitest";
import { can } from "./permissions";

describe("can", () => {
	it("só gestão mexe em configurações e usuários", () => {
		expect(can("MANAGER", "settings:manage")).toBe(true);
		expect(can("ATTENDANT", "settings:manage")).toBe(false);
		expect(can("EQUIPMENT", "users:manage")).toBe(false);
	});

	it("equipamentos não vê dinheiro", () => {
		expect(can("EQUIPMENT", "money:read")).toBe(false);
		expect(can("ATTENDANT", "money:read")).toBe(true);
	});

	it("atendimento vende e equipamentos separa", () => {
		expect(can("ATTENDANT", "rentals:sell")).toBe(true);
		expect(can("EQUIPMENT", "rentals:sell")).toBe(false);
		expect(can("EQUIPMENT", "rentals:separate")).toBe(true);
		expect(can("ATTENDANT", "rentals:separate")).toBe(false);
	});

	it("todos fazem checklist", () => {
		expect(can("ATTENDANT", "inspections:run")).toBe(true);
		expect(can("EQUIPMENT", "inspections:run")).toBe(true);
	});
});
