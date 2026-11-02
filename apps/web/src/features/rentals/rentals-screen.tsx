import type {
	LostDemandGroup,
	LostDemandRecord,
	RentalListItem,
	RentalTab,
} from "@marinho-gestao/contract";
import { Button, buttonVariants } from "@marinho-gestao/ui/components/button";
import { Card } from "@marinho-gestao/ui/components/card";
import { Skeleton } from "@marinho-gestao/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@marinho-gestao/ui/components/tabs";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardList, PackageX, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
	EmptyState,
	ErrorState,
	ListSkeleton,
	PageHeader,
} from "@/components/page";
import { SearchField } from "@/components/search-field";
import { StatusChip } from "@/components/status-chip";
import { orpc } from "@/data/client";
import { useCan } from "@/features/auth/use-current-user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDate, formatMonthName, formatPeriod, money } from "@/lib/format";
import { LostDemandDialog } from "./lost-demand-dialog";

export const RentalsSearch = z.object({
	aba: z.enum(["abertas", "encerradas", "perdidas"]).optional(),
	q: z.string().optional(),
});
export type RentalsSearch = z.infer<typeof RentalsSearch>;

type Tab = NonNullable<RentalsSearch["aba"]>;

const TAB_QUERY: Record<Exclude<Tab, "perdidas">, RentalTab> = {
	abertas: "OPEN",
	encerradas: "CLOSED",
};

const TABLE_COLUMNS =
	"grid-cols-[84px_minmax(0,1fr)_minmax(0,1.3fr)_80px_150px] xl:grid-cols-[100px_minmax(0,1.2fr)_minmax(0,1.6fr)_120px_170px]";

function RentalTable({ rentals }: { rentals: RentalListItem[] }) {
	return (
		<Card className="hidden gap-0 overflow-x-auto px-5 py-2 md:flex">
			<div
				className={cn(
					"text-muted-foreground grid items-center gap-4 py-3 text-[13px] font-bold tracking-[0.04em] uppercase",
					TABLE_COLUMNS,
				)}
			>
				<span>Nº</span>
				<span>Cliente</span>
				<span>Equipamentos e período</span>
				<span className="text-right">Valor</span>
				<span>Status</span>
			</div>
			{rentals.map((rental) => (
				<Link
					key={rental.number}
					to="/locacoes/$numero"
					params={{ numero: rental.number }}
					className={cn(
						"hover:bg-background/50 grid min-h-16 items-center gap-4 border-t py-2 text-[15px]",
						TABLE_COLUMNS,
					)}
				>
					<b>{rental.number}</b>
					<span className="flex min-w-0 flex-col">
						<span className="font-semibold">{rental.customerName}</span>
						<span className="text-muted-foreground text-[13px]">
							{rental.customerCity}
						</span>
					</span>
					<span className="flex min-w-0 flex-col">
						<span>{rental.equipmentSummary}</span>
						<span className="text-muted-foreground text-[13px]">
							{formatPeriod(rental.startAt, rental.endAt)}
						</span>
					</span>
					<b className="text-right">{money(rental.totalCents)}</b>
					<span>
						<StatusChip kind="rental" status={rental.displayStatus} />
					</span>
				</Link>
			))}
		</Card>
	);
}

