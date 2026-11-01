import { cn } from "@marinho-gestao/ui/lib/utils";

export function BrandSymbol({
	negative = false,
	className,
	alt = "",
}: {
	negative?: boolean;
	className?: string;
	alt?: string;
}) {
	return (
		<img
			src={
				negative
					? "/brand/marinho-simbolo-negativo.svg"
					: "/brand/marinho-simbolo.svg"
			}
			alt={alt}
			width={84}
			height={84}
			className={cn("block", className)}
		/>
	);
}

export function BrandLogo({
	negative = false,
	className,
}: {
	negative?: boolean;
	className?: string;
}) {
	return (
		<img
			src={
				negative
					? "/brand/marinho-logo-negativo.svg"
					: "/brand/marinho-logo.svg"
			}
			alt="Marinho Locações"
			width={505}
			height={105}
			className={cn("block h-auto", className)}
		/>
	);
}
