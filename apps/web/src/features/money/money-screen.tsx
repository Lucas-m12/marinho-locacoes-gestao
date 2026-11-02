import type {
	CategoryTotal,
	ExportCsvOutput,
	LedgerEntry,
	Receivable,
	ReceivableKind,
} from "@marinho-gestao/contract";
import { calendarDay, type LedgerDirection } from "@marinho-gestao/domain";
import { Button } from "@marinho-gestao/ui/components/button";
import { Card } from "@marinho-gestao/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@marinho-gestao/ui/components/dialog";
import {
	NativeSelect,
	NativeSelectOption,
} from "@marinho-gestao/ui/components/native-select";
import { Skeleton } from "@marinho-gestao/ui/components/skeleton";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@marinho-gestao/ui/components/tabs";
import { Textarea } from "@marinho-gestao/ui/components/textarea";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Download,
	HandCoins,
	Minus,
	Plus,
	ReceiptText,
	Undo2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { FieldShell } from "@/components/form/fields";
import { KpiCard } from "@/components/kpi-card";
import {
	EmptyState,
	ErrorState,
	ListSkeleton,
	PageHeader,
} from "@/components/page";
import { StatusChip } from "@/components/status-chip";
import { orpc } from "@/data/client";
import { useCan } from "@/features/auth/use-current-user";
import { useIdempotencyKey } from "@/hooks/use-idempotency-key";
import { describeError, isLocallyHandled } from "@/lib/errors";
import { formatDate, formatMonthYear, money } from "@/lib/format";
import { LEDGER_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";
import { last30Days } from "@/lib/periods";
import { LedgerEntryDialog } from "./ledger-entry-dialog";

export const MoneySearch = z.object({
	conta: z.enum(["caixa", "caucao", "receber"]).optional(),
});
export type MoneySearch = z.infer<typeof MoneySearch>;

type Tab = NonNullable<MoneySearch["conta"]>;

const VISIBLE_ENTRIES = 10;

const RECEIVABLE_LABELS: Record<ReceivableKind, string> = {
	BALANCE: "saldo",
	CHARGE: "ocorrências cobradas",
	LATE: "dias de atraso",
};

function EntryRow({
	entry,
	onReverse,
}: {
	entry: LedgerEntry;
	onReverse?: () => void;
}) {
	const isIn = entry.direction === "IN";
	const reversed = entry.reversedById !== null;
	const isReversal = entry.reversalOfId !== null;
	const link = entry.unitCode ?? entry.rentalNumber;
	return (
		<li className="flex min-h-[60px] items-center gap-3.5 border-t py-2.5">
			<span
				aria-hidden
				className={cn(
					"flex size-9 flex-none items-center justify-center rounded-full text-lg font-extrabold",
					isIn
						? "bg-status-available text-positive"
						: "bg-alert text-alert-foreground",
				)}
			>
				{isIn ? "+" : "−"}
			</span>
			<span className="flex min-w-0 grow flex-col gap-0.5">
				<b
					className={cn(
						"text-[15px]/[21px]",
						reversed && "text-muted-foreground line-through",
					)}
				>
					{entry.reversalReason ?? entry.description}
				</b>
				<span className="text-muted-foreground text-[13px]">
					{[
						LEDGER_CATEGORY_LABELS[entry.category],
						link,
						PAYMENT_METHOD_LABELS[entry.method],
					]
						.filter(Boolean)
						.join(" · ")}
				</span>
				{reversed && (
					<StatusChip tone="waiting" size="sm" className="self-start">
						Estornado
					</StatusChip>
				)}
				{isReversal && (
					<StatusChip
						tone="waiting"
						size="sm"
						className="self-start py-0.5 whitespace-normal"
					>
						Estorno de {entry.reversalOfDescription}
					</StatusChip>
				)}
			</span>
			<span className="flex flex-none flex-col items-end gap-0.5">
				<b
					className={cn(
						"text-[15px]",
						reversed
							? "text-muted-foreground line-through"
							: isIn
								? "text-positive"
								: "text-alert-foreground",
					)}
				>
					{isIn ? "+" : "−"} {money(entry.amountCents)}
				</b>
				<span className="text-muted-foreground text-[13px]">
					{formatDate(entry.occurredAt)}
				</span>
			</span>
			{onReverse && (
				<Button
					variant="ghost"
					size="xs"
					className="flex-none px-2.5"
					aria-label={`Estornar ${entry.description}`}
					onClick={onReverse}
				>
					<Undo2 aria-hidden />
					<span className="hidden md:inline">Estornar</span>
				</Button>
			)}
		</li>
	);
}

function ReverseDialog({
	entry,
	onClose,
}: {
	entry: LedgerEntry;
	onClose: () => void;
}) {
	const reverse = useMutation(orpc.ledger.reverse.mutationOptions());
	const [idempotencyKey] = useIdempotencyKey();
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (reason.trim().length < 3) {
			setError("Informe o motivo do estorno.");
			return;
		}
		try {
			await reverse.mutateAsync({
				entryId: entry.id,
				reason,
				idempotencyKey,
			});
			toast.success("Lançamento estornado.");
			onClose();
		} catch (mutationError) {
			if (isLocallyHandled(mutationError)) {
				setError(describeError(mutationError));
			}
		}
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Estornar lançamento</DialogTitle>
					<DialogDescription>
						{entry.description} · {money(entry.amountCents)}. O lançamento não é
						apagado: entra um inverso, ligado a ele.
					</DialogDescription>
				</DialogHeader>
				<FieldShell label="Motivo" errors={error ? [error] : []}>
					{({ id, invalid, describedBy }) => (
						<Textarea
							id={id}
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							aria-invalid={invalid}
							aria-describedby={describedBy}
						/>
					)}
				</FieldShell>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Voltar
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={reverse.isPending}
						onClick={submit}
					>
						Estornar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

const EXPORTABLE_MONTHS = 12;

function recentMonths(now: Date): string[] {
	const [year = 0, month = 1] = calendarDay(now).split("-").map(Number);
	return Array.from({ length: EXPORTABLE_MONTHS }, (_, index) => {
		const date = new Date(Date.UTC(year, month - 1 - index, 1));
		return date.toISOString().slice(0, 7);
	});
}

function downloadCsv({ fileName, content }: ExportCsvOutput) {
	const url = URL.createObjectURL(
		new Blob([content], { type: "text/csv;charset=utf-8" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ExportDialog({ onClose }: { onClose: () => void }) {
	const months = recentMonths(new Date());
	const [month, setMonth] = useState(months[0] ?? "");
	const exportCsv = useMutation(orpc.ledger.exportCsv.mutationOptions());

	const submit = async () => {
		const file = await exportCsv.mutateAsync({ month });
		downloadCsv(file);
		toast.success(`${file.fileName} baixado.`);
		onClose();
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Exportar mês</DialogTitle>
					<DialogDescription>
						Arquivo do caixa para o contador. A caução fica de fora, porque não
						é faturamento.
					</DialogDescription>
				</DialogHeader>
				<FieldShell label="Mês">
					{({ id }) => (
						<NativeSelect
							id={id}
							value={month}
							onChange={(event) => setMonth(event.target.value)}
						>
							{months.map((option) => (
								<NativeSelectOption key={option} value={option}>
									{formatMonthYear(option)}
								</NativeSelectOption>
							))}
						</NativeSelect>
					)}
				</FieldShell>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="button" disabled={exportCsv.isPending} onClick={submit}>
						Baixar CSV
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EntriesCard({
	account,
	range,
}: {
	account: "CASH" | "DEPOSIT";
	range: { from: string; to: string };
}) {
	const entries = useQuery(
		orpc.ledger.list.queryOptions({ input: { account, ...range } }),
	);
	const canWrite = useCan("money:write");
	const [reversing, setReversing] = useState<LedgerEntry | null>(null);
	const [showAll, setShowAll] = useState(false);
	const rows = entries.data?.entries ?? [];
	const visible = showAll ? rows : rows.slice(0, VISIBLE_ENTRIES);
	return (
		<Card aria-labelledby="lanc" className="min-w-0 gap-1 px-(--card-spacing)">
			<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 pb-2">
				<h2 id="lanc" className="type-title text-xl/6">
					Lançamentos
				</h2>
				<span className="text-muted-foreground text-sm">últimos 30 dias</span>
			</div>
			{entries.isPending && <ListSkeleton rows={6} />}
			{entries.isError && (
				<ErrorState error={entries.error} onRetry={() => entries.refetch()} />
			)}
			{entries.data?.entries.length === 0 && (
				<EmptyState
					icon={ReceiptText}
					title="Nenhum lançamento"
					description={
						account === "CASH"
							? "Use Entrada ou Despesa para lançar o que entrou ou saiu."
							: "A caução aparece aqui quando for recebida na entrega."
					}
				/>
			)}
			{visible.length > 0 && (
				<ul className="flex flex-col">
					{visible.map((entry) => (
						<EntryRow
							key={entry.id}
							entry={entry}
							onReverse={
								canWrite &&
								entry.reversedById === null &&
								entry.reversalOfId === null
									? () => setReversing(entry)
									: undefined
							}
						/>
					))}
				</ul>
			)}
			{reversing && (
				<ReverseDialog entry={reversing} onClose={() => setReversing(null)} />
			)}
			{visible.length < rows.length && (
				<Button
					variant="secondary"
					className="mt-2 self-start"
					onClick={() => setShowAll(true)}
				>
					Ver todos os {rows.length} lançamentos
				</Button>
			)}
		</Card>
	);
}

function CategoryBars({
	rows,
	barClass,
}: {
	rows: CategoryTotal[];
	barClass: string;
}) {
	const highest = Math.max(...rows.map((row) => row.amountCents), 1);
	return rows.map((row) => (
		<div key={row.category} className="flex flex-col gap-1">
			<span className="flex justify-between gap-3 text-sm">
				<span>{LEDGER_CATEGORY_LABELS[row.category]}</span>
				<b>{money(row.amountCents)}</b>
			</span>
			<span aria-hidden className="bg-muted flex h-2 rounded-sm">
				<span
					className={cn("rounded-sm", barClass)}
					style={{ width: `${(row.amountCents / highest) * 100}%` }}
				/>
			</span>
		</div>
	));
}

function CategoriesCard({ range }: { range: { from: string; to: string } }) {
	const totals = useQuery(
		orpc.ledger.byCategory.queryOptions({ input: range }),
	);
	const groupTitle =
		"text-[13px] font-bold tracking-[0.06em] text-muted-foreground uppercase";
	return (
		<Card aria-labelledby="cat" className="px-(--card-spacing)">
			<h2 id="cat" className="type-title text-xl/6">
				Por categoria
			</h2>
			{totals.isPending && <Skeleton className="h-40 rounded-lg" />}
			{totals.isError && (
				<ErrorState error={totals.error} onRetry={() => totals.refetch()} />
			)}
			{totals.data && (
				<>
					<span className={groupTitle}>Entradas</span>
					<CategoryBars rows={totals.data.in} barClass="bg-bar-available" />
					<span className={cn(groupTitle, "pt-1.5")}>Saídas</span>
					<CategoryBars rows={totals.data.out} barClass="bg-bar-maintenance" />
				</>
			)}
		</Card>
	);
}

function ReceivableRow({ item }: { item: Receivable }) {
	const balanceWhen = item.delivered ? "em aberto" : "na entrega";
	const when =
		item.kind === "BALANCE"
			? `${RECEIVABLE_LABELS.BALANCE} ${balanceWhen}`
			: RECEIVABLE_LABELS[item.kind];
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-[15px]">
			<Link
				to="/locacoes/$numero"
				params={{ numero: item.rentalNumber }}
				className="flex min-h-11 min-w-0 items-center hover:underline"
			>
				{item.rentalNumber} · {item.customerName} · {when}
			</Link>
			<span className="flex items-center gap-2">
				{item.provisional && (
					<span className="text-muted-foreground text-[13px]">
						regra provisória
					</span>
				)}
				<b className={item.provisional ? "text-alert-foreground" : undefined}>
					{money(item.amountCents)}
				</b>
			</span>
		</div>
	);
}

function ReceivablesCard() {
	const receivables = useQuery(orpc.ledger.receivables.queryOptions());
	return (
		<Card aria-labelledby="receber" className="gap-2.5 px-(--card-spacing)">
			<h2 id="receber" className="type-title text-xl/6">
				A receber
			</h2>
			{receivables.isPending && <Skeleton className="h-20 rounded-lg" />}
			{receivables.isError && (
				<ErrorState
					error={receivables.error}
					onRetry={() => receivables.refetch()}
				/>
			)}
			{receivables.data?.items.length === 0 && (
				<p className="text-muted-foreground text-[15px]">
					Nada a receber agora.
				</p>
			)}
			{receivables.data?.items.map((item) => (
				<ReceivableRow key={`${item.rentalNumber}-${item.kind}`} item={item} />
			))}
		</Card>
	);
}

function DepositKpis({ range }: { range: { from: string; to: string } }) {
	const summary = useQuery(
		orpc.ledger.depositSummary.queryOptions({ input: range }),
	);
	if (summary.isPending) return <Skeleton className="h-24 rounded-2xl" />;
	if (summary.isError) {
		return (
			<ErrorState error={summary.error} onRetry={() => summary.refetch()} />
		);
	}
	const { data } = summary;
	return (
		<div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
			<KpiCard
				label="Recebidas"
				value={money(data.receivedCents)}
				note="últimos 30 dias"
			/>
			<KpiCard
				label="Devolvidas"
				value={money(data.refundedCents)}
				note="últimos 30 dias"
			/>
			<KpiCard
				label="Retidas"
				value={money(data.retainedCents)}
				note="entraram no caixa"
			/>
			<KpiCard
				tone="navy"
				label="Caução em mãos"
				value={money(data.heldCents)}
				note={`fora do caixa, ${data.heldRentalCount} locações`}
			/>
		</div>
	);
}

function CashKpis({ range }: { range: { from: string; to: string } }) {
	const summary = useQuery(
		orpc.dashboard.summary.queryOptions({ input: range }),
	);
	if (summary.isPending) return <Skeleton className="h-24 rounded-2xl" />;
	if (summary.isError) {
		return (
			<ErrorState error={summary.error} onRetry={() => summary.refetch()} />
		);
	}
	const { data } = summary;
	return (
		<div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
			<KpiCard
				label="Entrou"
				value={money(data.inCents)}
				note="últimos 30 dias"
			/>
			<KpiCard
				label="Saiu"
				value={money(data.outCents)}
				note="últimos 30 dias"
			/>
			<KpiCard
				tone="positive"
				label="Resultado"
				value={money(data.resultCents)}
				note="entrou menos saiu"
			/>
			<KpiCard
				tone="navy"
				label="Caução em mãos"
				value={money(data.depositHeldCents)}
				note={`fora do caixa, ${data.depositHeldRentalCount} locações`}
			/>
		</div>
	);
}

export function MoneyScreen({
	search,
	onSearchChange,
}: {
	search: MoneySearch;
	onSearchChange: (next: MoneySearch) => void;
}) {
	const tab: Tab = search.conta ?? "caixa";
	const [direction, setDirection] = useState<LedgerDirection | null>(null);
	const [exporting, setExporting] = useState(false);
	const range = last30Days(new Date());

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Dinheiro"
				description="Tudo o que entra e sai. A caução fica à parte."
				actions={
					<>
						<Button variant="outline" onClick={() => setExporting(true)}>
							<Download aria-hidden />
							Exportar mês (CSV)
						</Button>
						<Button variant="outline" onClick={() => setDirection("OUT")}>
							<Minus aria-hidden strokeWidth={2.4} />
							Despesa
						</Button>
						<Button onClick={() => setDirection("IN")}>
							<Plus aria-hidden strokeWidth={2.4} />
							Entrada
						</Button>
					</>
				}
			/>

			<Tabs
				value={tab}
				onValueChange={(value) => onSearchChange({ conta: value as Tab })}
				className="gap-6"
			>
				<TabsList aria-label="Contas">
					<TabsTrigger value="caixa">Caixa</TabsTrigger>
					<TabsTrigger value="caucao">Caução</TabsTrigger>
					<TabsTrigger value="receber">A receber</TabsTrigger>
				</TabsList>

				<TabsContent value="caixa" className="flex flex-col gap-6">
					<CashKpis range={range} />
					<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
						<EntriesCard account="CASH" range={range} />
						<div className="flex min-w-0 flex-col gap-6">
							<CategoriesCard range={range} />
							<ReceivablesCard />
						</div>
					</div>
				</TabsContent>

				<TabsContent value="caucao" className="flex flex-col gap-6">
					<DepositKpis range={range} />
					<EntriesCard account="DEPOSIT" range={range} />
				</TabsContent>

				<TabsContent value="receber" className="flex flex-col gap-6">
					<CashKpis range={range} />
					<ReceivablesCard />
					<p className="text-muted-foreground flex items-start gap-2 text-sm/5">
						<HandCoins aria-hidden className="mt-0.5 size-4 flex-none" />O saldo
						a receber aparece no cliente até ser pago. O atraso segue a regra
						provisória: dias a mais × diárias da locação.
					</p>
				</TabsContent>
			</Tabs>

			{exporting && <ExportDialog onClose={() => setExporting(false)} />}
			{direction && (
				<LedgerEntryDialog
					direction={direction}
					onClose={() => setDirection(null)}
				/>
			)}
		</div>
	);
}
