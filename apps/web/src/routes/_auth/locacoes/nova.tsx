import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RoleGate } from "@/features/auth/role-gate";
import { PlaceholderScreen } from "@/features/placeholder-screen";

export const Route = createFileRoute("/_auth/locacoes/nova")({
	validateSearch: z.object({
		item: z.string().optional(),
		saida: z.string().optional(),
		devolucao: z.string().optional(),
		cliente: z.string().optional(),
	}),
	component: () => (
		<RoleGate permission="rentals:sell">
			<PlaceholderScreen title="Nova locação" />
		</RoleGate>
	),
});
