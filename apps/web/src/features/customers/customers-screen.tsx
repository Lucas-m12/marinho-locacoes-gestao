import type { Customer, CustomerLastRental } from "@marinho-gestao/contract";
import type {
	CustomerSegment,
	RentalDisplayStatus,
} from "@marinho-gestao/domain";
import { Button } from "@marinho-gestao/ui/components/button";
import { Card } from "@marinho-gestao/ui/components/card";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, UserSearch } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { FilterChip } from "@/components/filter-chip";
import {
	EmptyState,
	ErrorState,
	ListSkeleton,
	PageHeader,
} from "@/components/page";
import { SearchField } from "@/components/search-field";
import { StatusChip } from "@/components/status-chip";
import { orpc } from "@/data/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDate, initials } from "@/lib/format";
import { CUSTOMER_KIND_LABELS } from "@/lib/labels";
import { CustomerSheet } from "./customer-sheet";

const SEGMENTS = {
	profissionais: "PROFESSIONALS",
	reforma: "HOME_RENOVATION",
	atencao: "ATTENTION",
} as const satisfies Record<string, CustomerSegment>;

export const CustomersSearch = z.object({
	segmento: z.enum(["profissionais", "reforma", "atencao"]).optional(),
	q: z.string().optional(),
});
export type CustomersSearch = z.infer<typeof CustomersSearch>;

const LAST_RENTAL_LABELS: Partial<Record<RentalDisplayStatus, string>> = {
	AWAITING_DEPOSIT: "aguardando sinal",
	CONFIRMED: "em andamento",
	SEPARATED: "em andamento",
	ON_SITE: "na obra",
	OVERDUE: "atrasada",
	RETURNED: "devolvida",
	CLOSED: "encerrada",
	CANCELED: "cancelada",
	EXPIRED: "expirada",
};

function lastRentalText(rental: CustomerLastRental | null): string {
	if (!rental) return "Nenhuma ainda";
	const status = LAST_RENTAL_LABELS[rental.displayStatus] ?? "";
	return `${formatDate(rental.startAt)} · ${status}`;
}

function kindLabel(customer: Customer): string {
	return customer.occupation ?? CUSTOMER_KIND_LABELS[customer.kind];
}

const TABLE_COLUMNS =
	"grid-cols-[minmax(0,2fr)_minmax(0,1fr)_80px_minmax(0,1.2fr)_120px] xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_90px_minmax(0,1.4fr)_130px]";

function CustomerTable({ customers }: { customers: Customer[] }) {
	return (
		<Card className="hidden gap-0 px-5 py-2 md:flex">
			<div
				className={cn(
					"text-muted-foreground grid gap-4 py-3 text-[13px] font-bold tracking-[0.04em] uppercase",
					TABLE_COLUMNS,
				)}
			>
				<span>Cliente</span>
				<span>Cidade</span>
				<span className="text-right">Locações</span>
				<span>Última</span>
				<span>Situação</span>
			</div>
			{customers.map((customer) => (
				<Link
					key={customer.id}
					to="/clientes/$id"
					params={{ id: customer.id }}
					className={cn(
						"hover:bg-background/50 grid min-h-[76px] items-center gap-4 border-t py-2 text-[15px]",
						TABLE_COLUMNS,
					)}
				>
					<span className="flex min-w-0 items-center gap-3">
						<span
							aria-hidden
							className="bg-background flex size-10 flex-none items-center justify-center rounded-full text-sm font-extrabold"
						>
							{initials(customer.name)}
						</span>
						<span className="flex min-w-0 flex-col">
							<b>{customer.name}</b>
							<span className="text-muted-foreground text-[13px]">
								{kindLabel(customer)}
							</span>
						</span>
					</span>
					<span>{customer.city}</span>
					<b className="text-right">{customer.stats.rentalCount}</b>
					<span className="text-muted-foreground text-sm">
						{lastRentalText(customer.lastRental)}
					</span>
					<span>
						<StatusChip kind="customer" status={customer.tier} />
					</span>
				</Link>
			))}
		</Card>
	);
}

