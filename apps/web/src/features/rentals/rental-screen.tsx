import type { Rental, RentalItem } from "@marinho-gestao/contract";
import type { UnitStatus } from "@marinho-gestao/domain";
import { Alert, AlertDescription } from "@marinho-gestao/ui/components/alert";
import { Button, buttonVariants } from "@marinho-gestao/ui/components/button";
import { Card } from "@marinho-gestao/ui/components/card";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { ErrorState, PageHeader, ScreenSkeleton } from "@/components/page";
import { StatusChip } from "@/components/status-chip";
import { ToDefine } from "@/components/to-define";
import { orpc } from "@/data/client";
import { useCan } from "@/features/auth/use-current-user";
import { showLocalError } from "@/lib/errors";
import {
	dailiesLabel,
	formatDate,
	formatDateAndTime,
	formatTime,
	formatWeekdayDateTime,
	hoursRemaining,
	initials,
	isSameBusinessDay,
	money,
} from "@/lib/format";
import {
	DELIVERY_MODE_LABELS,
	OCCURRENCE_DECISION_LABELS,
	OCCURRENCE_KIND_LABELS,
	PAYMENT_KIND_LABELS,
	PAYMENT_METHOD_LABELS,
} from "@/lib/labels";
import { useCopyQuoteText } from "./copy-quote";
import {
	CancelDialog,
	type DepositAction,
	DepositDialog,
	ExtendDialog,
	PaymentDialog,
} from "./rental-dialogs";

type StepState = "done" | "current" | "next";

type Step = { name: string; when: string; state: StepState };

function stepsOf(rental: Rental, now: Date): Step[] {
	const { status } = rental;
	const position = (() => {
		if (status === "QUOTE") return 0;
		if (status === "AWAITING_DEPOSIT") return 1;
		if (status === "CONFIRMED") return rental.allUnitsSeparated ? 3 : 2;
		if (status === "SEPARATED") return 3;
		if (status === "ON_SITE") return 4;
		if (status === "RETURNED") return 5;
		return 6;
	})();
	const state = (index: number): StepState => {
		if (index < position) return "done";
		return index === position ? "current" : "next";
	};
	const stamped = (value: string | null, fallback: string) =>
		value ? formatDateAndTime(value) : fallback;
	const startsToday = isSameBusinessDay(rental.startAt, now);
	const lastSeparation = rental.history.find((event) =>
		event.message.startsWith("Separado"),
	)?.at;

	return [
		{
			name: "Orçamento",
			when: stamped(rental.sentAt ?? rental.createdAt, "rascunho"),
			state: state(0),
		},
		{
			name: "Sinal pago",
			when: stamped(
				rental.payments.find((payment) => payment.reversedAt === null)
					?.paidAt ?? null,
				"falta o sinal",
			),
			state: state(1),
		},
		{
			name: "Separada",
			when: stamped(
				rental.separatedAt ?? lastSeparation ?? null,
				"antes da entrega",
			),
			state: state(2),
		},
		{
			name: "Na obra",
			when: rental.deliveredAt
				? formatDateAndTime(rental.deliveredAt)
				: startsToday
					? `hoje · ${formatTime(rental.startAt)}`
					: `previsto ${formatDate(rental.startAt)}`,
			state: state(3),
		},
		{
			name: "Devolvida",
			when: rental.returnedAt
				? formatDateAndTime(rental.returnedAt)
				: `previsto ${formatDate(rental.endAt)}`,
			state: state(4),
		},
		{
			name: "Encerrada",
			when: rental.closedAt
				? formatDateAndTime(rental.closedAt)
				: "depois da inspeção",
			state: state(5),
		},
	];
}

function Stepper({ rental, now }: { rental: Rental; now: Date }) {
	const steps = stepsOf(rental, now);
	return (
		<ol
			aria-label="Andamento da locação"
			className="bg-card flex flex-col gap-3.5 rounded-2xl p-4 md:flex-row md:gap-3 md:p-5"
		>
			{steps.map((step, index) => (
				<li
					key={step.name}
					aria-current={step.state === "current" ? "step" : undefined}
					className="flex min-w-0 flex-1 items-start gap-2.5 md:flex-col"
				>
					<span
						aria-hidden
						className={cn(
							"flex size-8 flex-none items-center justify-center rounded-full border-2 text-sm font-extrabold",
							step.state === "done" &&
								"border-primary bg-primary text-primary-foreground",
							step.state === "current" && "border-terracotta bg-card",
							step.state === "next" &&
								"border-line-strong bg-card text-muted-foreground",
						)}
					>
						{step.state === "done" ? "✓" : index + 1}
					</span>
					<span className="flex flex-col gap-0.5">
						<b
							className={cn(
								"text-[15px]/5",
								step.state === "next" && "text-muted-foreground",
							)}
						>
							{step.name}
						</b>
						<span className="text-muted-foreground text-[13px]">
							{step.when}
						</span>
					</span>
				</li>
			))}
		</ol>
	);
}

