import type {
	AvailabilityResult,
	CalendarCell,
	CalendarRow,
} from "@marinho-gestao/contract";
import {
	addCalendarDays,
	type CalendarState,
	calendarDay,
	zonedTimeToIso,
} from "@marinho-gestao/domain";
import { Button, buttonVariants } from "@marinho-gestao/ui/components/button";
import { Card } from "@marinho-gestao/ui/components/card";
import { Input } from "@marinho-gestao/ui/components/input";
import { Skeleton } from "@marinho-gestao/ui/components/skeleton";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { type FormEvent, useState } from "react";
import { z } from "zod";
import { DateTimeInput, FieldShell } from "@/components/form/fields";
import { EmptyState, ErrorState, PageHeader } from "@/components/page";
import { StatusChip } from "@/components/status-chip";
import { orpc } from "@/data/client";
import { useCan } from "@/features/auth/use-current-user";
import { LostDemandDialog } from "@/features/rentals/lost-demand-dialog";
import { type Breakpoint, useBreakpoint } from "@/hooks/use-breakpoint";
import {
	dailiesLabel,
	formatDate,
	formatDayOfMonth,
	formatPeriod,
	formatWeekdayShort,
	money,
} from "@/lib/format";
import { AVAILABILITY_BLOCK_LABELS, CALENDAR_STATE_LABELS } from "@/lib/labels";

export const AgendaSearch = z.object({
	q: z.string().optional(),
	saida: z.string().optional(),
	devolucao: z.string().optional(),
	inicio: z.string().optional(),
});
export type AgendaSearch = z.infer<typeof AgendaSearch>;

const DAYS_BY_BREAKPOINT: Record<Breakpoint, number> = {
	desktop: 14,
	tablet: 7,
	phone: 5,
};

const CELL_STYLES: Record<CalendarState, string> = {
	FREE: "bg-calendar-free text-foreground",
	RENTED: "bg-calendar-rented text-on-navy",
	RESERVED: "bg-calendar-reserved text-white",
	AWAITING_DEPOSIT: "bg-calendar-awaiting text-foreground",
	INSPECTION: "bg-calendar-inspection text-white",
	MAINTENANCE: "bg-calendar-maintenance text-white",
	OVERDUE: "bg-calendar-overdue text-white",
	BLOCKED: "bg-calendar-blocked text-white",
};

const LEGEND: CalendarState[] = [
	"FREE",
	"RENTED",
	"RESERVED",
	"AWAITING_DEPOSIT",
	"INSPECTION",
	"MAINTENANCE",
	"OVERDUE",
];

function nextSaturday(today: string): string {
	const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
	const distance = (6 - weekday + 7) % 7 || 7;
	return addCalendarDays(today, distance);
}

function defaultPeriod(today: string) {
	const saturday = nextSaturday(today);
	return {
		start: zonedTimeToIso(saturday, "08:00"),
		end: zonedTimeToIso(addCalendarDays(saturday, 3), "17:00"),
	};
}

function ResultRow({
	result,
	dailies,
	start,
	end,
	canSell,
}: {
	result: AvailabilityResult;
	dailies: number;
	start: string;
	end: string;
	canSell: boolean;
}) {
	const [demandOpen, setDemandOpen] = useState(false);
	const price = result.dailyPriceCents;
	const detail = (() => {
		if (result.available) {
			if (result.perPiece) {
				return `${result.freeQuantity} de ${result.totalQuantity} peças livres no período`;
			}
			return result.description ?? "Pronto para sair";
		}
		if (result.blockingRental) {
			return `Com ${result.blockingRental.customerName} (${result.blockingRental.number}) até ${formatDate(result.blockingRental.endAt)}`;
		}
		return result.block ? AVAILABILITY_BLOCK_LABELS[result.block] : "";
	})();

	const value = (() => {
		if (price === null) return "Diária a definir";
		if (result.perPiece) return `${money(price)} por peça por dia`;
		if (result.available) {
			return `${money(price)} × ${dailies} = ${money(result.periodTotalCents ?? 0)}`;
		}
		return `${money(price)} por dia`;
	})();

	return (
		<div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t py-4">
			<span className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
				<b className="text-base/[22px]">
					{result.kind === "UNIT"
						? `${result.code} · ${result.name}`
						: result.name}
				</b>
				<span className="text-muted-foreground text-sm">{detail}</span>
			</span>
			{result.available ? (
				<StatusChip tone="available" size="lg">
					Livre no período
				</StatusChip>
			) : (
				<StatusChip tone="alert" size="lg">
					{result.freeFrom
						? `Livre a partir de ${formatDate(result.freeFrom)}`
						: result.block
							? AVAILABILITY_BLOCK_LABELS[result.block]
							: "Indisponível"}
				</StatusChip>
			)}
			<span className="min-w-[140px] flex-none text-[15px] font-bold">
				{value}
			</span>
			{canSell &&
				(result.available ? (
					<Link
						to="/locacoes/nova"
						search={{ item: result.code, saida: start, devolucao: end }}
						className={buttonVariants({ size: "default" })}
					>
						Reservar
					</Link>
				) : (
					<>
						<Button variant="outline" onClick={() => setDemandOpen(true)}>
							Registrar demanda perdida
						</Button>
						<LostDemandDialog
							open={demandOpen}
							onOpenChange={setDemandOpen}
							preset={{
								item: result.name,
								typeId: result.typeId,
								reason: "Ocupado no período pedido",
							}}
						/>
					</>
				))}
		</div>
	);
}

