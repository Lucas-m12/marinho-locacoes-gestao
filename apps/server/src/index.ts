import { MemoryStorage } from "@marinho-gestao/api";
import { createAuth } from "@marinho-gestao/auth";
import { createPrismaClient } from "@marinho-gestao/db";
import { createApp } from "./app";
import { ENV } from "./env.server";

const db = createPrismaClient(ENV);
const auth = createAuth(ENV, db);

export default createApp({
	db,
	auth,
	storage: new MemoryStorage(),
	corsOrigin: ENV.CORS_ORIGIN,
	exposeApiReference: ENV.NODE_ENV !== "production",
});
