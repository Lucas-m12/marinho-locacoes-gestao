import type { AuthSession as Session } from "@marinho-gestao/auth";
import type { Database } from "@marinho-gestao/db";

export type Context = {
	session: Session | null;
	db: Database;
};
