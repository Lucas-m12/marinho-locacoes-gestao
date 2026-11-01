import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
	"group/button aria-invalid:border-destructive inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border-[1.5px] font-bold whitespace-nowrap transition-colors select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
				outline:
					"border-primary bg-card text-primary hover:bg-muted aria-expanded:bg-muted",
				secondary: "border-primary text-primary hover:bg-card bg-transparent",
				ghost:
					"text-foreground hover:bg-muted aria-expanded:bg-muted border-transparent",
				dashed:
					"border-primary text-primary hover:bg-muted border-dashed bg-transparent",
				destructive:
					"border-destructive text-destructive hover:bg-alert bg-transparent",
				highlight:
					"bg-highlight text-highlight-foreground hover:bg-highlight/90 border-transparent",
				"on-navy":
					"border-on-navy-muted text-on-navy hover:bg-navy-soft bg-transparent",
				link: "text-primary border-transparent underline underline-offset-4",
			},
			size: {
				default: "min-h-11 px-[18px] text-[15px]",
				xs: "min-h-11 px-3 text-sm",
				sm: "min-h-11 px-4 text-[15px]",
				lg: "min-h-[52px] px-5 text-base font-extrabold",
				icon: "size-11",
				"icon-xs": "size-11",
				"icon-sm": "size-11",
				"icon-lg": "size-[52px]",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
