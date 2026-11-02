import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/app-shell";
import { authGateway } from "@/data/auth";

export const Route = createFileRoute("/_auth")({
	beforeLoad: async ({ location }) => {
		const session = await authGateway.getSession();
		if (!session) {
			throw redirect({
				to: "/entrar",
				search: { redirect: location.href },
			});
		}
		return { session };
	},
	component: function AuthLayout() {
		const { session } = Route.useRouteContext();
		return (
			<AppShell user={session.user}>
				<Outlet />
			</AppShell>
		);
	},
});
