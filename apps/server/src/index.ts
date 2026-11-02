import { createAuth } from "@marinho-gestao/auth";
import { createPrismaClient } from "@marinho-gestao/db";
import { createApp } from "./app";
import { ENV } from "./env.server";
import { initSentry, reportError } from "./sentry";
import { uploadsStorage } from "./storage";
import { loadTestHooks } from "./test-hooks";

const db = createPrismaClient(ENV);
const storage = uploadsStorage(ENV);
const testHooks = await loadTestHooks(ENV, { db, storage });
const sentryEnabled = initSentry(ENV, "api");
const auth = createAuth(ENV, db, { rateLimit: testHooks === null });

export default createApp({
	db,
	auth,
	storage,
	corsOrigin: ENV.CORS_ORIGIN,
	exposeApiReference: ENV.NODE_ENV !== "production",
	clock: testHooks?.clock.now,
	testRoutes: testHooks?.routes,
	reportError: sentryEnabled ? reportError : undefined,
});
