import type { Auth } from "@marinho-gestao/auth";
import type {
	CreateUserInput,
	CreateUserInput as CreateUserSchema,
	SetUserPasswordInput as SetPasswordSchema,
	SetUserPasswordInput,
	User,
} from "@marinho-gestao/contract";
import { internalEmail, ROLES, type Role } from "@marinho-gestao/domain";
import { notFound, precondition } from "@marinho-gestao/read-model/errors";
import type { z } from "zod";
import { isUniqueViolation } from "../errors";
import type { ServiceDeps } from "./deps";
import { recordEvent } from "./events";

export type AuthAdmin = { auth: Auth; headers: () => Promise<Headers> };

type UserRow = {
	id: string;
	name: string;
	username: string | null;
	role: string | null;
};

function roleOf(value: string | null): Role {
	return (ROLES as readonly string[]).includes(value ?? "")
		? (value as Role)
		: "ATTENDANT";
}

function userView(row: UserRow): User {
	return {
		id: row.id,
		name: row.name,
		username: row.username ?? "",
		role: roleOf(row.role),
	};
}

const userSelect = {
	id: true,
	name: true,
	username: true,
	role: true,
} as const;

async function requireUser(deps: ServiceDeps, id: string): Promise<UserRow> {
	const user = await deps.db.user.findUnique({
		where: { id },
		select: userSelect,
	});
	if (!user) throw notFound("user", id);
	return user;
}

export async function listUsers(deps: ServiceDeps): Promise<User[]> {
	const rows = await deps.db.user.findMany({
		select: userSelect,
		orderBy: { createdAt: "asc" },
	});
	return rows.map(userView);
}

export async function createUser(
	deps: ServiceDeps,
	admin: AuthAdmin,
	input: z.output<typeof CreateUserSchema>,
): Promise<User> {
	const taken = await deps.db.user.findUnique({
		where: { username: input.username },
		select: { id: true },
	});
	if (taken) throw precondition("DUPLICATE", [input.username]);
	try {
		const { user } = await admin.auth.api.createUser({
			headers: await admin.headers(),
			body: {
				email: internalEmail(input.username),
				name: input.name,
				password: input.password,
				role: input.role,
				data: { username: input.username, displayUsername: input.username },
			},
		});
		await recordEvent(deps.db, {
			actor: deps.actor,
			action: "user.created",
			entity: "User",
			entityId: user.id,
			at: deps.clock(),
			payload: { username: input.username, role: input.role },
		});
		return userView(await requireUser(deps, user.id));
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw precondition("DUPLICATE", [input.username]);
		}
		throw error;
	}
}

export async function setUserRole(
	deps: ServiceDeps,
	admin: AuthAdmin,
	input: { id: string; role: Role },
): Promise<User> {
	await requireUser(deps, input.id);
	await admin.auth.api.setRole({
		headers: await admin.headers(),
		body: { userId: input.id, role: input.role },
	});
	await recordEvent(deps.db, {
		actor: deps.actor,
		action: "user.roleChanged",
		entity: "User",
		entityId: input.id,
		at: deps.clock(),
		payload: { role: input.role },
	});
	return userView(await requireUser(deps, input.id));
}

export async function setUserPassword(
	deps: ServiceDeps,
	admin: AuthAdmin,
	input: z.output<typeof SetPasswordSchema>,
): Promise<User> {
	await requireUser(deps, input.id);
	await admin.auth.api.setUserPassword({
		headers: await admin.headers(),
		body: { userId: input.id, newPassword: input.newPassword },
	});
	await recordEvent(deps.db, {
		actor: deps.actor,
		action: "user.passwordReset",
		entity: "User",
		entityId: input.id,
		at: deps.clock(),
	});
	return userView(await requireUser(deps, input.id));
}

export type { CreateUserInput, SetUserPasswordInput };
