import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { enumsSchema } from "./enums";

const target = fileURLToPath(
	new URL("../prisma/schema/enums.prisma", import.meta.url),
);
writeFileSync(target, enumsSchema());
