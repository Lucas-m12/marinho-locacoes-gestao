import { Toaster } from "@marinho-gestao/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
} from "@tanstack/react-router";

import "../index.css";

export interface RouterAppContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{ title: "Marinho Locações" },
			{
				name: "description",
				content: "Sistema de gestão da Marinho Locações",
			},
		],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<Outlet />
			<Toaster richColors position="top-center" />
		</>
	);
}
