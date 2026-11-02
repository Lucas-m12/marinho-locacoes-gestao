import { createFileRoute } from "@tanstack/react-router";
import { DashboardScreen } from "@/features/dashboard/dashboard-screen";

export const Route = createFileRoute("/_auth/painel")({
	component: DashboardScreen,
});
