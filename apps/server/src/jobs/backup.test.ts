import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { backupDatabase, backupKey, libpqEnvironment } from "./backup";
import type { BackupTarget } from "./types";

describe("backupKey", () => {
	it("usa a pasta do dia em Maceió e o instante em UTC", () => {
		expect(backupKey(new Date("2026-11-02T06:00:00.000Z"))).toBe(
			"postgres/2026/11/02/marinho-20261102T060000Z.dump",
		);
		expect(backupKey(new Date("2026-11-03T01:30:00.000Z"))).toBe(
			"postgres/2026/11/02/marinho-20261103T013000Z.dump",
		);
	});
});

describe("libpqEnvironment", () => {
	it("separa a URL em variáveis do libpq, sem a senha na linha de comando", () => {
		expect(
			libpqEnvironment(
				"postgresql://marinho:s%40nha@postgres:5432/marinho?schema=public&sslmode=disable",
			),
		).toEqual({
			PGHOST: "postgres",
			PGPORT: "5432",
			PGUSER: "marinho",
			PGPASSWORD: "s@nha",
			PGDATABASE: "marinho",
			PGSSLMODE: "disable",
		});
	});

	it("usa a porta padrão quando a URL não informa", () => {
		expect(libpqEnvironment("postgresql://u:p@db/base").PGPORT).toBe("5432");
	});
});

describe("backupDatabase", () => {
	const at = new Date("2026-11-02T06:00:00.000Z");

	it("gera o dump, envia para o bucket e informa tamanho e tempos", async () => {
		const sent: { key: string; content: string; contentType: string }[] = [];
		const target: BackupTarget = {
			async putFile(key, filePath, contentType) {
				const content = await readFile(filePath, "utf8");
				sent.push({ key, content, contentType });
				return { sizeBytes: content.length, parts: 1 };
			},
		};
		let dumpedFrom = "";
		const result = await backupDatabase(
			{
				databaseUrl: "postgresql://u:p@postgres:5432/marinho",
				target,
				dump: async (databaseUrl, outputPath) => {
					dumpedFrom = databaseUrl;
					await writeFile(outputPath, "PGDMP-conteudo");
				},
			},
			() => at,
		);
		expect(dumpedFrom).toBe("postgresql://u:p@postgres:5432/marinho");
		expect(sent).toEqual([
			{
				key: "postgres/2026/11/02/marinho-20261102T060000Z.dump",
				content: "PGDMP-conteudo",
				contentType: "application/octet-stream",
			},
		]);
		expect(result.affected).toBe(1);
		expect(result.details).toMatchObject({
			key: "postgres/2026/11/02/marinho-20261102T060000Z.dump",
			sizeBytes: 14,
			parts: 1,
		});
		expect(result.details?.dumpMs).toBeTypeOf("number");
		expect(result.details?.uploadMs).toBeTypeOf("number");
	});

	it("falha sem enviar quando o dump sai vazio", async () => {
		let uploads = 0;
		await expect(
			backupDatabase(
				{
					databaseUrl: "postgresql://u:p@postgres:5432/marinho",
					target: {
						async putFile() {
							uploads += 1;
							return { sizeBytes: 0, parts: 1 };
						},
					},
					dump: async (_, outputPath) => writeFile(outputPath, ""),
				},
				() => at,
			),
		).rejects.toThrow(/vazio/);
		expect(uploads).toBe(0);
	});

	it("propaga o erro do pg_dump", async () => {
		await expect(
			backupDatabase(
				{
					databaseUrl: "postgresql://u:p@postgres:5432/marinho",
					target: {
						putFile: async () => ({ sizeBytes: 0, parts: 1 }),
					},
					dump: async () => {
						throw new Error("pg_dump saiu com código 1: conexão recusada");
					},
				},
				() => at,
			),
		).rejects.toThrow(/conexão recusada/);
	});
});
