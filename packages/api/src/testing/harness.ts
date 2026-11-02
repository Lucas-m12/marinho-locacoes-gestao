import { createAuth } from "@marinho-gestao/auth";
import type { AppClient, Session } from "@marinho-gestao/contract";
import { createPrismaClient } from "@marinho-gestao/db";
import { loadDemoSeed } from "@marinho-gestao/db/demo";
import { truncateAll } from "@marinho-gestao/db/maintenance-tasks";
import type { Role } from "@marinho-gestao/domain";
import { buildSeed, DEMO_PASSWORD } from "@marinho-gestao/read-model/seed";
import type { ScenarioHarness } from "@marinho-gestao/scenarios";
import { createRouterClient } from "@orpc/server";
import { hashPassword } from "better-auth/crypto";
import type { ApiContext } from "../context";
import { appRouter } from "../routers/index";
import { toContractSession } from "../session";
import { MemoryStorage } from "../storage/memory";

export const TEST_DATABASE_URL =
	process.env.TEST_DATABASE_URL ??
	"postgresql://postgres:postgres@localhost:5433/marinho_test";

export function createServerHarness() {
	const db = createPrismaClient({ DATABASE_URL: TEST_DATABASE_URL });
	const auth = createAuth(
		{
			BETTER_AUTH_URL: "http://localhost:3000",
			BETTER_AUTH_SECRET: "segredo-de-teste-com-mais-de-32-caracteres",
			CORS_ORIGIN: "http://localhost:3001",
			NODE_ENV: "test",
		},
		db,
	);
	let storage = new MemoryStorage();
	let now = new Date();
	let passwordHash: Promise<string> | null = null;
	const cookies = new Map<string, Promise<Headers>>();

	async function signInHeaders(username: string): Promise<Headers> {
		const { headers } = await auth.api.signInUsername({
			body: { username, password: DEMO_PASSWORD },
			returnHeaders: true,
		});
		const cookie = (headers.get("set-cookie") ?? "").split(";")[0] ?? "";
		return new Headers({ cookie });
	}

	function headersFor(username: string): Promise<Headers> {
		const cached = cookies.get(username);
		if (cached) return cached;
		const created = signInHeaders(username);
		cookies.set(username, created);
		return created;
	}

	async function sessionOf(role: Role): Promise<Session> {
		const user = await db.user.findFirst({
			where: { role, id: { startsWith: "user-" } },
		});
		if (!user?.username) throw new Error(`sem usuário ${role}`);
		return {
			user: {
				id: user.id,
				name: user.name,
				username: user.username,
				role,
			},
			expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
		};
	}

	function contextFor(session: Session | null): ApiContext {
		return {
			db,
			storage,
			clock: () => now,
			session,
			auth,
			authHeaders: () =>
				session
					? headersFor(session.user.username)
					: Promise.resolve(new Headers()),
		};
	}

	const harness: ScenarioHarness & {
		storage: () => MemoryStorage;
		clientWith: (session: Session | null) => AppClient;
		db: typeof db;
	} = {
		db,
		storage: () => storage,
		async reset(at) {
			now = at;
			storage = new MemoryStorage();
			cookies.clear();
			passwordHash ??= hashPassword(DEMO_PASSWORD);
			await truncateAll(db);
			await loadDemoSeed(db, buildSeed(at), await passwordHash, at);
		},
		setNow(at) {
			now = at;
		},
		clientAs(role) {
			const session = sessionOf(role);
			return createRouterClient(appRouter, {
				context: async () => contextFor(await session),
			});
		},
		clientWith(session) {
			return createRouterClient(appRouter, {
				context: () => contextFor(session),
			});
		},
		anonymous() {
			return createRouterClient(appRouter, {
				context: () => contextFor(null),
			});
		},
		async signIn(username, password) {
			const { headers } = await auth.api.signInUsername({
				body: { username, password },
				returnHeaders: true,
			});
			const cookie = (headers.get("set-cookie") ?? "").split(";")[0] ?? "";
			const session = toContractSession(
				await auth.api.getSession({ headers: new Headers({ cookie }) }),
			);
			if (!session) throw new Error("login sem sessão");
			return session;
		},
	};
	return harness;
}
