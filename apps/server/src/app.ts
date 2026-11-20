import type { ObjectStorage } from "@marinho-gestao/api";
import {
	type ApiContext,
	appRouter,
	findCatalogPhotoKey,
	listCatalogFeedItems,
	toContractSession,
} from "@marinho-gestao/api";
import type { Auth } from "@marinho-gestao/auth";
import type { Database } from "@marinho-gestao/db";
import { catalogFeedCsv } from "@marinho-gestao/domain";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { errorFields, log } from "./logger";

export type AppServices = {
	db: Database;
	auth: Auth;
	storage: ObjectStorage;
	corsOrigin: string;
	/** Endereço público desta API, usado nos links de foto do catálogo. */
	publicUrl: string;
	/** Página para onde os itens do catálogo levam. */
	landingUrl?: string;
	exposeApiReference: boolean;
	clock?: () => Date;
	testRoutes?: Hono;
	reportError?: (error: unknown, tags?: Record<string, string>) => void;
};

type Variables = { userId: string | null };

const DEFAULT_LANDING_URL = "https://marinholocacoes.com";
const CATALOG_CODE = /^[A-Z]+(-\d+)?$/;

function isUnexpected(error: unknown): boolean {
	return !(error instanceof ORPCError) || error.status >= 500;
}

export function createApp(services: AppServices) {
	const clock = services.clock ?? (() => new Date());
	const app = new Hono<{ Variables: Variables }>();

	const rpcHandler = new RPCHandler(appRouter, {
		clientInterceptors: [
			onError((error) => {
				if (isUnexpected(error)) {
					log("error", "unexpected error", errorFields(error));
					services.reportError?.(error, { layer: "rpc" });
				}
			}),
		],
	});
	const referenceHandler = services.exposeApiReference
		? new OpenAPIHandler(appRouter, {
				plugins: [
					new OpenAPIReferencePlugin({
						schemaConverters: [new ZodToJsonSchemaConverter()],
					}),
				],
			})
		: null;

	app.use(requestId());
	app.use(async (c, next) => {
		const started = performance.now();
		c.set("userId", null);
		await next();
		const path = new URL(c.req.url).pathname;
		log("info", "request", {
			requestId: c.get("requestId"),
			method: c.req.method,
			path: path.startsWith("/api/auth/") ? "/api/auth/*" : path,
			procedure: path.startsWith("/rpc/") ? path.slice(5) : null,
			userId: c.get("userId"),
			status: c.res.status,
			durationMs: Math.round(performance.now() - started),
		});
	});
	app.use(
		"/*",
		cors({
			origin: services.corsOrigin,
			allowMethods: ["GET", "POST", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		}),
	);

	app.get("/health", async (c) => {
		try {
			await services.db.$queryRaw`select 1`;
			return c.json({ ok: true });
		} catch (error) {
			log("error", "health check failed", errorFields(error));
			return c.json({ ok: false }, 503);
		}
	});

	// Catálogo público para a Meta (Gerenciador de Comércio busca este arquivo
	// de tempos em tempos). Sem sessão: só leva o que já vai para o cliente.
	app.get("/catalogo/feed.csv", async (c) => {
		const items = await listCatalogFeedItems(services.db);
		const csv = catalogFeedCsv(items, {
			landingUrl: services.landingUrl ?? DEFAULT_LANDING_URL,
			apiUrl: services.publicUrl,
		});
		return c.body(csv, 200, {
			"Content-Type": "text/csv; charset=utf-8",
			"Cache-Control": "public, max-age=900",
		});
	});

	app.get("/catalogo/fotos/:code", async (c) => {
		const code = c.req.param("code");
		if (!CATALOG_CODE.test(code)) return c.json({ error: "NOT_FOUND" }, 404);
		const fileKey = await findCatalogPhotoKey(services.db, code);
		if (!fileKey) return c.json({ error: "NOT_FOUND" }, 404);
		const upstream = await fetch(
			await services.storage.presignGet(fileKey, 300),
		);
		if (!upstream.ok || !upstream.body) {
			log("error", "catalog photo fetch failed", {
				code,
				status: upstream.status,
			});
			return c.json({ error: "PHOTO_UNAVAILABLE" }, 502);
		}
		return new Response(upstream.body, {
			headers: {
				"Content-Type":
					upstream.headers.get("content-type") ?? "application/octet-stream",
				"Cache-Control": "public, max-age=86400",
			},
		});
	});

	app.on(["POST", "GET"], "/api/auth/*", (c) =>
		services.auth.handler(c.req.raw),
	);

	if (services.testRoutes) app.route("/__test", services.testRoutes);

	app.use("/*", async (c, next) => {
		const path = new URL(c.req.url).pathname;
		const isRpc = path.startsWith("/rpc/");
		const isReference =
			referenceHandler !== null && path.startsWith("/api-reference");
		if (!isRpc && !isReference) return next();

		const headers = c.req.raw.headers;
		const session = toContractSession(
			await services.auth.api.getSession({ headers }),
		);
		c.set("userId", session?.user.id ?? null);
		const context: ApiContext = {
			db: services.db,
			storage: services.storage,
			clock,
			session,
			auth: services.auth,
			authHeaders: async () => headers,
		};

		const result = isRpc
			? await rpcHandler.handle(c.req.raw, { prefix: "/rpc", context })
			: await referenceHandler?.handle(c.req.raw, {
					prefix: "/api-reference",
					context,
				});
		if (result?.matched) {
			return c.newResponse(result.response.body, result.response);
		}
		return next();
	});

	app.notFound((c) => c.json({ error: "NOT_FOUND" }, 404));
	app.onError((error, c) => {
		log("error", "unhandled error", {
			requestId: c.get("requestId"),
			...errorFields(error),
		});
		services.reportError?.(error, {
			layer: "http",
			requestId: c.get("requestId"),
		});
		return c.json({ error: "INTERNAL_SERVER_ERROR" }, 500);
	});

	return app;
}
