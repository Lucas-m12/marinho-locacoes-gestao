import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderScreen } from "@/features/placeholder-screen";

export const Route = createFileRoute("/_auth/estoque/")({
	component: () => <PlaceholderScreen title="Estoque" />,
});
