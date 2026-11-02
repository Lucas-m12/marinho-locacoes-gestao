import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/features/auth/role-gate";
import { MaintenanceScreen } from "@/features/maintenance/maintenance-screen";

export const Route = createFileRoute("/_auth/manutencao")({
	component: () => (
		<RoleGate permission="maintenance:read">
			<MaintenanceScreen />
		</RoleGate>
	),
});
