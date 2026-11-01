import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderScreen } from "@/features/placeholder-screen";

export const Route = createFileRoute("/_auth/locacoes/$numero/saida/$unidade")({
	component: () => <PlaceholderScreen title="Saída" />,
});
