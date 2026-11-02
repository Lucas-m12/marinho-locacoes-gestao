import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateAfter } from "@/data/invalidation";
import { describeError, errorCode, isLocallyHandled } from "./errors";

function redirectToLogin() {
	if (!window.location.pathname.startsWith("/entrar")) {
		window.location.assign("/entrar");
	}
}

export const queryClient: QueryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 15_000,
			retry: (failureCount, error) =>
				errorCode(error) === null && failureCount < 2,
		},
	},
	queryCache: new QueryCache({
		onError: (error) => {
			if (errorCode(error) === "UNAUTHORIZED") {
				redirectToLogin();
				return;
			}
			if (!isLocallyHandled(error)) {
				const message = describeError(error);
				toast.error(message, { id: message });
			}
		},
	}),
	mutationCache: new MutationCache({
		onSuccess: (_data, _variables, _context, mutation) =>
			invalidateAfter(queryClient, mutation.options.mutationKey),
		onError: (error) => {
			if (errorCode(error) === "UNAUTHORIZED") {
				redirectToLogin();
				return;
			}
			if (!isLocallyHandled(error)) toast.error(describeError(error));
		},
	}),
});
