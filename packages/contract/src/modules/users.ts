import { z } from "zod";
import { base } from "../base";
import { Id, Role } from "../common";

export const User = z.object({
	id: Id,
	name: z.string(),
	email: z.email(),
	role: Role,
});
export type User = z.infer<typeof User>;

export const CreateUserInput = z.object({
	name: z.string().trim().min(2, "Informe o nome"),
	email: z.email("Informe um e-mail válido"),
	role: Role,
	password: z.string().min(8, "Use pelo menos 8 caracteres"),
});
export type CreateUserInput = z.input<typeof CreateUserInput>;

export const users = {
	list: base.output(z.array(User)),
	create: base.input(CreateUserInput).output(User),
	update: base.input(z.object({ id: Id, role: Role })).output(User),
};
