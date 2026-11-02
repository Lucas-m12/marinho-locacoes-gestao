import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RoleGate } from "@/features/auth/role-gate";
import {
	SettingsScreen,
	SettingsSearch,
} from "@/features/settings/settings-screen";

export const Route = createFileRoute("/_auth/configuracoes")({
	validateSearch: SettingsSearch,
	component: function ConfiguracoesRoute() {
		const search = Route.useSearch();
		const navigate = useNavigate({ from: Route.fullPath });
		return (
			<RoleGate permission="settings:manage">
				<SettingsScreen
					search={search}
					onSearchChange={(next) => navigate({ search: next, replace: true })}
				/>
			</RoleGate>
		);
	},
});
