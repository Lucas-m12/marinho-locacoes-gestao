import { cn } from "@marinho-gestao/ui/lib/utils";
import { type ReactNode, useId } from "react";

export function KpiCard({
	label,
	value,
	note,
	tone = "default",
}: {
	label: string;
	value: ReactNode;
	note?: string;
	tone?: "default" | "positive" | "navy";
}) {
	const navy = tone === "navy";
	const labelId = useId();
	return (
		<section
			aria-labelledby={labelId}
			className={cn(
				"flex flex-col gap-1.5 rounded-2xl p-4 md:p-5",
				navy ? "bg-primary text-on-navy" : "bg-card",
			)}
		>
			<span
				id={labelId}
				className={cn(
					"text-sm",
					navy ? "text-on-navy-muted" : "text-muted-foreground",
				)}
			>
				{label}
			</span>
			<b
				className={cn(
					"type-condensed text-2xl/[1.1] font-extrabold md:text-3xl/[1.1]",
					tone === "positive" && "text-positive",
				)}
			>
				{value}
			</b>
			{note && (
				<span
					className={cn(
						"text-[13px]",
						navy ? "text-on-navy-muted" : "text-muted-foreground",
					)}
				>
					{note}
				</span>
			)}
		</section>
	);
}
