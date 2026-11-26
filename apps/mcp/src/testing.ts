import { ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ApiSession, createApiClient, withSession } from "./api";
import type { Mode } from "./config";
import type { ToolAudit, ToolDeps } from "./tools";

export const API_URL = "https://api.exemplo.test";
export const ORIGIN = "https://sistema.exemplo.test";
export const NOW = new Date("2026-11-26T15:00:00Z");

/**
 * API falsa em memória: login do Better Auth (Set-Cookie) e /rpc com o
 * protocolo do oRPC. Só os procedimentos que os testes usam.
 */
export function fakeApi() {
	const state = {
		validCookie: "tok-1",
		signIns: 0,
		signInOrigins: [] as (string | null)[],
		paymentKeys: [] as string[],
		ledgerInputs: [] as unknown[],
		completedInputs: [] as Record<string, unknown>[],
	};
	const base = os.$context<{ cookie: string | null }>();
	const authed = base.use(({ context, next }) => {
		if (
			context.cookie !==
			`__Secure-better-auth.session_token=${state.validCookie}`
		) {
			throw new ORPCError("UNAUTHORIZED");
		}
		return next();
	});
	const router = {
		session: {
			me: authed.handler(() => ({
				user: {
					id: "u1",
					name: "Claude",
					username: "claude",
					role: "ATTENDANT",
				},
				expiresAt: "2027-02-24T15:00:00.000Z",
			})),
		},
		availability: {
			search: authed.handler(({ input }) => ({ echo: input })),
		},
		equipment: {
			listTypes: authed.handler(() => [
				{
					id: "t1",
					name: "Martelete",
					nicknames: ["rompedor"],
					dailyPriceCents: 8000,
					depositCents: null,
					turnaroundHours: 12,
					accessories: [],
					unitCount: 1,
				},
			]),
			listLots: authed.handler(() => [
				{
					id: "l1",
					code: "ANDAIME",
					name: "Andaime",
					nicknames: ["andaimes"],
					pricing: "PER_PIECE",
					total: 20,
					inMaintenance: 0,
					retired: 0,
					dailyPriceCents: 200,
					depositCents: null,
					kitComposition: null,
					turnaroundHours: 12,
					freeToday: 12,
					reservedToday: 8,
					nextBooking: null,
				},
			]),
		},
		customers: {
			list: authed.handler(() => ({
				customers: [
					{
						id: "c1",
						kind: "PROFESSIONAL",
						name: "João Pedreiro",
						taxId: "123.456.789-00",
						address: "Rua A, 10",
						responsible: null,
						authorizedReceivers: [],
						whatsapp: "82999990000",
						alternatePhone: null,
						neighborhood: "Centro",
						city: "Cajueiro",
						occupation: "pedreiro",
						origin: null,
						referredBy: null,
						acceptsPromotions: false,
						notes: null,
						blockedManually: false,
						blockReason: null,
						createdAt: "2026-11-20T10:00:00.000-03:00",
						tier: "NEW",
						stats: {
							rentalCount: 0,
							totalSpentCents: 0,
							lateCount: 0,
							openBalanceCents: 0,
						},
						lastRental: null,
						missingDocuments: ["PHOTO_ID"],
					},
				],
				counts: { ALL: 1, PROFESSIONALS: 1, HOME_RENOVATION: 0, ATTENTION: 0 },
			})),
		},
		rentals: {
			recordPayment: authed.handler(({ input }) => {
				const { idempotencyKey } = input as { idempotencyKey: string };
				state.paymentKeys.push(idempotencyKey);
				return { ok: true };
			}),
			recordCompleted: authed.handler(({ input }) => {
				state.completedInputs.push(input as Record<string, unknown>);
				return { number: "LOC-0040", status: "CLOSED", registeredAfter: true };
			}),
			createQuote: authed.handler(() => {
				throw new ORPCError("CONFLICT", {
					message: "O período escolhido está ocupado.",
					data: {
						conflicts: [
							{
								code: "MAR-002",
								name: "Martelete",
								rentalNumber: "LOC-0003",
								freeFrom: "2026-12-03T10:00:00.000-03:00",
								requestedQuantity: null,
								freeQuantity: null,
							},
						],
					},
				});
			}),
		},
		ledger: {
			create: authed.handler(({ input }) => {
				state.ledgerInputs.push(input);
				return {
					id: "l1",
					account: "CASH",
					direction: "OUT",
					category: "FUEL",
					amountCents: 5000,
					occurredAt: "2026-11-26T12:00:00.000-03:00",
					method: "PIX",
					description: "Gasolina da entrega",
					rentalNumber: null,
					unitCode: null,
					receiptFileKey: "receipts/2026/11/x.jpg",
					recordedBy: "Claude",
					reversalOfId: null,
					reversalOfDescription: null,
					reversalReason: null,
					reversedById: null,
				};
			}),
		},
	};
	const rpc = new RPCHandler(router);

	async function fetchImpl(input: Request | string, init?: RequestInit) {
		const request =
			typeof input === "string"
				? new Request(input, init)
				: new Request(input, init);
		const url = new URL(request.url);
		if (url.pathname === "/api/auth/sign-in/username") {
			state.signIns += 1;
			state.signInOrigins.push(request.headers.get("origin"));
			const body = (await request.json()) as {
				username: string;
				password: string;
			};
			if (body.username !== "claude" || body.password !== "senha-certa") {
				return new Response(
					JSON.stringify({ code: "INVALID_USERNAME_OR_PASSWORD" }),
					{ status: 401 },
				);
			}
			const headers = new Headers({ "content-type": "application/json" });
			headers.append(
				"set-cookie",
				`__Secure-better-auth.session_token=${state.validCookie}; Path=/; HttpOnly; Secure; SameSite=Lax`,
			);
			return new Response("{}", { status: 200, headers });
		}
		if (url.pathname === "/api/auth/sign-out") return new Response("{}");
		const { matched, response } = await rpc.handle(request, {
			prefix: "/rpc",
			context: { cookie: request.headers.get("cookie") },
		});
		return matched ? response : new Response("not found", { status: 404 });
	}

	return { state, fetchImpl };
}

/** Dependências das ferramentas ligadas à API falsa, como no stdio e no HTTP. */
export function fakeDeps(mode: Mode, password = "senha-certa") {
	const api = fakeApi();
	const options = {
		apiUrl: API_URL,
		origin: ORIGIN,
		username: "claude",
		readPassword: () => password,
		fetch: api.fetchImpl,
	};
	const session = new ApiSession(options);
	const audits: ToolAudit[] = [];
	const deps: ToolDeps = {
		api: createApiClient(session, options),
		mode,
		apiUrl: API_URL,
		now: () => NOW,
		call: (run) => withSession(session, run),
		audit: (entry) => audits.push(entry),
	};
	return { api, deps, audits };
}
