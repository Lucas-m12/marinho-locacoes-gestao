import { createAuth } from "@marinho-gestao/auth";
import { createPrismaClient } from "@marinho-gestao/db";
import { createApp } from "./app";
import { ENV } from "./env.server";
import { uploadsStorage } from "./storage";

const db = createPrismaClient(ENV);
const auth = createAuth(ENV, db);

export default createApp({
	db,
	auth,
	storage: uploadsStorage(ENV),
	corsOrigin: ENV.CORS_ORIGIN,
	exposeApiReference: ENV.NODE_ENV !== "production",
});
