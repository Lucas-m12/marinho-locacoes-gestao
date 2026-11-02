import { createFileRoute } from "@tanstack/react-router";
import { UnitScreen } from "@/features/equipment/unit-screen";

export const Route = createFileRoute("/_auth/estoque/$codigo")({
	component: function UnidadeRoute() {
		const { codigo } = Route.useParams();
		return <UnitScreen code={codigo} />;
	},
});
