import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";
import { z } from "zod";

import { ScreenSkeleton } from "./components/page";
import { queryClient } from "./lib/query-client";
import { initSentry, reactErrorHandler } from "./lib/sentry";
import { routeTree } from "./routeTree.gen";

z.config(z.locales.pt());

const sentryEnabled = initSentry();

const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultPendingComponent: ScreenSkeleton,
	context: { queryClient },
	Wrap: function WrapComponent({ children }: { children: React.ReactNode }) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	},
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");

if (!rootElement) {
	throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
	const root = ReactDOM.createRoot(
		rootElement,
		sentryEnabled
			? {
					onUncaughtError: reactErrorHandler(),
					onCaughtError: reactErrorHandler(),
					onRecoverableError: reactErrorHandler(),
				}
			: undefined,
	);
	root.render(<RouterProvider router={router} />);
}
