import { ORPCError } from "@orpc/server";
import { api } from "../base";

export const session = {
	me: api.session.me.handler(({ context }) => {
		if (!context.session) throw new ORPCError("UNAUTHORIZED");
		return context.session;
	}),
};
