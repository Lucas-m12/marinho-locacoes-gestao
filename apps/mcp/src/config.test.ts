import { describe, expect, it } from "vitest";
import {
	ConfigError,
	DEFAULT_API_URL,
	DEFAULT_ORIGIN,
	parseMode,
	readConfig,
} from "./config";

describe("readConfig", () => {
	it("usa a API de produção e o modo leitura por padrão", () => {
		const config = readConfig({ MARINHO_USUARIO: "claude" }, "linux");
		expect(config).toMatchObject({
			apiUrl: DEFAULT_API_URL,
			origin: DEFAULT_ORIGIN,
			username: "claude",
			mode: "leitura",
		});
	});

	it("exige o usuário", () => {
		expect(() => readConfig({}, "linux")).toThrow(ConfigError);
	});

	it("recusa API sem https fora da própria máquina", () => {
		expect(() =>
			readConfig(
				{
					MARINHO_USUARIO: "claude",
					MARINHO_API_URL: "http://api.marinholocacoes.com",
				},
				"linux",
			),
		).toThrow(/https/);
		expect(
			readConfig(
				{
					MARINHO_USUARIO: "claude",
					MARINHO_API_URL: "http://localhost:3000/",
				},
				"linux",
			).apiUrl,
		).toBe("http://localhost:3000");
		expect(
			readConfig(
				{ MARINHO_USUARIO: "claude", MARINHO_API_URL: "http://server:3000" },
				"linux",
			).apiUrl,
		).toBe("http://server:3000");
	});

	it("lê a senha da variável quando existe", () => {
		const config = readConfig(
			{ MARINHO_USUARIO: "claude", MARINHO_SENHA: "segredo" },
			"linux",
		);
		expect(config.readPassword()).toBe("segredo");
	});

	it("fora do macOS e sem variável, explica como passar a senha", () => {
		const config = readConfig({ MARINHO_USUARIO: "claude" }, "linux");
		expect(() => config.readPassword()).toThrow(/MARINHO_SENHA/);
	});
});

describe("parseMode", () => {
	it("aceita leitura e completo, em qualquer caixa", () => {
		expect(parseMode(undefined)).toBe("leitura");
		expect(parseMode(" Completo ")).toBe("completo");
		expect(() => parseMode("tudo")).toThrow(ConfigError);
	});
});
