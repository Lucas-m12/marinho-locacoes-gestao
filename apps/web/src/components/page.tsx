import { Button } from "@marinho-gestao/ui/components/button";
import { Card } from "@marinho-gestao/ui/components/card";
import { Skeleton } from "@marinho-gestao/ui/components/skeleton";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { Link, type LinkProps } from "@tanstack/react-router";
import { ChevronLeft, CloudOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { describeError } from "@/lib/errors";

export function PageHeader({
	title,
	titleAddon,
	eyebrow,
	description,
	back,
	actions,
	leading,
}: {
	title: string;
	titleAddon?: ReactNode;
	eyebrow?: string;
	description?: ReactNode;
	back?: { to: LinkProps["to"]; params?: LinkProps["params"]; label: string };
	actions?: ReactNode;
	leading?: ReactNode;
}) {
	return (
		<header className="flex flex-wrap items-end justify-between gap-4">
			<div className="flex min-w-0 flex-col gap-1">
				{back && (
					<Link
						to={back.to}
						params={back.params}
						className="flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold"
					>
						<ChevronLeft aria-hidden className="size-4" strokeWidth={2.2} />
						{back.label}
					</Link>
				)}
				{eyebrow && (
					<span className="type-condensed text-muted-foreground text-[13px] font-bold tracking-[0.12em] uppercase">
						{eyebrow}
					</span>
				)}
				<div className="flex flex-wrap items-center gap-3">
					{leading}
					<div className="flex min-w-0 flex-col gap-0.5">
						<div className="flex flex-wrap items-center gap-3">
							<h1 className="type-title text-[28px]/[1.1] md:text-4xl/[1.1]">
								{title}
							</h1>
							{titleAddon}
						</div>
						{leading && description && (
							<p className="text-muted-foreground text-base">{description}</p>
						)}
					</div>
				</div>
				{!leading && description && (
					<p className="text-muted-foreground text-base/6">{description}</p>
				)}
			</div>
			{actions && <div className="flex flex-wrap gap-3">{actions}</div>}
		</header>
	);
}

export function ErrorState({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) {
	return (
		<Card className="items-center gap-3 px-5 py-10 text-center">
			<CloudOff aria-hidden className="text-muted-foreground size-8" />
			<p className="type-title text-lg/6">Não deu para carregar</p>
			<p className="text-muted-foreground max-w-sm">{describeError(error)}</p>
			<Button variant="outline" onClick={onRetry}>
				Tentar de novo
			</Button>
		</Card>
	);
}

export function EmptyState({
	icon: Icon,
	title,
	description,
	children,
	className,
}: {
	icon?: LucideIcon;
	title: string;
	description: string;
	children?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center gap-2 px-4 py-8 text-center",
				className,
			)}
		>
			{Icon && <Icon aria-hidden className="text-muted-foreground size-7" />}
			<p className="type-title text-lg/6">{title}</p>
			<p className="text-muted-foreground max-w-sm text-[15px]">
				{description}
			</p>
			{children}
		</div>
	);
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
	return (
		<Card className="gap-0 px-5 py-3">
			{Array.from({ length: rows }, (_, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: linhas de esqueleto não têm identidade
					key={index}
					className="flex items-center gap-4 border-t py-3.5 first:border-t-0"
				>
					<Skeleton className="h-5 w-20" />
					<Skeleton className="h-5 grow" />
					<Skeleton className="hidden h-5 w-24 md:block" />
				</div>
			))}
		</Card>
	);
}

export function ScreenSkeleton() {
	return (
		<div role="status" aria-label="Carregando" className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<Skeleton className="h-9 w-56" />
				<Skeleton className="h-5 w-72 max-w-full" />
			</div>
			<div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
				<Skeleton className="h-24 rounded-2xl" />
				<Skeleton className="h-24 rounded-2xl" />
				<Skeleton className="h-24 rounded-2xl" />
				<Skeleton className="h-24 rounded-2xl" />
			</div>
			<ListSkeleton />
		</div>
	);
}
