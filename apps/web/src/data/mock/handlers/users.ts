import type { User } from "@marinho-gestao/contract";
import { api, requirePermission } from "../base";
import { getDb, nextId, type UserRecord } from "../db";
import { notFound, precondition } from "../errors";

function userView({ password: _password, ...user }: UserRecord): User {
	return user;
}

export const users = {
	list: api.users.list.handler(({ context }) => {
		requirePermission(context, "users:manage");
		return getDb().users.map(userView);
	}),

	create: api.users.create.handler(({ context, input }) => {
		requirePermission(context, "users:manage");
		const db = getDb();
		const email = input.email.toLowerCase();
		if (db.users.some((user) => user.email.toLowerCase() === email)) {
			throw precondition("DUPLICATE", [email]);
		}
		const user: UserRecord = { ...input, email, id: nextId(db, "user") };
		db.users.push(user);
		return userView(user);
	}),

	update: api.users.update.handler(({ context, input }) => {
		requirePermission(context, "users:manage");
		const user = getDb().users.find((entry) => entry.id === input.id);
		if (!user) throw notFound("user", input.id);
		user.role = input.role;
		return userView(user);
	}),
};