function CustomerCards({ customers }: { customers: Customer[] }) {
	return (
		<ul
			aria-label="Lista de clientes"
			className="flex flex-col gap-2 md:hidden"
		>
			{customers.map((customer) => (
				<li key={customer.id}>
					<Link
						to="/clientes/$id"
						params={{ id: customer.id }}
						className="bg-card flex items-center gap-3 rounded-xl px-3.5 py-3"
					>
						<span
							aria-hidden
							className="bg-background flex size-11 flex-none items-center justify-center rounded-full text-sm font-extrabold"
						>
							{initials(customer.name)}
						</span>
						<span className="flex min-w-0 grow flex-col gap-0.5">
							<b className="text-[15px]">{customer.name}</b>
							<span className="text-muted-foreground text-[13px]">
								{[
									kindLabel(customer),
									customer.city,
									`${customer.stats.rentalCount} locações`,
								]
									.filter(Boolean)
									.join(" · ")}
							</span>
						</span>
						<StatusChip kind="customer" status={customer.tier} size="sm" />
					</Link>
				</li>
			))}
		</ul>
	);
}

export function CustomersScreen({
	search,
	onSearchChange,
}: {
	search: CustomersSearch;
	onSearchChange: (next: CustomersSearch) => void;
}) {
	const [sheetOpen, setSheetOpen] = useState(false);
	const [text, setText] = useState(search.q ?? "");
	const debouncedText = useDebouncedValue(text);

	useEffect(() => {
		if ((search.q ?? "") !== debouncedText) {
			onSearchChange({ ...search, q: debouncedText || undefined });
		}
	}, [debouncedText, onSearchChange, search]);

	const list = useQuery(
		orpc.customers.list.queryOptions({
			input: {
				q: search.q,
				segment: search.segmento ? SEGMENTS[search.segmento] : undefined,
			},
			placeholderData: (previous) => previous,
		}),
	);
	const counts = list.data?.counts;
	const filters = [
		{ value: undefined, label: "Todos", count: counts?.ALL },
		{
			value: "profissionais" as const,
			label: "Profissionais",
			count: counts?.PROFESSIONALS,
		},
		{
			value: "reforma" as const,
			label: "Reforma da casa",
			count: counts?.HOME_RENOVATION,
		},
		{
			value: "atencao" as const,
			label: "Atenção",
			count: counts?.ATTENTION,
		},
	];

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Clientes"
				description="Quem aluga, com documentos e histórico."
				actions={
					<Button onClick={() => setSheetOpen(true)}>
						<Plus aria-hidden strokeWidth={2.4} />
						Cadastrar cliente
					</Button>
				}
			/>

			<div className="flex flex-wrap items-center gap-3">
				<fieldset className="m-0 flex max-w-full min-w-0 gap-2 overflow-x-auto border-0 p-0">
					<legend className="sr-only">Filtrar clientes</legend>
					{filters.map((filter) => (
						<FilterChip
							key={filter.label}
							selected={search.segmento === filter.value}
							onClick={() =>
								onSearchChange({ ...search, segmento: filter.value })
							}
						>
							{filter.label}
							{filter.count !== undefined && ` · ${filter.count}`}
						</FilterChip>
					))}
				</fieldset>
				<SearchField
					label="Buscar cliente"
					placeholder="Nome, telefone ou cidade"
					value={text}
					onChange={setText}
					className="flex-[1_1_220px]"
				/>
			</div>

			{list.isPending && <ListSkeleton rows={8} />}
			{list.isError && (
				<ErrorState error={list.error} onRetry={() => list.refetch()} />
			)}
			{list.data?.customers.length === 0 && (
				<Card>
					<EmptyState
						icon={UserSearch}
						title="Ninguém encontrado"
						description="Tente outro nome, telefone ou cidade, ou cadastre um cliente novo."
					/>
				</Card>
			)}
			{list.data && list.data.customers.length > 0 && (
				<>
					<CustomerTable customers={list.data.customers} />
					<CustomerCards customers={list.data.customers} />
				</>
			)}

			<p className="text-muted-foreground text-sm/5">
				A situação é calculada pelas locações: cliente novo paga tudo antes e
				deixa caução cheia; “Atenção” só aluga com pagamento antecipado.
			</p>

			<CustomerSheet open={sheetOpen} onOpenChange={setSheetOpen} />
		</div>
	);
}
