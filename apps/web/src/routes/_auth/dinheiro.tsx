import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RoleGate } from "@/features/auth/role-gate";
import { MoneyScreen, MoneySearch } from "@/features/money/money-screen";

export const Route = createFileRoute("/_auth/dinheiro")({
	validateSearch: MoneySearch,
	component: function DinheiroRoute() {
		const search = Route.useSearch();
		const navigate = useNavigate({ from: Route.fullPath });
		return (
			<RoleGate permission="money:read">
				<MoneyScreen
					search={search}
					onSearchChange={(next) => navigate({ search: next, replace: true })}
				/>
			</RoleGate>
		);
	},
});