function InfoItem({
	label,
	children,
	emphasis,
}: {
	label: string;
	children: ReactNode;
	emphasis?: boolean;
}) {
	return (
		<div className="flex flex-col gap-0.5">
			<dt className="text-muted-foreground text-[13px]">{label}</dt>
			<dd
				className={cn(
					"text-[15px] font-bold",
					emphasis && "text-alert-foreground",
				)}
			>
				{children}
			</dd>
		</div>
	);
}

function pendingStage(rental: Rental): "saida" | "volta" | null {
	if (rental.status === "ON_SITE") return "volta";
	const readyToLeave =
		rental.status === "SEPARATED" ||
		(rental.status === "CONFIRMED" && rental.allUnitsSeparated);
	return readyToLeave ? "saida" : null;
}

function ChecklistLink({ rental, item }: { rental: Rental; item: RentalItem }) {
	const stage = pendingStage(rental);
	const pending =
		stage === "saida"
			? rental.pendingCheckouts.includes(item.code)
			: stage === "volta" && rental.pendingReturns.includes(item.code);
	const classes = buttonVariants({ variant: "secondary", size: "sm" });

	if (pending && stage === "saida") {
		return (
			<Link
				to="/locacoes/$numero/saida/$unidade"
				params={{ numero: rental.number, unidade: item.code }}
				className={classes}
			>
				Checklist de saída
			</Link>
		);
	}
	if (pending && stage === "volta") {
		return (
			<Link
				to="/locacoes/$numero/volta/$unidade"
				params={{ numero: rental.number, unidade: item.code }}
				className={classes}
			>
				Checklist de volta
			</Link>
		);
	}
	return null;
}

function EquipmentCard({ rental }: { rental: Rental }) {
	return (
		<Card aria-labelledby="equip" className="gap-3.5 px-(--card-spacing)">
			<h2 id="equip" className="type-title text-xl/6">
				{rental.items.length > 1 ? "Equipamentos" : "Equipamento"}
			</h2>
			{rental.items.map((item) => (
				<div key={item.id} className="flex flex-wrap items-center gap-4">
					<span
						aria-hidden
						className="bg-background text-muted-foreground flex size-[72px] flex-none items-center justify-center rounded-xl"
					>
						<Boxes className="size-7" strokeWidth={1.6} />
					</span>
					<span className="flex flex-[1_1_220px] flex-col gap-1">
						{item.kind === "UNIT" ? (
							<Link
								to="/estoque/$codigo"
								params={{ codigo: item.code }}
								className="text-[17px]/[23px] font-bold"
							>
								{item.code} · {item.name}
							</Link>
						) : (
							<b className="text-[17px]/[23px]">
								{item.name}
								{item.perPiece ? ` · ${item.quantity} peças` : ""}
							</b>
						)}
						<span className="text-muted-foreground text-sm">
							Acessórios: {item.accessories ?? <ToDefine />}
						</span>
						{item.perPiece && (
							<span className="text-muted-foreground text-sm">
								<Money cents={item.dailyPriceCents} /> × {item.quantity} peças ×{" "}
								{dailiesLabel(rental.dailies)} ={" "}
								<Money cents={item.subtotalCents} />
							</span>
						)}
					</span>
					{item.unitStatus && (
						<StatusChip kind="unit" status={item.unitStatus as UnitStatus} />
					)}
					<ChecklistLink rental={rental} item={item} />
				</div>
			))}
			<dl className="grid gap-x-6 gap-y-3 md:grid-cols-3">
				<InfoItem label="Saída">
					{formatWeekdayDateTime(rental.startAt)}
				</InfoItem>
				<InfoItem label="Devolução">
					{formatWeekdayDateTime(rental.endAt)}
				</InfoItem>
				<InfoItem label="Diárias">
					{rental.items.length === 1 && rental.items[0]?.dailyPriceCents ? (
						<>
							{rental.dailies} × {money(rental.items[0].dailyPriceCents)} ={" "}
							{money(rental.subtotalCents)}
						</>
					) : (
						`${dailiesLabel(rental.dailies)} = ${money(rental.subtotalCents)}`
					)}
				</InfoItem>
			</dl>
			<p className="text-muted-foreground text-[13px]">
				{rental.priceFrozenAt
					? `Preço congelado em ${formatDate(rental.priceFrozenAt)}, quando o sinal entrou.`
					: "O preço acompanha a tabela até o sinal entrar."}
			</p>
		</Card>
	);
}

