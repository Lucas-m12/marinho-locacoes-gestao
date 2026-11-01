import { z } from "zod";
import { base } from "../base";
import { Id, IsoDateTime, Role } from "../common";

export const SessionUser = z.object({
	id: Id,
	name: z.string(),
	email: z.email(),
	role: Role,
});
export type SessionUser = z.infer<typeof SessionUser>;

export const Session = z.object({
	user: SessionUser,
	expiresAt: IsoDateTime,
});
export type Session = z.infer<typeof Session>;

export const session = {
	me: base.output(Session),
};
