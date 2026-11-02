import type { ErrorEvent } from "@sentry/react";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, withoutQuery } from "./sentry-scrub";

describe("withoutQuery", () => {
	it("tira a busca e o fragmento da URL", () => {
		expect(
			withoutQuery("https://sistema.marinholocacoes.com/clientes?q=José#x"),
		).toBe("https://sistema.marinholocacoes.com/clientes");
		expect(withoutQuery("/locacoes")).toBe("/locacoes");
	});
});

describe("scrubEvent", () => {
	it("não envia IP, cookies, corpo, busca nem cabeçalhos além do navegador", () => {
		const event: ErrorEvent = {
			type: undefined,
			message: "falhou",
			user: { ip_address: "200.1.2.3", username: "lucas" },
			request: {
				method: "GET",
				url: "https://sistema.marinholocacoes.com/clientes?q=Maria",
				query_string: "q=Maria",
				cookies: { session: "abc" },
				data: { name: "Maria" },
				headers: {
					"User-Agent": "Safari",
					Referer: "https://sistema.marinholocacoes.com/clientes?q=Maria",
					Cookie: "session=abc",
				},
			},
		};
		const scrubbed = scrubEvent(event);
		expect(scrubbed.user).toBeUndefined();
		expect(scrubbed.request).toEqual({
			method: "GET",
			url: "https://sistema.marinholocacoes.com/clientes",
			headers: { "User-Agent": "Safari" },
		});
		expect(JSON.stringify(scrubbed)).not.toContain("Maria");
		expect(scrubbed.message).toBe("falhou");
	});
});

describe("scrubBreadcrumb", () => {
	it("descarta o console e limpa as URLs de navegação e de fetch", () => {
		expect(scrubBreadcrumb({ category: "console", message: "x" })).toBeNull();
		expect(
			scrubBreadcrumb({
				category: "navigation",
				data: { from: "/clientes?q=Maria", to: "/clientes/1?aba=docs" },
			})?.data,
		).toEqual({ from: "/clientes", to: "/clientes/1" });
		expect(
			scrubBreadcrumb({
				category: "fetch",
				data: {
					url: "https://api.marinholocacoes.com/rpc/x?y=1",
					status_code: 500,
				},
			})?.data,
		).toEqual({
			url: "https://api.marinholocacoes.com/rpc/x",
			status_code: 500,
		});
	});
});
