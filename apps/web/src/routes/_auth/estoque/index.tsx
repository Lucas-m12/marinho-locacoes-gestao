import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { StockScreen, StockSearch } from "@/features/equipment/stock-screen";

export const Route = createFileRoute("/_auth/estoque/")({
	validateSearch: StockSearch,
	component: function EstoqueRoute() {
		const search = Route.useSearch();
		const navigate = useNavigate({ from: Route.fullPath });
		const onSearchChange = useCallback(
			(next: StockSearch) => {
				navigate({ search: next, replace: true });
			},
			[navigate],
		);
		return <StockScreen search={search} onSearchChange={onSearchChange} />;
	},
});
