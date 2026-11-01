import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderScreen } from "@/features/placeholder-screen";

export const Route = createFileRoute("/_auth/locacoes/")({
	component: () => <PlaceholderScreen title="Locações" />,
});
