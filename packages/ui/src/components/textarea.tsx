import { cn } from "@marinho-gestao/ui/lib/utils";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"border-input bg-field text-foreground placeholder:text-muted-foreground focus-visible:border-primary disabled:bg-muted aria-invalid:border-destructive flex field-sizing-content min-h-24 w-full resize-y rounded-lg border-[1.5px] px-3.5 py-3 text-base/[22px] transition-colors disabled:cursor-not-allowed disabled:opacity-70",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
