import { cn } from "@marinho-gestao/ui/lib/utils";

export function F2Badge({
	onNavy = false,
	className,
}: {
	onNavy?: boolean;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"type-condensed rounded-sm border px-1.5 py-px text-[11px]/[14px] font-bold",
				onNavy
					? "border-highlight text-highlight"
					: "border-alert-foreground text-alert-foreground",
				className,
			)}
		>
			F2
		</span>
	);
}
