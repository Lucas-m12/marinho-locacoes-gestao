import { createFileRoute } from "@tanstack/react-router";
import { RentalScreen } from "@/features/rentals/rental-screen";

export const Route = createFileRoute("/_auth/locacoes/$numero/")({
	component: function LocacaoRoute() {
		const { numero } = Route.useParams();
		return <RentalScreen number={numero} />;
	},
});
