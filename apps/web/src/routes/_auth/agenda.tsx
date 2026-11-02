import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgendaScreen, AgendaSearch } from "@/features/agenda/agenda-screen";

export const Route = createFileRoute("/_auth/agenda")({
	validateSearch: AgendaSearch,
	component: function AgendaRoute() {
		const search = Route.useSearch();
		const navigate = useNavigate({ from: Route.fullPath });
		return (
			<AgendaScreen
				search={search}
				onSearchChange={(next) => navigate({ search: next })}
			/>
		);
	},
});
