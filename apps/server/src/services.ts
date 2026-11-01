import { createAuth } from "@marinho-gestao/auth";
import { createPrismaClient } from "@marinho-gestao/db";

import { ENV } from "./env.server";

export const db = createPrismaClient(ENV);
export const auth = createAuth(ENV, db);
