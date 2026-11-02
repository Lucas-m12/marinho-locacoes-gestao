import { cn } from "@marinho-gestao/ui/lib/utils";
import { Search } from "lucide-react";

export function SearchField({
	label,
	placeholder,
	value,
	onChange,
	className,
}: {
	label: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	className?: string;
}) {
	return (
		<label
			className={cn(
				"border-input bg-field text-muted-foreground focus-within:border-primary flex min-h-11 items-center gap-2 rounded-lg border-[1.5px] px-3.5",
				className,
			)}
		>
			<Search aria-hidden className="size-[18px] flex-none" />
			<span className="sr-only">{label}</span>
			<input
				type="search"
				placeholder={placeholder}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="text-foreground placeholder:text-muted-foreground min-w-0 grow bg-transparent text-base outline-none md:text-[15px]"
			/>
		</label>
	);
}
