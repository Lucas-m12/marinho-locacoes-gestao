import { api } from "../procedures";

export const session = {
	me: api.session.me.handler(({ context }) => {
		if (!context.session) throw new Error("sessão ausente");
		return context.session;
	}),
};
