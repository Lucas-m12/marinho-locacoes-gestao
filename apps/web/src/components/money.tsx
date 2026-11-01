import { ToDefine } from "@/components/to-define";
import { money } from "@/lib/format";

export function Money({
	cents,
	className,
}: {
	cents: number | null | undefined;
	className?: string;
}) {
	if (cents === null || cents === undefined) {
		return <ToDefine className={className} />;
	}
	return <span className={className}>{money(cents)}</span>;
}
