import { createFileRoute } from "@tanstack/react-router";
import { MoreScreen } from "@/features/more/more-screen";

export const Route = createFileRoute("/_auth/mais")({
	component: MoreScreen,
});
