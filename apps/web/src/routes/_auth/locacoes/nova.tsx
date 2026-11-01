import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/features/auth/role-gate";
import { PlaceholderScreen } from "@/features/placeholder-screen";

export const Route = createFileRoute("/_auth/locacoes/nova")({
	component: () => (
		<RoleGate permission="rentals:sell">
			<PlaceholderScreen title="Nova locação" />
		</RoleGate>
	),
});