function ResultsCard({
	query,
	start,
	end,
}: {
	query: string | undefined;
	start: string;
	end: string;
}) {
	const canSell = useCan("rentals:sell");
	const results = useQuery(
		orpc.availability.search.queryOptions({
			input: { query, start, end },
			enabled: Boolean(query) && Date.parse(start) < Date.parse(end),
		}),
	);

	return (
		<Card className="gap-1 px-(--card-spacing)" aria-labelledby="res">
			<div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1.5 pb-2">
				<h2 id="res" className="type-title text-xl/6">
					Resultado
				</h2>
				{results.data && (
					<span className="text-muted-foreground text-sm">
						{formatPeriod(start, end)} · {dailiesLabel(results.data.dailies)}
					</span>
				)}
			</div>
			{!query && (
				<p className="text-muted-foreground border-t py-4 text-[15px]">
					Digite o equipamento e o período para ver o que está livre. Pode ser o
					apelido: “maquita” acha a serra mármore.
				</p>
			)}
			{results.isFetching && !results.data && (
				<div className="flex flex-col gap-3 border-t py-4">
					<Skeleton className="h-6 w-3/4" />
					<Skeleton className="h-6 w-1/2" />
				</div>
			)}
			{results.isError && (
				<ErrorState error={results.error} onRetry={() => results.refetch()} />
			)}
			{results.data?.results.length === 0 && (
				<EmptyState
					icon={SearchX}
					title="Nada encontrado"
					description="Confira o nome ou tente pelo código. Se não temos o equipamento, registre como demanda perdida."
				/>
			)}
			{query &&
				results.data?.results.map((result) => (
					<ResultRow
						key={result.code}
						result={result}
						dailies={results.data.dailies}
						start={start}
						end={end}
						canSell={canSell}
					/>
				))}
		</Card>
	);
}

function cellLabel(row: CalendarRow, cell: CalendarCell): string {
	const base = `${row.label}, ${formatDate(`${cell.date}T12:00:00-03:00`)}`;
	if (row.perPiece) return `${base}: ${cell.freeQuantity} peças livres`;
	return `${base}: ${CALENDAR_STATE_LABELS[cell.state]}`;
}

function CalendarCellView({
	row,
	cell,
	canSell,
}: {
	row: CalendarRow;
	cell: CalendarCell;
	canSell: boolean;
}) {
	const className = cn(
		"flex h-11 items-center justify-center rounded-md text-xs font-bold",
		CELL_STYLES[cell.state],
	);
	const content = row.perPiece ? (
		<span className={cell.state === "FREE" ? "text-positive" : undefined}>
			{cell.freeQuantity}
		</span>
	) : cell.state === "OVERDUE" ? (
		"!"
	) : null;
	const label = cellLabel(row, cell);

	if (cell.state === "FREE" && canSell) {
		return (
			<Link
				to="/locacoes/nova"
				search={{
					item: row.code,
					saida: zonedTimeToIso(cell.date, "08:00"),
					devolucao: zonedTimeToIso(cell.date, "17:00"),
				}}
				aria-label={`${label}. Começar reserva`}
				className={cn(className, "hover:ring-primary hover:ring-2")}
			>
				{content}
			</Link>
		);
	}
	if (cell.rentalNumber) {
		return (
			<Link
				to="/locacoes/$numero"
				params={{ numero: cell.rentalNumber }}
				aria-label={`${label}. Abrir ${cell.rentalNumber}`}
				title={CALENDAR_STATE_LABELS[cell.state]}
				className={className}
			>
				{content}
			</Link>
		);
	}
	return (
		<span
			role="img"
			aria-label={label}
			title={CALENDAR_STATE_LABELS[cell.state]}
			className={className}
		>
			{content}
		</span>
	);
}

