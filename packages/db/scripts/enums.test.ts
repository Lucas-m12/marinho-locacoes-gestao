import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { enumsSchema } from "./enums";

describe("enums.prisma", () => {
	it("está igual aos enums de packages/domain", () => {
		const path = fileURLToPath(
			new URL("../prisma/schema/enums.prisma", import.meta.url),
		);
		expect(readFileSync(path, "utf8")).toBe(enumsSchema());
	});
});
