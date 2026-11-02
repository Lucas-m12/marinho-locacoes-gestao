import { describe, expect, it } from "vitest";
import { nextCode } from "./codes";

describe("nextCode", () => {
	it("começa do 1", () => {
		expect(nextCode("LOC", [])).toBe("LOC-0001");
		expect(nextCode("OS", [])).toBe("OS-001");
		expect(nextCode("MAR", [])).toBe("MAR-001");
	});

	it("segue o maior número, mesmo fora de ordem", () => {
		expect(nextCode("LOC", ["LOC-0033", "LOC-0009"])).toBe("LOC-0034");
		expect(nextCode("OS", ["OS-004", "OS-002"])).toBe("OS-005");
	});

	it("ignora códigos de outro prefixo", () => {
		expect(nextCode("OS", ["LOC-0100"])).toBe("OS-001");
	});

	it("passa do tamanho do preenchimento", () => {
		expect(nextCode("OS", ["OS-999"])).toBe("OS-1000");
	});
});
