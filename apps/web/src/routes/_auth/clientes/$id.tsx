import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/features/auth/role-gate";
import { PlaceholderScreen } from "@/features/placeholder-screen";

export const Route = createFileRoute("/_auth/clientes/$id")({
	component: () => (
		<RoleGate permission="customers:read">
			<PlaceholderScreen title="Cliente" />
		</RoleGate>
	),
});
