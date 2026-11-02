import { createFileRoute } from "@tanstack/react-router";
import { ChecklistScreen } from "@/features/inspections/checklist-screen";

export const Route = createFileRoute("/_auth/locacoes/$numero/volta/$unidade")({
	component: function VoltaRoute() {
		const { numero, unidade } = Route.useParams();
		return (
			<ChecklistScreen
				key={`${numero}-${unidade}`}
				rentalNumber={numero}
				unitCode={unidade}
				kind="RETURN"
			/>
		);
	},
});
