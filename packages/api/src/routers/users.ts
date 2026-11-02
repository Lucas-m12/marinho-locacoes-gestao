import { api, depsOf, requirePermission } from "../procedures";
import {
	createUser,
	listUsers,
	setUserPassword,
	setUserRole,
} from "../services/users";

const manage = requirePermission("users:manage");

export const users = {
	list: api.users.list
		.use(manage)
		.handler(({ context }) => listUsers(depsOf(context))),
	create: api.users.create
		.use(manage)
		.handler(({ context, input }) =>
			createUser(
				depsOf(context),
				{ auth: context.auth, headers: context.authHeaders },
				input,
			),
		),
	setRole: api.users.setRole
		.use(manage)
		.handler(({ context, input }) =>
			setUserRole(
				depsOf(context),
				{ auth: context.auth, headers: context.authHeaders },
				input,
			),
		),
	setPassword: api.users.setPassword
		.use(manage)
		.handler(({ context, input }) =>
			setUserPassword(
				depsOf(context),
				{ auth: context.auth, headers: context.authHeaders },
				input,
			),
		),
};