function RentalCards({ rentals }: { rentals: RentalListItem[] }) {
	return (
		<ul aria-label="Locações" className="flex flex-col gap-2.5 md:hidden">
			{rentals.map((rental) => (
				<li key={rental.number}>
					<Link
						to="/locacoes/$numero"
						params={{ numero: rental.number }}
						className="bg-card flex flex-col gap-1.5 rounded-xl px-4 py-3.5"
					>
						<span className="flex items-center justify-between gap-2.5">
							<b className="text-sm">{rental.number}</b>
							<StatusChip
								kind="rental"
								status={rental.displayStatus}
								size="sm"
							/>
						</span>
						<b className="text-base/[22px]">{rental.equipmentSummary}</b>
						<span className="text-muted-foreground text-sm">
							{rental.customerName} · {rental.customerCity}
						</span>
						<span className="flex justify-between gap-2.5 text-sm">
							<span className="text-muted-foreground">
								{formatPeriod(rental.startAt, rental.endAt)}
							</span>
							<b>{money(rental.totalCents)}</b>
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}

function requestsLabel(group: LostDemandGroup): string {
	const count = group.count === 1 ? "1 pedido" : `${group.count} pedidos`;
	const cities = group.cities.join(" e ");
	return cities ? `${count} · ${cities}` : count;
}

function LostDemandCard({ groups }: { groups: LostDemandGroup[] | undefined }) {
	const canRecord = useCan("lostDemand:write");
	const [dialogOpen, setDialogOpen] = useState(false);

	return (
		<Card aria-labelledby="perdida" className="px-(--card-spacing)">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
				<h2 id="perdida" className="type-title text-xl/6">
					Demanda perdida em {formatMonthName(new Date())}
				</h2>
				<span className="text-muted-foreground text-sm">
					pedidos que não deu para atender
				</span>
			</div>
			{groups === undefined && <Skeleton className="h-20 rounded-lg" />}
			{groups?.length === 0 && (
				<p className="text-muted-foreground text-[15px]">
					Nenhum pedido perdido. Quando não der para atender alguém, registre
					aqui.
				</p>
			)}
			{groups && groups.length > 0 && (
				<div className="grid gap-3 xl:grid-cols-3">
					{groups.map((group) => (
						<div
							key={`${group.item}-${group.reason}`}
							className="flex flex-col gap-1 rounded-lg border-[1.5px] px-4 py-3.5"
						>
							<b className="text-[15px]">{group.item}</b>
							<span className="text-muted-foreground text-sm">
								{group.reason}
							</span>
							<span className="text-muted-foreground text-[13px]">
								{requestsLabel(group)}
							</span>
						</div>
					))}
				</div>
			)}
			{canRecord && (
				<>
					<Button
						variant="secondary"
						className="self-start"
						onClick={() => setDialogOpen(true)}
					>
						Registrar pedido não atendido
					</Button>
					<LostDemandDialog open={dialogOpen} onOpenChange={setDialogOpen} />
				</>
			)}
		</Card>
	);
}

function LostDemandList({ records }: { records: LostDemandRecord[] }) {
	return (
		<Card className="gap-0 px-(--card-spacing)">
			<h2 className="type-title mb-2 text-xl/6">Todos os pedidos</h2>
			{records.map((record) => (
				<div
					key={record.id}
					className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t py-3"
				>
					<span className="flex flex-col">
						<b className="text-[15px]">{record.item}</b>
						<span className="text-muted-foreground text-sm">
							{record.reason}
						</span>
					</span>
					<span className="text-muted-foreground text-sm">
						{[record.city, formatDate(`${record.requestedOn}T12:00:00-03:00`)]
							.filter(Boolean)
							.join(" · ")}
					</span>
				</div>
			))}
		</Card>
	);
}

function RentalsPanel({
	tab,
	q,
}: {
	tab: "abertas" | "encerradas";
	q?: string;
}) {
	const rentals = useQuery(
		orpc.rentals.list.queryOptions({
			input: { tab: TAB_QUERY[tab], q },
			placeholderData: (previous) => previous,
		}),
	);

	if (rentals.isPending) return <ListSkeleton rows={8} />;
	if (rentals.isError) {
		return (
			<ErrorState error={rentals.error} onRetry={() => rentals.refetch()} />
		);
	}
	if (rentals.data.rentals.length === 0) {
		return (
			<Card>
				<EmptyState
					icon={ClipboardList}
					title={q ? "Nada encontrado" : "Nenhuma locação aqui"}
					description={
						q
							? "Tente pelo nome do cliente, pelo equipamento ou pelo número."
							: tab === "abertas"
								? "Comece por Nova locação quando um cliente pedir um equipamento."
								: "As locações encerradas, canceladas e expiradas aparecem aqui."
					}
				/>
			</Card>
		);
	}
	return (
		<>
			<RentalTable rentals={rentals.data.rentals} />
			<RentalCards rentals={rentals.data.rentals} />
		</>
	);
}

export function RentalsScreen({
	search,
	onSearchChange,
}: {
	search: RentalsSearch;
	onSearchChange: (next: RentalsSearch) => void;
}) {
	const canSell = useCan("rentals:sell");
	const tab: Tab = search.aba ?? "abertas";
	const [text, setText] = useState(search.q ?? "");
	const debouncedText = useDebouncedValue(text);

	useEffect(() => {
		if ((search.q ?? "") !== debouncedText) {
			onSearchChange({ ...search, q: debouncedText || undefined });
		}
	}, [debouncedText, onSearchChange, search]);

	const counts = useQuery(
		orpc.rentals.list.queryOptions({
			input: { tab: "OPEN", q: search.q },
			select: (data) => data.counts,
			placeholderData: (previous) => previous,
		}),
	);
	const lost = useQuery(
		orpc.rentals.listLostDemand.queryOptions({ input: undefined }),
	);

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Locações"
				description="Orçamentos, reservas e equipamentos na obra."
				actions={
					canSell ? (
						<Link
							to="/locacoes/nova"
							className={cn(buttonVariants(), "hidden md:inline-flex")}
						>
							<Plus aria-hidden strokeWidth={2.4} />
							Nova locação
						</Link>
					) : undefined
				}
			/>

			<Tabs
				value={tab}
				onValueChange={(value) =>
					onSearchChange({ ...search, aba: value as Tab })
				}
			>
				<div className="flex flex-wrap items-center gap-3">
					<TabsList aria-label="Filtrar locações">
						<TabsTrigger value="abertas">
							Abertas{counts.data ? ` · ${counts.data.OPEN}` : ""}
						</TabsTrigger>
						<TabsTrigger value="encerradas">Encerradas</TabsTrigger>
						<TabsTrigger value="perdidas">
							Demanda perdida{counts.data ? ` · ${counts.data.LOST}` : ""}
						</TabsTrigger>
					</TabsList>
					{tab !== "perdidas" && (
						<SearchField
							label="Buscar locação"
							placeholder="Cliente, equipamento ou número"
							value={text}
							onChange={setText}
							className="flex-[1_1_220px]"
						/>
					)}
				</div>

				<TabsContent value={tab} className="flex flex-col gap-5">
					{tab === "perdidas" ? (
						lost.data?.records.length === 0 ? (
							<Card>
								<EmptyState
									icon={PackageX}
									title="Nenhum pedido perdido"
									description="Registre aqui o que o cliente pediu e não deu para atender."
								/>
							</Card>
						) : (
							<LostDemandList records={lost.data?.records ?? []} />
						)
					) : (
						<RentalsPanel tab={tab} q={search.q} />
					)}
					{tab !== "encerradas" && (
						<LostDemandCard groups={lost.data?.groups} />
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}
