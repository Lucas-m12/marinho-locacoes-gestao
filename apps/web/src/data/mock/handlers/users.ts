import type { User } from "@marinho-gestao/contract";
import { notFound, precondition } from "@marinho-gestao/read-model";
import { api, requirePermission } from "../base";
import { getDb, type MockDb, nextId, type UserRecord } from "../db";

function userView(user: UserRecord): User {
	return {
		id: user.id,
		name: user.name,
		username: user.username,
		role: user.role,
	};
}

function requireUser(db: MockDb, id: string): UserRecord {
	const user = db.users.find((entry) => entry.id === id);
	if (!user) throw notFound("user", id);
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
		if (db.users.some((user) => user.username === input.username)) {
			throw precondition("DUPLICATE", [input.username]);
		}
		const user: UserRecord = {
			...input,
			email: `${input.username}@marinho.local`,
			id: nextId(db, "user"),
		};
		db.users.push(user);
		return userView(user);
	}),

	setRole: api.users.setRole.handler(({ context, input }) => {
		requirePermission(context, "users:manage");
		const user = requireUser(getDb(), input.id);
		user.role = input.role;
		return userView(user);
	}),

	setPassword: api.users.setPassword.handler(({ context, input }) => {
		requirePermission(context, "users:manage");
		const user = requireUser(getDb(), input.id);
		user.password = input.newPassword;
		return userView(user);
	}),
};
