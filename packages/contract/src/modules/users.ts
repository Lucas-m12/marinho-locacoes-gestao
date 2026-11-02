import { z } from "zod";
import { base } from "../base";
import { Id, Role } from "../common";

export const Username = z
	.string()
	.trim()
	.toLowerCase()
	.regex(
		/^[a-z0-9_.]{3,30}$/,
		"Use de 3 a 30 letras, números, ponto ou sublinhado",
	);

export const Password = z.string().min(8, "Use pelo menos 8 caracteres");

export const User = z.object({
	id: Id,
	name: z.string(),
	username: z.string(),
	role: Role,
});
export type User = z.infer<typeof User>;

export const CreateUserInput = z.object({
	name: z.string().trim().min(2, "Informe o nome"),
	username: Username,
	role: Role,
	password: Password,
});
export type CreateUserInput = z.input<typeof CreateUserInput>;

export const SetUserRoleInput = z.object({ id: Id, role: Role });

export const SetUserPasswordInput = z.object({ id: Id, newPassword: Password });
export type SetUserPasswordInput = z.input<typeof SetUserPasswordInput>;

export const users = {
	list: base.output(z.array(User)),
	create: base.input(CreateUserInput).output(User),
	setRole: base.input(SetUserRoleInput).output(User),
	setPassword: base.input(SetUserPasswordInput).output(User),
};
