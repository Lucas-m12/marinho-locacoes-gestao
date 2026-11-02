import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { orpc } from "@/data/client";

export function useCopyQuoteText() {
	return useMutation(
		orpc.rentals.copyQuoteText.mutationOptions({
			onSuccess: async ({ text }) => {
				try {
					await navigator.clipboard.writeText(text);
					toast.success("Texto copiado. É só colar no WhatsApp.");
				} catch {
					toast.error("Não deu para copiar neste navegador.");
				}
			},
		}),
	);
}
