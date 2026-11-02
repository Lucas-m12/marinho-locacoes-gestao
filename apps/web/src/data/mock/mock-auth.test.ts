import { SCENARIO_NOW } from "@marinho-gestao/scenarios";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createMockAuthGateway, readMockSession } from "@/data/auth/mock";
import { InvalidCredentialsError } from "@/data/auth/types";
import { setMockLatency } from "./base";
import { resetMockClock, setMockClock } from "./clock";
import { resetDb } from "./db";

const NOW = SCENARIO_NOW;

afterAll(resetMockClock);

beforeEach(() => {
	setMockLatency(false);
	setMockClock(() => NOW);
	resetDb();
});

describe("login por usuário", () => {
	const gateway = createMockAuthGateway();

	it("entra com usuário e senha", async () => {
		const session = await gateway.signIn({
			username: "Atendimento",
			password: "marinho123",
			rememberMe: true,
		});
		expect(session.user).toEqual({
			id: "user-atendimento",
			name: "Atendimento",
			username: "atendimento",
			role: "ATTENDANT",
		});
		expect(JSON.stringify(session)).not.toContain("@marinho.local");
	});

	it("recusa senha errada", async () => {
		await expect(
			gateway.signIn({
				username: "lucas",
				password: "errada",
				rememberMe: true,
			}),
		).rejects.toBeInstanceOf(InvalidCredentialsError);
	});

	it("não aceita o e-mail interno como login", async () => {
		await expect(
			gateway.signIn({
				username: "lucas@marinho.local",
				password: "marinho123",
				rememberMe: true,
			}),
		).rejects.toBeInstanceOf(InvalidCredentialsError);
	});

	it("com continuar conectado, a sessão dura 90 dias", async () => {
		await gateway.signIn({
			username: "lucas",
			password: "marinho123",
			rememberMe: true,
		});
		setMockClock(() => new Date(NOW.getTime() + 89 * 86_400_000));
		expect(readMockSession()?.user.username).toBe("lucas");
		setMockClock(() => new Date(NOW.getTime() + 91 * 86_400_000));
		expect(readMockSession()).toBeNull();
	});

	it("sair encerra a sessão", async () => {
		await gateway.signIn({
			username: "lucas",
			password: "marinho123",
			rememberMe: false,
		});
		await gateway.signOut();
		expect(await gateway.getSession()).toBeNull();
	});
});
