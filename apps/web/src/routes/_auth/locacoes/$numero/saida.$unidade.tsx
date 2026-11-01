import { createFileRoute } from "@tanstack/react-router";
import { ChecklistScreen } from "@/features/inspections/checklist-screen";

export const Route = createFileRoute("/_auth/locacoes/$numero/saida/$unidade")({
	component: function SaidaRoute() {
		const { numero, unidade } = Route.useParams();
		return (
			<ChecklistScreen
				key={`${numero}-${unidade}`}
				rentalNumber={numero}
				unitCode={unidade}
				kind="CHECKOUT"
			/>
		);
	},
});
