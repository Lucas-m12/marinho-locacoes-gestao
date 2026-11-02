import type { AuthSession } from "@marinho-gestao/auth";
import type { Session } from "@marinho-gestao/contract";
import { Role } from "@marinho-gestao/contract";

export function toContractSession(
	authSession: AuthSession | null,
): Session | null {
	if (!authSession) return null;
	const role = Role.safeParse(authSession.user.role);
	if (!role.success) return null;
	return {
		user: {
			id: authSession.user.id,
			name: authSession.user.name,
			username: authSession.user.username ?? "",
			role: role.data,
		},
		expiresAt: authSession.session.expiresAt.toISOString(),
	};
}
