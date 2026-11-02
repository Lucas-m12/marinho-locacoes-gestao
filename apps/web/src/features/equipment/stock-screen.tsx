import {
	type Lot,
	type UnitListItem,
	UnitStatus as UnitStatusSchema,
} from "@marinho-gestao/contract";
import { UNIT_STATUSES, type UnitStatus } from "@marinho-gestao/domain";
import { Button } from "@marinho-gestao/ui/components/button";
import { Card } from "@marinho-gestao/ui/components/card";
import { Skeleton } from "@marinho-gestao/ui/components/skeleton";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PackageSearch, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { FilterChip } from "@/components/filter-chip";
import { Money } from "@/components/money";
import {
	EmptyState,
	ErrorState,
	ListSkeleton,
	PageHeader,
} from "@/components/page";
import { SearchField } from "@/components/search-field";
import { StatusChip } from "@/components/status-chip";
import { ToDefine } from "@/components/to-define";
import { orpc } from "@/data/client";
import { useCan } from "@/features/auth/use-current-user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDate, money } from "@/lib/format";
import { RENTAL_STATUS_LABELS, UNIT_STATUS_LABELS } from "@/lib/labels";
import { NewEquipmentSheet } from "./new-equipment-sheet";
import { isLocationAlert, locationText } from "./unit-location";

export const StockSearch = z.object({
	status: UnitStatusSchema.optional(),
	q: z.string().optional(),
});
export type StockSearch = z.infer<typeof StockSearch>;

const TABLE_COLUMNS =
	"grid-cols-[76px_minmax(0,1.6fr)_72px_140px_minmax(0,1fr)] xl:grid-cols-[88px_minmax(0,2fr)_80px_150px_minmax(0,1.5fr)]";

function DailyPrice({ cents }: { cents: number | null }) {
	return cents === null ? <ToDefine /> : <>{money(cents)}</>;
}

function UnitTable({ units, now }: { units: UnitListItem[]; now: Date }) {
	return (
		<Card className="hidden gap-0 px-5 py-2 md:flex">
			<div
				className={cn(
					"text-muted-foreground grid gap-4 py-3 text-[13px] font-bold tracking-[0.04em] uppercase",
					TABLE_COLUMNS,
				)}
			>
				<span>Código</span>
				<span>Equipamento</span>
				<span className="text-right">Diária</span>
				<span>Status</span>
				<span>Onde está</span>
			</div>
			{units.map((unit) => (
				<Link
					key={unit.code}
					to="/estoque/$codigo"
					params={{ codigo: unit.code }}
					className={cn(
						"hover:bg-background/50 grid min-h-[52px] items-center gap-4 border-t py-1.5 text-[15px]",
						TABLE_COLUMNS,
					)}
				>
					<b>{unit.code}</b>
					<span className="min-w-0">{unit.name}</span>
					<span className="text-right font-semibold">
						<DailyPrice cents={unit.dailyPriceCents} />
					</span>
					<span>
						<StatusChip kind="unit" status={unit.status} />
					</span>
					<span
						className={cn(
							"text-sm",
							isLocationAlert(unit.location)
								? "text-alert-foreground"
								: "text-muted-foreground",
						)}
					>
						{locationText(unit.location, now)}
					</span>
				</Link>
			))}
		</Card>
	);
}

