import { contract, type SessionUser } from "@marinho-gestao/contract";
import { can, type Permission } from "@marinho-gestao/domain";
import { implement, ORPCError } from "@orpc/server";
import type { ApiContext } from "./context";
import type { ServiceDeps } from "./services/deps";
import { expireStaleQuotes } from "./services/expire";

export const os = implement(contract).$context<ApiContext>();

const authenticated = os.middleware(async ({ context, next }) => {
	const user = context.session?.user;
	if (!user) throw new ORPCError("UNAUTHORIZED");
	await expireStaleQuotes(context.db, context.clock());
	return next({ context: { user } });
});

export const api = os.use(authenticated);

export function requireRole(...roles: SessionUser["role"][]) {
	return os
		.$context<ApiContext & { user: SessionUser }>()
		.middleware(({ context, next }) => {
			if (!roles.includes(context.user.role)) {
				throw new ORPCError("FORBIDDEN");
			}
			return next();
		});
}

export function requirePermission(permission: Permission) {
	return os
		.$context<ApiContext & { user: SessionUser }>()
		.middleware(({ context, next }) => {
			if (!can(context.user.role, permission)) {
				throw new ORPCError("FORBIDDEN");
			}
			return next();
		});
}

export function depsOf(
	context: ApiContext & { user: SessionUser },
): ServiceDeps {
	return {
		db: context.db,
		storage: context.storage,
		clock: context.clock,
		actor: context.user,
	};
}
