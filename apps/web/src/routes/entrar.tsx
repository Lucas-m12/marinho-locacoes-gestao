import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { authGateway } from "@/data/auth";
import { SignInScreen } from "@/features/auth/sign-in-screen";

export const Route = createFileRoute("/entrar")({
	validateSearch: z.object({ redirect: z.string().optional() }),
	beforeLoad: async ({ search }) => {
		const session = await authGateway.getSession();
		if (session) throw redirect({ to: search.redirect ?? "/painel" });
	},
	component: function EntrarRoute() {
		const { redirect: redirectTo } = Route.useSearch();
		return <SignInScreen redirectTo={redirectTo} />;
	},
});