function SiteCard({ rental }: { rental: Rental }) {
	const address = [rental.siteAddress, rental.siteCity]
		.filter(Boolean)
		.join(", ");
	return (
		<Card aria-labelledby="obra" className="px-(--card-spacing)">
			<h2 id="obra" className="type-title text-xl/6">
				Obra e entrega
			</h2>
			<dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
				<InfoItem label="Endereço">{address || <ToDefine />}</InfoItem>
				<InfoItem label="Modalidade">
					{DELIVERY_MODE_LABELS[rental.deliveryMode]}
				</InfoItem>
				<InfoItem label="Quem recebe">
					{rental.receiverName ?? <ToDefine />}
				</InfoItem>
				<InfoItem label="Termo" emphasis={!rental.termSigned}>
					{rental.termSigned ? "Assinado" : "Assinar na entrega"}
				</InfoItem>
				{rental.sitePinUrl && (
					<InfoItem label="Localização">
						<a
							href={rental.sitePinUrl}
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-2"
						>
							Abrir o pino
						</a>
					</InfoItem>
				)}
				{rental.notes && (
					<InfoItem label="Observações">{rental.notes}</InfoItem>
				)}
			</dl>
		</Card>
	);
}

function OccurrencesCard({ rental }: { rental: Rental }) {
	if (rental.occurrences.length === 0) return null;
	return (
		<Card aria-labelledby="ocorrencias" className="gap-1 px-(--card-spacing)">
			<h2 id="ocorrencias" className="type-title mb-2 text-xl/6">
				Ocorrências
			</h2>
			{rental.occurrences.map((occurrence) => (
				<div
					key={occurrence.id}
					className="flex flex-wrap items-center gap-x-3.5 gap-y-1 border-t py-3"
				>
					<span className="flex flex-[1_1_200px] flex-col gap-0.5">
						<b className="text-[15px]">
							{OCCURRENCE_KIND_LABELS[occurrence.kind]} ·{" "}
							{occurrence.description}
						</b>
						<span className="text-muted-foreground text-[13px]">
							{occurrence.itemCode} · sugerido{" "}
							{money(occurrence.suggestedCents)}
						</span>
					</span>
					<b className="text-[15px]">{money(occurrence.amountCents)}</b>
					<StatusChip
						tone={
							occurrence.decision === "CHARGE"
								? "reserved"
								: occurrence.decision === "DISPUTE"
									? "alert"
									: "waiting"
						}
					>
						{OCCURRENCE_DECISION_LABELS[occurrence.decision]}
					</StatusChip>
				</div>
			))}
		</Card>
	);
}

function HistoryCard({ rental }: { rental: Rental }) {
	return (
		<Card aria-labelledby="hist" className="gap-1 px-(--card-spacing)">
			<h2 id="hist" className="type-title mb-2.5 text-xl/6">
				Histórico
			</h2>
			{rental.history.map((event) => (
				<div key={event.id} className="flex gap-3.5 border-t py-3">
					<span className="text-muted-foreground w-[92px] flex-none text-[13px]/5">
						{formatDateAndTime(event.at)}
					</span>
					<span className="flex grow flex-col gap-0.5">
						<span className="text-[15px]/[21px] font-semibold">
							{event.message}
						</span>
						<span className="text-muted-foreground text-[13px]">
							{event.actorName}
						</span>
					</span>
				</div>
			))}
		</Card>
	);
}

