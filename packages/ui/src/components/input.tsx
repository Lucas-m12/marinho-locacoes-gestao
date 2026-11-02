import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@marinho-gestao/ui/lib/utils";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<InputPrimitive
			type={type}
			data-slot="input"
			className={cn(
				"border-input bg-field text-foreground placeholder:text-muted-foreground focus-visible:border-primary disabled:bg-muted aria-invalid:border-destructive h-12 w-full min-w-0 rounded-lg border-[1.5px] px-3.5 text-base transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-70",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
