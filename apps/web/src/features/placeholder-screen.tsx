import { Card } from "@marinho-gestao/ui/components/card";
import { Skeleton } from "@marinho-gestao/ui/components/skeleton";
import { PageHeader } from "@/components/page";

export function PlaceholderScreen({ title }: { title: string }) {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader title={title} />
			<Card className="gap-3 p-5">
				<Skeleton className="h-5 w-2/3" />
				<Skeleton className="h-5 w-1/2" />
				<Skeleton className="h-5 w-3/4" />
			</Card>
		</div>
	);
}