function PaymentsCard({ rental }: { rental: Rental }) {
	const canWrite = useCan("money:write");
	const [dialogOpen, setDialogOpen] = useState(false);
	const acceptsPayment = !["QUOTE", "CANCELED", "EXPIRED"].includes(
		rental.status,
	);

	return (
		<Card aria-labelledby="pag" className="px-(--card-spacing)">
			<div className="flex items-baseline justify-between gap-3">
				<h2 id="pag" className="type-title text-xl/6">
					Pagamentos
				</h2>
				<b className="type-condensed text-2xl">{money(rental.totalCents)}</b>
			</div>
			{rental.payments.map((payment) => {
				const reversed = payment.reversedAt !== null;
				return (
					<div
						key={payment.id}
						className="flex items-center gap-3 border-t py-3"
					>
						<span className="flex grow flex-col">
							<b
								className={cn(
									"text-[15px]",
									reversed && "text-muted-foreground line-through",
								)}
							>
								{PAYMENT_KIND_LABELS[payment.kind]} ·{" "}
								{money(payment.amountCents)}
							</b>
							<span className="text-muted-foreground text-[13px]">
								{PAYMENT_METHOD_LABELS[payment.method]} ·{" "}
								{formatDate(payment.paidAt)}
							</span>
						</span>
						{reversed ? (
							<StatusChip tone="waiting">Estornado</StatusChip>
						) : (
							<StatusChip tone="available">Pago</StatusChip>
						)}
					</div>
				);
			})}
			{rental.balanceCents > 0 && (
				<div className="flex items-center gap-3 border-t py-3">
					<span className="flex grow flex-col">
						<b className="text-[15px]">Saldo · {money(rental.balanceCents)}</b>
						<span className="text-muted-foreground text-[13px]">
							{rental.deliveredAt ? "em aberto" : "cobrar na entrega"}
						</span>
					</span>
					<StatusChip tone="waiting">A receber</StatusChip>
				</div>
			)}
			{rental.deliveryFeeCents === null &&
				rental.deliveryMode === "DELIVERY" && (
					<p className="text-muted-foreground border-t pt-3 text-sm">
						Taxa de entrega: <ToDefine />
					</p>
				)}
			{canWrite && acceptsPayment && (
				<>
					<Button variant="secondary" onClick={() => setDialogOpen(true)}>
						Registrar pagamento
					</Button>
					{dialogOpen && (
						<PaymentDialog
							rental={rental}
							open={dialogOpen}
							onOpenChange={setDialogOpen}
						/>
					)}
				</>
			)}
		</Card>
	);
}

function depositText(rental: Rental): string {
	const { deposit } = rental;
	if (deposit.retainedCents > 0) {
		return `Retida: ${money(deposit.retainedCents)}. Motivo: ${deposit.retentionReason}.`;
	}
	if (deposit.heldCents > 0) {
		return deposit.refundDueAt
			? `Devolver até ${formatDateAndTime(deposit.refundDueAt)}, depois da inspeção.`
			: "Em mãos, fora do caixa. Volta em até 24 horas depois da inspeção.";
	}
	if (deposit.refundedCents > 0) {
		return `Devolvida em ${deposit.refundedAt ? formatDate(deposit.refundedAt) : ""}.`;
	}
	return "Receber na entrega, em Pix ou dinheiro, com recibo. Fica fora do caixa e volta em até 24 horas depois da inspeção.";
}

function DepositCard({ rental }: { rental: Rental }) {
	const canWrite = useCan("money:write");
	const [action, setAction] = useState<DepositAction | null>(null);
	const { deposit, status } = rental;
	const shown =
		deposit.receivedCents > 0 ? deposit.receivedCents : deposit.expectedCents;
	const canReceive =
		deposit.receivedCents === 0 &&
		["CONFIRMED", "SEPARATED", "ON_SITE", "AWAITING_DEPOSIT"].includes(status);
	const canSettle =
		deposit.heldCents > 0 && (status === "RETURNED" || status === "CLOSED");

	return (
		<Card
			aria-labelledby="cau"
			className="border-terracotta gap-2.5 border-2 px-(--card-spacing)"
		>
			<div className="flex items-baseline justify-between gap-3">
				<h2 id="cau" className="type-title text-xl/6">
					Caução
				</h2>
				<b className="text-lg">
					<Money cents={shown} />
				</b>
			</div>
			<p className="text-muted-foreground text-sm/5">{depositText(rental)}</p>
			{canWrite && canReceive && (
				<Button variant="secondary" onClick={() => setAction("receive")}>
					Registrar caução recebida
				</Button>
			)}
			{canWrite && canSettle && (
				<div className="flex flex-wrap gap-2.5">
					<Button
						variant="secondary"
						className="flex-1"
						onClick={() => setAction("refund")}
					>
						Devolver
					</Button>
					<Button
						variant="destructive"
						className="flex-1"
						onClick={() => setAction("retain")}
					>
						Reter
					</Button>
				</div>
			)}
			<DepositDialog
				key={action}
				rental={rental}
				action={action}
				onClose={() => setAction(null)}
			/>
		</Card>
	);
}