function CalendarCard({ today }: { today: string }) {
	const canSell = useCan("rentals:sell");
	const breakpoint = useBreakpoint();
	const days = DAYS_BY_BREAKPOINT[breakpoint];
	const [start, setStart] = useState(today);
	const calendar = useQuery(
		orpc.availability.calendar.queryOptions({
			input: { start, days },
			placeholderData: (previous) => previous,
		}),
	);

	const gridColumns = `var(--label-column) repeat(${days}, minmax(0, 1fr))`;

	return (
		<Card
			aria-labelledby="cal"
			className="gap-2.5 px-(--card-spacing) [--label-column:92px] md:[--label-column:170px] xl:[--label-column:200px]"
		>
			<div className="flex flex-wrap items-center justify-between gap-3 pb-1.5">
				<h2 id="cal" className="type-title text-xl/6">
					Próximos dias
				</h2>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="icon"
						aria-label="Dias anteriores"
						onClick={() => setStart(addCalendarDays(start, -days))}
					>
						<ChevronLeft aria-hidden />
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label="Próximos dias"
						onClick={() => setStart(addCalendarDays(start, days))}
					>
						<ChevronRight aria-hidden />
					</Button>
				</div>
			</div>

			{calendar.isError && (
				<ErrorState error={calendar.error} onRetry={() => calendar.refetch()} />
			)}
			{calendar.isPending && <Skeleton className="h-96 rounded-lg" />}
			{calendar.data && (
				<div className="flex flex-col gap-1">
					<div
						className="grid items-end gap-1"
						style={{ gridTemplateColumns: gridColumns }}
					>
						<span className="text-muted-foreground pb-1 text-[13px]">
							Equipamento
						</span>
						{calendar.data.days.map((day) => {
							const weekday = formatWeekdayShort(day);
							return (
								<span
									key={day}
									className={cn(
										"text-muted-foreground flex flex-col items-center rounded-md py-1 text-xs/[15px]",
										weekday === "Dom" && "bg-muted",
									)}
								>
									{weekday}
									<b className="text-foreground text-sm">
										{formatDayOfMonth(day)}
									</b>
								</span>
							);
						})}
					</div>
					{calendar.data.rows.map((row) => (
						<div
							key={row.code}
							className="grid items-center gap-1"
							style={{ gridTemplateColumns: gridColumns }}
						>
							<span className="flex min-w-0 flex-col pr-2">
								<b className="truncate text-sm/[18px]">{row.label}</b>
								<span className="text-muted-foreground hidden truncate text-[13px]/[17px] md:block">
									{row.name}
								</span>
							</span>
							{row.cells.map((cell) => (
								<CalendarCellView
									key={cell.date}
									row={row}
									cell={cell}
									canSell={canSell}
								/>
							))}
						</div>
					))}
				</div>
			)}

			<div className="flex flex-wrap gap-x-5 gap-y-2.5 border-t pt-3">
				{LEGEND.map((state) => (
					<span
						key={state}
						className="inline-flex items-center gap-2 text-[13px]"
					>
						<span
							aria-hidden
							className={cn(
								"border-calendar-border h-3.5 w-[18px] rounded-sm border",
								CELL_STYLES[state],
							)}
						/>
						{CALENDAR_STATE_LABELS[state]}
					</span>
				))}
			</div>
			<p className="text-muted-foreground text-sm/5">
				Toque num dia livre para começar uma reserva. No andaime, o número é de
				peças livres.
			</p>
		</Card>
	);
}

export function AgendaScreen({
	search,
	onSearchChange,
}: {
	search: AgendaSearch;
	onSearchChange: (next: AgendaSearch) => void;
}) {
	const today = calendarDay(new Date());
	const fallback = defaultPeriod(today);
	const applied = {
		q: search.q,
		start: search.saida ?? fallback.start,
		end: search.devolucao ?? fallback.end,
	};
	const [query, setQuery] = useState(search.q ?? "");
	const [start, setStart] = useState(applied.start);
	const [end, setEnd] = useState(applied.end);
	const [periodError, setPeriodError] = useState<string | null>(null);

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (Date.parse(end) <= Date.parse(start)) {
			setPeriodError("A devolução precisa ser depois da saída.");
			return;
		}
		setPeriodError(null);
		onSearchChange({
			...search,
			q: query.trim() || undefined,
			saida: start,
			devolucao: end,
		});
	};

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Agenda"
				description="Veja o que está livre no período e reserve na hora."
			/>

			<form
				aria-label="Consultar disponibilidade"
				onSubmit={submit}
				className="bg-card grid items-end gap-4 rounded-2xl p-4 md:grid-cols-2 md:p-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
			>
				<FieldShell label="Equipamento">
					{({ id }) => (
						<Input
							id={id}
							value={query}
							placeholder="Martelete ou demolidor"
							onChange={(event) => setQuery(event.target.value)}
						/>
					)}
				</FieldShell>
				<FieldShell label="Saída">
					{({ id }) => (
						<DateTimeInput id={id} value={start} onChange={setStart} />
					)}
				</FieldShell>
				<FieldShell label="Devolução" errors={periodError ? [periodError] : []}>
					{({ id, invalid, describedBy }) => (
						<DateTimeInput
							id={id}
							value={end}
							onChange={setEnd}
							invalid={invalid}
							describedBy={describedBy}
						/>
					)}
				</FieldShell>
				<Button type="submit" className="min-h-12">
					Ver disponibilidade
				</Button>
			</form>

			<ResultsCard query={applied.q} start={applied.start} end={applied.end} />
			<CalendarCard today={today} />
		</div>
	);
}
