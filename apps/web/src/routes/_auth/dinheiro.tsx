import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/features/auth/role-gate";
import { PlaceholderScreen } from "@/features/placeholder-screen";

export const Route = createFileRoute("/_auth/dinheiro")({
	component: () => (
		<RoleGate permission="money:read">
			<PlaceholderScreen title="Dinheiro" />
		</RoleGate>
	),
});
