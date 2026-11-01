import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import {
	RentalsScreen,
	RentalsSearch,
} from "@/features/rentals/rentals-screen";

export const Route = createFileRoute("/_auth/locacoes/")({
	validateSearch: RentalsSearch,
	component: function LocacoesRoute() {
		const search = Route.useSearch();
		const navigate = useNavigate({ from: Route.fullPath });
		const onSearchChange = useCallback(
			(next: RentalsSearch) => {
				navigate({ search: next, replace: true });
			},
			[navigate],
		);
		return <RentalsScreen search={search} onSearchChange={onSearchChange} />;
	},
});
