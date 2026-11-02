import type { Auth } from "@marinho-gestao/auth";
import type { Session } from "@marinho-gestao/contract";
import type { Database } from "@marinho-gestao/db";
import type { ObjectStorage } from "./storage/object-storage";

export type ApiContext = {
	db: Database;
	storage: ObjectStorage;
	clock: () => Date;
	session: Session | null;
	auth: Auth;
	authHeaders: () => Promise<Headers>;
};