function UnitCards({ units, now }: { units: UnitListItem[]; now: Date }) {
	return (
		<ul aria-label="Equipamentos" className="flex flex-col gap-2 md:hidden">
			{units.map((unit) => (
				<li key={unit.code}>
					<Link
						to="/estoque/$codigo"
						params={{ codigo: unit.code }}
						className="bg-card flex flex-col gap-1 rounded-xl px-3.5 py-3"
					>
						<span className="flex items-center justify-between gap-2">
							<b className="text-sm">{unit.code}</b>
							<StatusChip kind="unit" status={unit.status} size="sm" />
						</span>
						<span className="text-[15px]/[21px] font-semibold">
							{unit.name}
						</span>
						<span className="flex justify-between gap-2 text-[13px]">
							<span
								className={
									isLocationAlert(unit.location)
										? "text-alert-foreground"
										: "text-muted-foreground"
								}
							>
								{locationText(unit.location, now)}
							</span>
							<b>
								<DailyPrice cents={unit.dailyPriceCents} />
							</b>
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}

function ScaffoldCard({ lot }: { lot: Lot }) {
	const usable = lot.total - lot.inMaintenance - lot.retired;
	const freePercent = usable === 0 ? 0 : (lot.freeToday / usable) * 100;
	return (
		<Card className="gap-2.5 px-(--card-spacing)">
			<div className="flex items-baseline justify-between gap-3">
				<b className="text-[17px]">{lot.name}</b>
				<span className="text-muted-foreground text-sm">
					<Money cents={lot.dailyPriceCents} /> por peça por dia
				</span>
			</div>
			<div
				aria-hidden
				className="bg-muted flex h-3.5 overflow-hidden rounded-[7px]"
			>
				<span
					className="bg-bar-available"
					style={{ width: `${freePercent}%` }}
				/>
				<span
					className="bg-bar-separated"
					style={{ width: `${100 - freePercent}%` }}
				/>
			</div>
			<span className="text-muted-foreground text-sm">
				<b className="text-foreground">{lot.freeToday} livres</b> ·{" "}
				{lot.reservedToday} reservadas · {lot.total} peças no total
			</span>
			<span className="text-muted-foreground text-[13px]">
				Kit e acessórios: {lot.kitComposition ?? <ToDefine />}
			</span>
		</Card>
	);
}

function TrailerCard({ lot }: { lot: Lot }) {
	const free = lot.freeToday > 0;
	return (
		<Card className="gap-2.5 px-(--card-spacing)">
			<div className="flex items-baseline justify-between gap-3">
				<b className="text-[17px]">{lot.name}</b>
				<span className="text-muted-foreground text-sm">
					<Money cents={lot.dailyPriceCents} /> por dia
				</span>
			</div>
			<StatusChip tone={free ? "available" : "reserved"} className="self-start">
				{free ? "Disponível hoje" : "Reservada hoje"}
			</StatusChip>
			<span className="text-muted-foreground text-sm">
				{lot.nextBooking
					? `Reservada para ${formatDate(lot.nextBooking.startAt)}, ${RENTAL_STATUS_LABELS[lot.nextBooking.displayStatus].toLowerCase()}`
					: "Sem reservas à frente"}{" "}
				· código {lot.assetCode ?? <ToDefine />}
			</span>
		</Card>
	);
}

function LotsSection() {
	const lots = useQuery(orpc.equipment.listLots.queryOptions());

	return (
		<section aria-labelledby="qtd" className="flex flex-col gap-3">
			<h2 id="qtd" className="type-title text-xl/6">
				Itens contados por quantidade
			</h2>
			{lots.isPending && (
				<div className="grid gap-4 md:grid-cols-2">
					<Skeleton className="h-36 rounded-2xl" />
					<Skeleton className="h-36 rounded-2xl" />
				</div>
			)}
			{lots.isError && (
				<ErrorState error={lots.error} onRetry={() => lots.refetch()} />
			)}
			{lots.data && (
				<div className="grid gap-4 md:grid-cols-2">
					{lots.data.map((lot) =>
						lot.pricing === "PER_PIECE" ? (
							<ScaffoldCard key={lot.id} lot={lot} />
						) : (
							<TrailerCard key={lot.id} lot={lot} />
						),
					)}
				</div>
			)}
		</section>
	);
}

export function StockScreen({
	search,
	onSearchChange,
}: {
	search: StockSearch;
	onSearchChange: (next: StockSearch) => void;
}) {
	const canManage = useCan("catalog:manage");
	const [sheetOpen, setSheetOpen] = useState(false);
	const [text, setText] = useState(search.q ?? "");
	const debouncedText = useDebouncedValue(text);

	useEffect(() => {
		if ((search.q ?? "") !== debouncedText) {
			onSearchChange({ ...search, q: debouncedText || undefined });
		}
	}, [debouncedText, onSearchChange, search]);

	const units = useQuery(
		orpc.equipment.listUnits.queryOptions({
			input: { status: search.status, q: search.q },
			placeholderData: (previous) => previous,
		}),
	);
	const now = new Date();
	const counts = units.data?.counts ?? {};

	const filters: {
		value: UnitStatus | undefined;
		label: string;
		count: number;
	}[] = [
		{ value: undefined, label: "Todos", count: units.data?.total ?? 0 },
		...UNIT_STATUSES.filter((status) => (counts[status] ?? 0) > 0).map(
			(status) => ({
				value: status,
				label: UNIT_STATUS_LABELS[status],
				count: counts[status] ?? 0,
			}),
		),
	];

	return (
		<div className="flex flex-col gap-5">
			<PageHeader
				title="Estoque"
				description={
					units.data
						? `${units.data.total} equipamentos com código, mais andaime e carrocinha.`
						: "Equipamentos com código, mais andaime e carrocinha."
				}
				actions={
					canManage ? (
						<Button onClick={() => setSheetOpen(true)}>
							<Plus aria-hidden strokeWidth={2.4} />
							Cadastrar equipamento
						</Button>
					) : undefined
				}
			/>

			<fieldset className="m-0 flex min-w-0 gap-2 overflow-x-auto border-0 p-0 pb-0.5">
				<legend className="sr-only">Filtrar por status</legend>
				{filters.map((filter) => (
					<FilterChip
						key={filter.label}
						selected={search.status === filter.value}
						onClick={() => onSearchChange({ ...search, status: filter.value })}
					>
						{filter.label}
						<span className="font-extrabold">{filter.count}</span>
					</FilterChip>
				))}
			</fieldset>

			<SearchField
				label="Buscar equipamento"
				placeholder="Código, nome ou apelido (ex.: maquita)"
				value={text}
				onChange={setText}
			/>

			{units.isPending && <ListSkeleton rows={8} />}
			{units.isError && (
				<ErrorState error={units.error} onRetry={() => units.refetch()} />
			)}
			{units.data && units.data.units.length === 0 && (
				<Card>
					<EmptyState
						icon={PackageSearch}
						title="Nada encontrado"
						description="Tente outro código, nome ou apelido, ou limpe o filtro de status."
					/>
				</Card>
			)}
			{units.data && units.data.units.length > 0 && (
				<>
					<UnitTable units={units.data.units} now={now} />
					<UnitCards units={units.data.units} now={now} />
				</>
			)}

			<LotsSection />

			{canManage && (
				<NewEquipmentSheet open={sheetOpen} onOpenChange={setSheetOpen} />
			)}
		</div>
	);
}
