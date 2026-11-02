import type { ErrorEvent } from "@sentry/bun";
import { describe, expect, it } from "vitest";
import { scrubEvent } from "./sentry";

describe("scrubEvent", () => {
	it("não envia IP, cookies, corpo, busca nem cabeçalhos com dados pessoais", () => {
		const event: ErrorEvent = {
			type: undefined,
			message: "falhou",
			user: { id: "u1", ip_address: "200.1.2.3" },
			request: {
				method: "POST",
				url: "https://api.marinholocacoes.com/rpc/customers/list?q=Maria",
				query_string: "q=Maria",
				cookies: { "__Secure-better-auth.session_token": "abc" },
				data: '{"json":{"name":"Maria"}}',
				headers: {
					"user-agent": "Safari",
					"content-type": "application/json",
					cookie: "__Secure-better-auth.session_token=abc",
					"x-forwarded-for": "200.1.2.3",
					authorization: "Bearer x",
				},
			},
		};
		const scrubbed = scrubEvent(event);
		expect(scrubbed.user).toBeUndefined();
		expect(scrubbed.request).toEqual({
			method: "POST",
			url: "https://api.marinholocacoes.com/rpc/customers/list",
			headers: { "user-agent": "Safari", "content-type": "application/json" },
		});
		const serialized = JSON.stringify(scrubbed);
		expect(serialized).not.toContain("Maria");
		expect(serialized).not.toContain("200.1.2.3");
		expect(serialized).not.toContain("abc");
	});

	it("mantém o evento sem requisição como está", () => {
		expect(scrubEvent({ type: undefined, message: "x" })).toEqual({
			type: undefined,
			message: "x",
		});
	});
});
