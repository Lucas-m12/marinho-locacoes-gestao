import type {
	AwaitingSignal,
	DashboardMovement,
	OverdueRental,
} from "@marinho-gestao/contract";
import type { UnitStatus } from "@marinho-gestao/domain";
import { buttonVariants } from "@marinho-gestao/ui/components/button";
import { Card } from "@marinho-gestao/ui/components/card";
import { Skeleton } from "@marinho-gestao/ui/components/skeleton";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Plus, TriangleAlert } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { ErrorState, PageHeader, ScreenSkeleton } from "@/components/page";
import { StatusChip } from "@/components/status-chip";
import { orpc } from "@/data/client";
import { useCan, useCurrentUser } from "@/features/auth/use-current-user";
import {
	formatDate,
	formatLongDay,
	formatTime,
	greeting,
	hoursRemaining,
	money,
	relativeDay,
} from "@/lib/format";
import { UNIT_STATUS_LABELS } from "@/lib/labels";
import { last30Days } from "@/lib/periods";

const BAR_COLORS: Partial<Record<UnitStatus, string>> = {
	AVAILABLE: "bg-bar-available",
	SEPARATED: "bg-bar-separated",
	RENTED: "bg-bar-rented",
	IN_INSPECTION: "bg-bar-inspection",
};

function OverdueBanner({
	overdue,
	now,
}: {
	overdue: OverdueRental[];
	now: Date;
}) {
	if (overdue.length === 0) return null;
	return (
		<div className="bg-alert text-alert-foreground flex flex-col gap-3 rounded-2xl px-5 py-4">
			{overdue.map((rental, index) => (
				<div
					key={rental.rentalNumber}
					className="flex flex-wrap items-center gap-x-5 gap-y-3"
				>
					<TriangleAlert aria-hidden className="size-6 flex-none" />
					<p className="flex-[1_1_260px] text-[15px]/[22px]">
						{index === 0 && (
							<b>
								{overdue.length === 1
									? "1 equipamento atrasado. "
									: `${overdue.length} equipamentos atrasados. `}
							</b>
						)}
						{rental.equipment} está com {rental.customerName}
						{rental.city ? `, em ${rental.city}` : ""}. Devia ter voltado{" "}
						{relativeDay(rental.dueAt, now)} às {formatTime(rental.dueAt)}.
						{rental.nextBooking &&
							` A próxima reserva (${rental.nextBooking.rentalNumber}) sai ${formatDate(rental.nextBooking.startAt)} e corre risco.`}
					</p>
					<Link
						to="/locacoes/$numero"
						params={{ numero: rental.rentalNumber }}
						className="border-alert-foreground inline-flex min-h-11 items-center rounded-lg border-[1.5px] px-4 text-[15px] font-bold"
					>
						Ver locação
					</Link>
				</div>
			))}
		</div>
	);
}

function SummarySection() {
	const summary = useQuery(
		orpc.dashboard.summary.queryOptions({ input: last30Days(new Date()) }),
	);

	return (
		<section aria-labelledby="mes" className="flex flex-col gap-3">
			<h2 id="mes" className="type-title text-xl/6">
				Últimos 30 dias
			</h2>
			{summary.isPending && (
				<div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
					<Skeleton className="h-24 rounded-2xl" />
					<Skeleton className="h-24 rounded-2xl" />
					<Skeleton className="h-24 rounded-2xl" />
					<Skeleton className="h-24 rounded-2xl" />
				</div>
			)}
			{summary.isError && (
				<ErrorState error={summary.error} onRetry={() => summary.refetch()} />
			)}
			{summary.data && (
				<div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
					<KpiCard
						label="Entrou"
						value={money(summary.data.inCents)}
						note="locações, entregas e consumíveis"
					/>
					<KpiCard
						label="Saiu"
						value={money(summary.data.outCents)}
						note="manutenção, combustível, anúncio"
					/>
					<KpiCard
						tone="positive"
						label="Resultado"
						value={money(summary.data.resultCents)}
						note="entrou menos saiu"
					/>
					<KpiCard
						label="Caução em mãos"
						value={money(summary.data.depositHeldCents)}
						note="separada do caixa"
					/>
				</div>
			)}
		</section>
	);
}

function MovementRow({ movement }: { movement: DashboardMovement }) {
	const first = movement.items[0];
	return (
		<li className="flex items-start gap-3.5 border-t py-3.5">
			<span className="type-condensed w-[52px] flex-none text-lg/[22px] font-extrabold">
				{formatTime(movement.at)}
			</span>
			<span className="flex min-w-0 grow flex-col gap-1">
				<b className="text-[15px]/[21px]">
					{movement.items.map((item) => item.label).join(" e ")}
				</b>
				<span className="text-muted-foreground text-sm/5">
					{[movement.customerName, movement.city, movement.rentalNumber]
						.filter(Boolean)
						.join(" · ")}
				</span>
				<span className="self-start">
					{first?.unitStatus && movement.displayStatus === "CONFIRMED" ? (
						<StatusChip kind="unit" status={first.unitStatus} size="sm" />
					) : (
						<StatusChip
							kind="rental"
							status={movement.displayStatus}
							size="sm"
						/>
					)}
				</span>
			</span>
			<Link
				to="/locacoes/$numero"
				params={{ numero: movement.rentalNumber }}
				aria-label={`Abrir ${movement.rentalNumber}`}
				className="hover:bg-muted flex size-11 flex-none items-center justify-center rounded-lg"
			>
				<ChevronRight aria-hidden className="size-5" />
			</Link>
		</li>
	);
}

