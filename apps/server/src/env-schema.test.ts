import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../.env.schema", import.meta.url), "utf8");

function decoratorsOf(name: string): string {
	const lines = schema.split("\n");
	const index = lines.findIndex((line) => line.startsWith(`${name}=`));
	if (index === -1) throw new Error(`${name} não está no .env.schema`);
	const decorators: string[] = [];
	for (let at = index - 1; at >= 0 && lines[at]?.startsWith("#"); at -= 1) {
		decorators.push(lines[at] ?? "");
	}
	return decorators.join("\n");
}

describe(".env.schema do servidor", () => {
	it.each([
		"R2_ACCOUNT_ID",
		"R2_ACCESS_KEY_ID",
		"R2_BUCKET",
		"BETTER_AUTH_URL",
		"CORS_ORIGIN",
	])(
		"%s não é sensível: aparece nas URLs assinadas e nas respostas, e o varlock bloquearia a resposta",
		(name) => {
			expect(decoratorsOf(name)).toContain("@sensitive=false");
		},
	);

	it.each([
		"BETTER_AUTH_SECRET",
		"DATABASE_URL",
		"R2_SECRET_ACCESS_KEY",
		"R2_BACKUP_SECRET_ACCESS_KEY",
	])("%s continua sensível", (name) => {
		expect(decoratorsOf(name)).not.toContain("@sensitive=false");
	});
});
