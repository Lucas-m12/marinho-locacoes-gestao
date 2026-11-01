import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/features/auth/role-gate";
import { PlaceholderScreen } from "@/features/placeholder-screen";

export const Route = createFileRoute("/_auth/configuracoes")({
	component: () => (
		<RoleGate permission="settings:manage">
			<PlaceholderScreen title="Configurações" />
		</RoleGate>
	),
});
