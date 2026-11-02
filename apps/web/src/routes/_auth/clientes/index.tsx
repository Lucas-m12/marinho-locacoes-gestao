import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { RoleGate } from "@/features/auth/role-gate";
import {
	CustomersScreen,
	CustomersSearch,
} from "@/features/customers/customers-screen";

export const Route = createFileRoute("/_auth/clientes/")({
	validateSearch: CustomersSearch,
	component: function ClientesRoute() {
		const search = Route.useSearch();
		const navigate = useNavigate({ from: Route.fullPath });
		const onSearchChange = useCallback(
			(next: CustomersSearch) => {
				navigate({ search: next, replace: true });
			},
			[navigate],
		);
		return (
			<RoleGate permission="customers:read">
				<CustomersScreen search={search} onSearchChange={onSearchChange} />
			</RoleGate>
		);
	},
});
