import { cn } from "@marinho-gestao/ui/lib/utils";

export function ToDefine({
	children = "a definir",
	className,
}: {
	children?: string;
	className?: string;
}) {
	return (
		<span
			className={cn("text-alert-foreground font-semibold italic", className)}
		>
			{children}
		</span>
	);
}
