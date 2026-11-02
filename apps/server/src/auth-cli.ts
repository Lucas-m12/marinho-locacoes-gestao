import { createAuth } from "@marinho-gestao/auth";
import { createPrismaClient } from "@marinho-gestao/db";
import { ENV } from "./env.server";

export const auth = createAuth(ENV, createPrismaClient(ENV));
