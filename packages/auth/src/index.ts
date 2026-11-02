import type { Database } from "@marinho-gestao/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin, username } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export type AuthConfig = {
	BETTER_AUTH_URL: string;
	BETTER_AUTH_SECRET: string;
	CORS_ORIGIN: string;
	NODE_ENV: "development" | "production" | "test";
};

export const SESSION_DAYS = 90;

const accessControl = createAccessControl(defaultStatements);

const roles = {
	MANAGER: accessControl.newRole({
		user: ["create", "list", "set-role", "set-password", "get", "update"],
		session: ["list", "revoke"],
	}),
	ATTENDANT: accessControl.newRole({ user: [], session: [] }),
	EQUIPMENT: accessControl.newRole({ user: [], session: [] }),
};

export type AuthOptions = { rateLimit?: boolean };

export function createAuth(
	env: AuthConfig,
	database: Database,
	options: AuthOptions = {},
) {
	return betterAuth({
		database: prismaAdapter(database, { provider: "postgresql" }),
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: {
			enabled: true,
			disableSignUp: true,
			minPasswordLength: 8,
		},
		session: {
			expiresIn: 60 * 60 * 24 * SESSION_DAYS,
			updateAge: 60 * 60 * 24,
		},
		rateLimit: { enabled: options.rateLimit ?? true },
		plugins: [
			username(),
			admin({
				ac: accessControl,
				roles,
				defaultRole: "ATTENDANT",
				adminRoles: ["MANAGER"],
			}),
		],
		advanced: {
			defaultCookieAttributes: {
				sameSite: "lax",
				secure: env.NODE_ENV === "production",
				httpOnly: true,
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<
	Awaited<ReturnType<Auth["api"]["getSession"]>>
>;
