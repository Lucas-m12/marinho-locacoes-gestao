import { buildSeed, DEMO_PASSWORD } from "@marinho-gestao/read-model/seed";
import { hashPassword } from "better-auth/crypto";
import { loadDemoSeed } from "../src/demo";
import { ENV } from "../src/env";
import { createPrismaClient } from "../src/index";
import { truncateAll } from "../src/maintenance-tasks";

if (ENV.NODE_ENV === "production") {
	console.error("db:seed:demo não roda em produção.");
	process.exit(1);
}

const db = createPrismaClient(ENV);

try {
	await truncateAll(db);
	await loadDemoSeed(
		db,
		buildSeed(new Date()),
		await hashPassword(DEMO_PASSWORD),
	);
	console.log(
		`Dados de exemplo carregados. Usuários lucas, atendimento e equipamentos, senha ${DEMO_PASSWORD}.`,
	);
} finally {
	await db.$disconnect();
}
