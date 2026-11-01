import { cn } from "@marinho-gestao/ui/lib/utils";
import type { ReactNode } from "react";

export function FilterChip({
	selected,
	onClick,
	children,
}: {
	selected: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			onClick={onClick}
			className={cn(
				"inline-flex min-h-11 flex-none items-center gap-2 rounded-full border-[1.5px] px-3.5 text-sm font-bold transition-colors",
				selected
					? "border-primary bg-primary text-primary-foreground"
					: "border-line-strong bg-card text-foreground hover:bg-muted",
			)}
		>
			{children}
		</button>
	);
}
