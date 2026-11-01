import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderScreen } from "@/features/placeholder-screen";

export const Route = createFileRoute("/_auth/painel")({
	component: () => <PlaceholderScreen title="Painel" />,
});
