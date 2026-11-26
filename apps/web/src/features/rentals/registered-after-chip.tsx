import { StatusChip } from "@/components/status-chip";

/** Selo da locação registrada depois que aconteceu (sem vistoria nem caução). */
export function RegisteredAfterChip({ size }: { size?: "sm" | "md" | "lg" }) {
	return (
		<StatusChip tone="draft" size={size}>
			Registrada depois
		</StatusChip>
	);
}