function CustomerCard({ rental }: { rental: Rental }) {
	const canRead = useCan("customers:read");
	const { customer } = rental;
	return (
		<Card aria-labelledby="cli" className="gap-2.5 px-(--card-spacing)">
			<h2 id="cli" className="type-title text-xl/6">
				Cliente
			</h2>
			<div className="flex items-center gap-3">
				<span
					aria-hidden
					className="bg-background flex size-11 flex-none items-center justify-center rounded-full font-extrabold"
				>
					{initials(customer.name)}
				</span>
				<span className="flex grow flex-col">
					<b className="text-base">{customer.name}</b>
					<span className="text-muted-foreground text-sm">
						{[
							customer.occupation,
							customer.city,
							customer.rentalCount === 1
								? "1 locação"
								: `${customer.rentalCount} locações`,
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
				</span>
				<StatusChip kind="customer" status={customer.tier} />
			</div>
			{canRead && (
				<Link
					to="/clientes/$id"
					params={{ id: customer.id }}
					className="flex min-h-11 items-center self-start text-sm font-semibold underline underline-offset-2"
				>
					Ver cliente
				</Link>
			)}
		</Card>
	);
}

function subtitle(rental: Rental, now: Date): string {
	const where = [rental.customerName, rental.customerCity]
		.filter(Boolean)
		.join(" · ");
	if (rental.status === "AWAITING_DEPOSIT" && rental.signalDueAt) {
		return `${where} · sinal expira em ${hoursRemaining(rental.signalDueAt, now)} h`;
	}
	if (["CONFIRMED", "SEPARATED"].includes(rental.status)) {
		const leaves = isSameBusinessDay(rental.startAt, now)
			? `sai hoje às ${formatTime(rental.startAt)}`
			: `sai ${formatWeekdayDateTime(rental.startAt)}`;
		return `${where} · ${leaves}`;
	}
	if (rental.displayStatus === "OVERDUE") {
		return `${where} · devia ter voltado ${formatDateAndTime(rental.endAt)}`;
	}
	if (rental.status === "ON_SITE") {
		return `${where} · volta ${formatWeekdayDateTime(rental.endAt)}`;
	}
	return where;
}

function RentalActions({ rental }: { rental: Rental }) {
	const canSell = useCan("rentals:sell");
	const canSeparate = useCan("rentals:separate");
	const canClose = useCan("rentals:close");
	const canWrite = useCan("money:write");
	const [extendOpen, setExtendOpen] = useState(false);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [paymentOpen, setPaymentOpen] = useState(false);
	const copy = useCopyQuoteText();

	const onError = showLocalError;
	const send = useMutation(
		orpc.rentals.sendQuote.mutationOptions({
			onSuccess: () => toast.success("Orçamento enviado. Unidades seguras."),
			onError,
		}),
	);
	const confirm = useMutation(
		orpc.rentals.confirm.mutationOptions({
			onSuccess: () => toast.success("Reserva confirmada."),
			onError,
		}),
	);
	const separate = useMutation(
		orpc.rentals.markSeparated.mutationOptions({
			onSuccess: () => toast.success("Locação separada."),
			onError,
		}),
	);
	const close = useMutation(
		orpc.rentals.close.mutationOptions({
			onSuccess: () => toast.success("Locação encerrada."),
			onError,
		}),
	);

	const { status, number } = rental;
	const stage = pendingStage(rental);
	const firstCheckout = rental.pendingCheckouts[0];
	const firstReturn = rental.pendingReturns[0];
	const canCancel =
		canSell &&
		["QUOTE", "AWAITING_DEPOSIT", "CONFIRMED", "SEPARATED"].includes(status);
	const canExtend =
		canSell && ["CONFIRMED", "SEPARATED", "ON_SITE"].includes(status);
	const awaitingSignal =
		status === "AWAITING_DEPOSIT" && rental.signalPaidCents === 0;

	return (
		<>
			{canCancel && (
				<Button variant="destructive" onClick={() => setCancelOpen(true)}>
					Cancelar
				</Button>
			)}
			{canExtend && (
				<Button variant="outline" onClick={() => setExtendOpen(true)}>
					Prorrogar
				</Button>
			)}
			{canSell && (status === "QUOTE" || status === "AWAITING_DEPOSIT") && (
				<Button
					variant="outline"
					disabled={copy.isPending}
					onClick={() => copy.mutate({ number })}
				>
					Copiar texto do orçamento
				</Button>
			)}
			{canSell && status === "QUOTE" && (
				<Button
					disabled={send.isPending}
					onClick={() => send.mutate({ number })}
				>
					Enviar orçamento
				</Button>
			)}
			{canWrite && awaitingSignal && (
				<Button onClick={() => setPaymentOpen(true)}>Registrar sinal</Button>
			)}
			{canSell && status === "AWAITING_DEPOSIT" && !awaitingSignal && (
				<Button
					disabled={confirm.isPending}
					onClick={() => confirm.mutate({ number })}
				>
					Confirmar reserva
				</Button>
			)}
			{canSeparate && status === "CONFIRMED" && !rental.allUnitsSeparated && (
				<Button
					disabled={separate.isPending}
					onClick={() => separate.mutate({ number })}
				>
					Marcar separada
				</Button>
			)}
			{stage === "saida" && firstCheckout && (
				<Link
					to="/locacoes/$numero/saida/$unidade"
					params={{ numero: number, unidade: firstCheckout }}
					className={buttonVariants()}
				>
					Registrar entrega
				</Link>
			)}
			{stage === "volta" && firstReturn && (
				<Link
					to="/locacoes/$numero/volta/$unidade"
					params={{ numero: number, unidade: firstReturn }}
					className={buttonVariants()}
				>
					Registrar devolução
				</Link>
			)}
			{canClose && status === "RETURNED" && (
				<Button
					disabled={close.isPending}
					onClick={() => close.mutate({ number })}
				>
					Encerrar locação
				</Button>
			)}
			{extendOpen && (
				<ExtendDialog
					rental={rental}
					open={extendOpen}
					onOpenChange={setExtendOpen}
				/>
			)}
			{cancelOpen && (
				<CancelDialog
					rental={rental}
					open={cancelOpen}
					onOpenChange={setCancelOpen}
				/>
			)}
			{paymentOpen && (
				<PaymentDialog
					rental={rental}
					open={paymentOpen}
					onOpenChange={setPaymentOpen}
				/>
			)}
		</>
	);
}

export function RentalScreen({ number }: { number: string }) {
	const rental = useQuery(orpc.rentals.get.queryOptions({ input: { number } }));
	const now = new Date();

	if (rental.isPending) return <ScreenSkeleton />;
	if (rental.isError) {
		return <ErrorState error={rental.error} onRetry={() => rental.refetch()} />;
	}

	const { data } = rental;
	const inactive = data.status === "CANCELED" || data.status === "EXPIRED";

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				back={{ to: "/locacoes", label: "Locações" }}
				title={data.number}
				titleAddon={
					<StatusChip kind="rental" status={data.displayStatus} size="lg" />
				}
				description={subtitle(data, now)}
				actions={<RentalActions rental={data} />}
			/>

			{inactive ? (
				<Alert variant="destructive">
					<AlertDescription>
						{data.status === "EXPIRED"
							? "Este orçamento expirou sem sinal e a agenda foi liberada."
							: `Locação cancelada${data.cancelReason ? `: ${data.cancelReason}` : ""}.`}
					</AlertDescription>
				</Alert>
			) : (
				<Stepper rental={data} now={now} />
			)}

			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
				<div className="flex min-w-0 flex-col gap-6">
					<EquipmentCard rental={data} />
					<SiteCard rental={data} />
					<OccurrencesCard rental={data} />
					<HistoryCard rental={data} />
				</div>
				<div className="flex min-w-0 flex-col gap-6">
					<PaymentsCard rental={data} />
					<DepositCard rental={data} />
					<CustomerCard rental={data} />
				</div>
			</div>
		</div>
	);
}
