import { R2Storage } from "@marinho-gestao/api";
import { createAuth } from "@marinho-gestao/auth";
import { createPrismaClient } from "@marinho-gestao/db";
import { createApp } from "./app";
import { ENV } from "./env.server";

const db = createPrismaClient(ENV);
const auth = createAuth(ENV, db);

export default createApp({
	db,
	auth,
	storage: new R2Storage({
		accountId: ENV.R2_ACCOUNT_ID,
		accessKeyId: ENV.R2_ACCESS_KEY_ID,
		secretAccessKey: ENV.R2_SECRET_ACCESS_KEY,
		bucket: ENV.R2_BUCKET,
	}),
	corsOrigin: ENV.CORS_ORIGIN,
	exposeApiReference: ENV.NODE_ENV !== "production",
});
