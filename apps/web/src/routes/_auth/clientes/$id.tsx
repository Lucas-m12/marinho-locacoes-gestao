import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/features/auth/role-gate";
import { CustomerScreen } from "@/features/customers/customer-screen";

export const Route = createFileRoute("/_auth/clientes/$id")({
	component: function ClienteRoute() {
		const { id } = Route.useParams();
		return (
			<RoleGate permission="customers:read">
				<CustomerScreen id={id} />
			</RoleGate>
		);
	},
});
