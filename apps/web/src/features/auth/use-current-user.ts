import { can, type Permission } from "@marinho-gestao/domain";
import { useRouteContext } from "@tanstack/react-router";

export function useCurrentUser() {
	return useRouteContext({ from: "/_auth", select: (c) => c.session.user });
}

export function useCan(permission: Permission): boolean {
	const user = useCurrentUser();
	return can(user.role, permission);
}
