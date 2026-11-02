import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RoleGate } from "@/features/auth/role-gate";
import { NewRentalScreen } from "@/features/rentals/new-rental-screen";

export const Route = createFileRoute("/_auth/locacoes/nova")({
	validateSearch: z.object({
		item: z.string().optional(),
		saida: z.string().optional(),
		devolucao: z.string().optional(),
		cliente: z.string().optional(),
	}),
	component: function NovaLocacaoRoute() {
		const search = Route.useSearch();
		return (
			<RoleGate permission="rentals:sell">
				<NewRentalScreen search={search} />
			</RoleGate>
		);
	},
});