function MovementCard({
	id,
	title,
	movements,
	empty,
	footer,
}: {
	id: string;
	title: string;
	movements: DashboardMovement[];
	empty: string;
	footer?: string;
}) {
	return (
		<Card aria-labelledby={id} className="gap-2 px-(--card-spacing)">
			<div className="flex items-center gap-2.5">
				<h2 id={id} className="type-title text-xl/6">
					{title}
				</h2>
				<span className="bg-primary text-primary-foreground flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-bold">
					{movements.length}
				</span>
			</div>
			{movements.length === 0 ? (
				<p className="text-muted-foreground border-t py-3.5 text-[15px]">
					{empty}
				</p>
			) : (
				<ul className="flex flex-col">
					{movements.map((movement) => (
						<MovementRow key={movement.rentalNumber} movement={movement} />
					))}
				</ul>
			)}
			{footer && (
				<div className="bg-background text-muted-foreground rounded-lg px-4 py-3.5 text-sm/5">
					{footer}
				</div>
			)}
		</Card>
	);
}

function SignalRow({ item, now }: { item: AwaitingSignal; now: Date }) {
	return (
		<Link
			to="/locacoes/$numero"
			params={{ numero: item.rentalNumber }}
			className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border-[1.5px] px-4 py-3.5"
		>
			<span className="flex flex-[1_1_200px] flex-col gap-0.5">
				<b className="text-[15px]">
					{item.rentalNumber} · {item.equipment}
				</b>
				<span className="text-muted-foreground text-sm">
					{[item.customerName, item.city, `sai ${formatDate(item.startAt)}`]
						.filter(Boolean)
						.join(" · ")}
				</span>
			</span>
			<StatusChip tone="alert">
				Expira em {hoursRemaining(item.signalDueAt, now)} h
			</StatusChip>
		</Link>
	);
}

export function DashboardScreen() {
	const user = useCurrentUser();
	const seesMoney = useCan("money:read");
	const canSell = useCan("rentals:sell");
	const today = useQuery(orpc.dashboard.today.queryOptions());

	if (today.isPending) return <ScreenSkeleton />;
	if (today.isError) {
		return <ErrorState error={today.error} onRetry={() => today.refetch()} />;
	}

	const { data } = today;
	const now = new Date(data.now);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				eyebrow={formatLongDay(now)}
				title={`${greeting(now)}, ${user.name}`}
				actions={
					canSell ? (
						<div className="hidden flex-wrap gap-3 md:flex">
							<Link
								to="/agenda"
								className={buttonVariants({ variant: "outline" })}
							>
								Consultar agenda
							</Link>
							<Link to="/locacoes/nova" className={buttonVariants()}>
								<Plus aria-hidden strokeWidth={2.4} />
								Nova locação
							</Link>
						</div>
					) : undefined
				}
			/>

			<OverdueBanner overdue={data.overdue} now={now} />
			{seesMoney && <SummarySection />}

			<div className="grid gap-6 xl:grid-cols-2">
				<MovementCard
					id="saem"
					title="Saem hoje"
					movements={data.leaving}
					empty="Nada para sair hoje."
				/>
				<MovementCard
					id="voltam"
					title="Voltam hoje"
					movements={data.returning}
					empty="Nada para voltar hoje."
					footer="Folga de inspeção: a unidade só volta para a agenda depois que o pai conferir."
				/>
			</div>

			<div className="grid gap-6 xl:grid-cols-2">
				<Card aria-labelledby="agora" className="gap-3.5 px-(--card-spacing)">
					<div className="flex flex-wrap items-baseline justify-between gap-3">
						<h2 id="agora" className="type-title text-xl/6">
							Equipamentos agora
						</h2>
						<Link
							to="/estoque"
							className="flex min-h-11 items-center text-sm font-semibold underline underline-offset-2"
						>
							Ver estoque
						</Link>
					</div>
					{data.unitCounts.map((entry) => (
						<div key={entry.status} className="flex items-center gap-3">
							<span className="w-[116px] flex-none text-sm">
								{UNIT_STATUS_LABELS[entry.status]}
							</span>
							<span
								aria-hidden
								className="bg-muted flex h-3 grow overflow-hidden rounded-md"
							>
								<span
									className={cn(
										BAR_COLORS[entry.status] ?? "bg-bar-maintenance",
									)}
									style={{
										width: `${(entry.count / data.unitTotal) * 100}%`,
									}}
								/>
							</span>
							<b className="w-6 flex-none text-right text-[15px]">
								{entry.count}
							</b>
						</div>
					))}
					{data.scaffold && (
						<p className="text-muted-foreground border-t pt-3 text-sm/5">
							<b className="text-foreground">Andaime:</b> {data.scaffold.free}{" "}
							de {data.scaffold.total} peças livres hoje.
							{data.scaffold.reserved > 0 &&
								` ${data.scaffold.reserved} ${data.scaffold.reserved === 1 ? "está reservada" : "estão reservadas"} para a ${data.scaffold.rentalNumbers.join(", ")}.`}
						</p>
					)}
				</Card>

				{seesMoney && (
					<Card aria-labelledby="sinal" className="gap-3.5 px-(--card-spacing)">
						<h2 id="sinal" className="type-title text-xl/6">
							Aguardando sinal
						</h2>
						{data.awaitingSignal.length === 0 && (
							<p className="text-muted-foreground text-[15px]">
								Nenhum orçamento esperando sinal.
							</p>
						)}
						{data.awaitingSignal.map((item) => (
							<SignalRow key={item.rentalNumber} item={item} now={now} />
						))}
						<p className="text-muted-foreground text-sm/5">
							Sem sinal até o prazo, a reserva cai e o equipamento volta a ficar
							livre na agenda.
						</p>
						<Link
							to="/locacoes"
							className={cn(
								buttonVariants({ variant: "secondary" }),
								"self-start",
							)}
						>
							Ver orçamentos
						</Link>
					</Card>
				)}
			</div>
		</div>
	);
}
