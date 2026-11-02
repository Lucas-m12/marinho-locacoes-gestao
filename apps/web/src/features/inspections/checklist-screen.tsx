import type {
	FileRef,
	Inspection,
	InspectionItem,
	InspectionMedia,
	OccurrenceResolution,
	ReturnOutcome,
} from "@marinho-gestao/contract";
import {
	type ChecklistAnswer,
	type ChecklistMediaSlot,
	type Divergence,
	detectDivergences,
	type InspectionKind,
	isChecklistComplete,
	OCCURRENCE_DECISIONS,
	OCCURRENCE_KINDS,
	type OccurrenceDecision,
	type OccurrenceKind,
	PAYMENT_METHODS,
	type PaymentMethod,
	suggestOccurrenceAmount,
} from "@marinho-gestao/domain";
import { Alert, AlertDescription } from "@marinho-gestao/ui/components/alert";
import { Button } from "@marinho-gestao/ui/components/button";
import { Card } from "@marinho-gestao/ui/components/card";
import { Checkbox } from "@marinho-gestao/ui/components/checkbox";
import { Input } from "@marinho-gestao/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@marinho-gestao/ui/components/native-select";
import { Progress } from "@marinho-gestao/ui/components/progress";
import {
	RadioGroup,
	RadioGroupItem,
} from "@marinho-gestao/ui/components/radio-group";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Video } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { F2Badge } from "@/components/f2-badge";
import { FilePreview } from "@/components/file-preview";
import { FieldShell, MoneyField } from "@/components/form/fields";
import { ErrorState, PageHeader, ScreenSkeleton } from "@/components/page";
import { ToDefine } from "@/components/to-define";
import { UploadSlot } from "@/components/upload-slot";
import { orpc } from "@/data/client";
import { describeError, isLocallyHandled } from "@/lib/errors";
import { formatDateAndTime, money } from "@/lib/format";
import {
	CHECKLIST_MEDIA_LABELS,
	OCCURRENCE_DECISION_LABELS,
	OCCURRENCE_KIND_LABELS,
	PAYMENT_METHOD_LABELS,
} from "@/lib/labels";

const ANSWERS: { value: ChecklistAnswer; label: string; selected: string }[] = [
	{
		value: "OK",
		label: "OK",
		selected: "border-primary bg-primary text-primary-foreground",
	},
	{
		value: "NOT_OK",
		label: "Não OK",
		selected: "border-destructive bg-destructive text-white",
	},
	{
		value: "NA",
		label: "N/A",
		selected: "border-muted-foreground bg-muted-foreground text-white",
	},
];

const ANSWER_LABELS: Record<ChecklistAnswer, string> = {
	OK: "OK",
	NOT_OK: "Não OK",
	NA: "N/A",
};

const OUTCOMES: { value: ReturnOutcome; label: string; hint: string }[] = [
	{
		value: "AVAILABLE",
		label: "Disponível",
		hint: "Aprovada na inspeção, volta para a agenda",
	},
	{
		value: "IN_MAINTENANCE",
		label: "Em manutenção",
		hint: "Abre uma ordem de serviço",
	},
	{
		value: "DAMAGED",
		label: "Danificado",
		hint: "Dano sério, sai da agenda",
	},
];

type LineDraft = { answer: ChecklistAnswer | null; observation: string | null };

type ResolutionDraft = {
	kind: OccurrenceKind;
	amountCents: number | null;
	decision: OccurrenceDecision;
};

type Money = {
	received: boolean;
	amountCents: number | null;
	method: PaymentMethod;
};

function MethodPicker({
	value,
	onChange,
	label,
}: {
	value: PaymentMethod;
	onChange: (value: PaymentMethod) => void;
	label: string;
}) {
	return (
		<FieldShell label={label}>
			{({ id }) => (
				<NativeSelect
					id={id}
					value={value}
					onChange={(event) => onChange(event.target.value as PaymentMethod)}
				>
					{PAYMENT_METHODS.map((method) => (
						<NativeSelectOption key={method} value={method}>
							{PAYMENT_METHOD_LABELS[method]}
						</NativeSelectOption>
					))}
				</NativeSelect>
			)}
		</FieldShell>
	);
}

function plainField(
	value: number | null,
	onChange: (value: number | null) => void,
) {
	return {
		state: { value, meta: { errors: [] } },
		handleChange: onChange,
		handleBlur: () => undefined,
	};
}

function ChecklistRow({
	item,
	kind,
	draft,
	readOnly,
	onAnswer,
	onObservation,
}: {
	item: InspectionItem;
	kind: InspectionKind;
	draft: LineDraft;
	readOnly: boolean;
	onAnswer: (answer: ChecklistAnswer) => void;
	onObservation: (observation: string | null) => void;
}) {
	const [noteOpen, setNoteOpen] = useState(false);
	const showNote =
		!item.preexisting &&
		(noteOpen || draft.answer === "NOT_OK" || Boolean(draft.observation));
	const [note, setNote] = useState(draft.observation ?? "");

	return (
		<div className="flex flex-col gap-2.5 border-t py-3">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
				<span className="flex min-w-0 flex-[1_1_200px] flex-col gap-0.5">
					<b className="text-[15px]/[21px]">{item.label}</b>
					<span className="text-muted-foreground text-[13px]">{item.note}</span>
					{kind === "RETURN" && !item.preexisting && (
						<span className="text-muted-foreground text-[13px] font-semibold">
							Na saída:{" "}
							{item.checkoutAnswer
								? ANSWER_LABELS[item.checkoutAnswer]
								: "não registrado"}
							{item.checkoutObservation ? ` · ${item.checkoutObservation}` : ""}
						</span>
					)}
				</span>
				{item.preexisting ? (
					<span className="bg-status-waiting text-status-waiting-foreground rounded-full px-2.5 py-1 text-[13px] font-bold">
						Já tinha
					</span>
				) : (
					<fieldset className="m-0 flex gap-1.5 border-0 p-0">
						<legend className="sr-only">{item.label}</legend>
						{ANSWERS.map((option) => (
							<button
								key={option.value}
								type="button"
								disabled={readOnly}
								aria-pressed={draft.answer === option.value}
								onClick={() => onAnswer(option.value)}
								className={cn(
									"min-h-11 min-w-16 rounded-lg border-[1.5px] px-3 text-sm font-bold transition-colors disabled:cursor-not-allowed",
									draft.answer === option.value
										? option.selected
										: "border-input bg-field text-foreground",
								)}
							>
								{option.label}
							</button>
						))}
					</fieldset>
				)}
			</div>
			{!item.preexisting && !readOnly && !showNote && (
				<button
					type="button"
					onClick={() => setNoteOpen(true)}
					className="min-h-11 self-start text-[13px] font-semibold underline underline-offset-2"
				>
					Adicionar observação
				</button>
			)}
			{showNote && (
				<FieldShell label={`Observação de ${item.label}`}>
					{({ id }) => (
						<Input
							id={id}
							disabled={readOnly}
							value={note}
							onChange={(event) => setNote(event.target.value)}
							onBlur={() => onObservation(note.trim() || null)}
						/>
					)}
				</FieldShell>
			)}
		</div>
	);
}

function OccurrenceCard({
	divergence,
	draft,
	observation,
	onChange,
}: {
	divergence: Divergence;
	draft: ResolutionDraft;
	observation: string | null;
	onChange: (next: ResolutionDraft) => void;
}) {
	return (
		<div className="border-destructive bg-alert/40 flex flex-col gap-3 rounded-lg border-[1.5px] p-3.5">
			<div className="flex flex-col gap-0.5">
				<b className="text-[15px]">{divergence.label}</b>
				<span className="text-muted-foreground text-[13px]">
					Saiu{" "}
					{divergence.checkoutAnswer
						? ANSWER_LABELS[divergence.checkoutAnswer]
						: "sem registro"}{" "}
					e voltou Não OK{observation ? ` · ${observation}` : ""}
				</span>
			</div>
			<div className="grid grid-cols-2 gap-3">
				<FieldShell label="O que aconteceu">
					{({ id }) => (
						<NativeSelect
							id={id}
							value={draft.kind}
							onChange={(event) =>
								onChange({
									...draft,
									kind: event.target.value as OccurrenceKind,
								})
							}
						>
							{OCCURRENCE_KINDS.filter((kind) => kind !== "LATE").map(
								(kind) => (
									<NativeSelectOption key={kind} value={kind}>
										{OCCURRENCE_KIND_LABELS[kind]}
									</NativeSelectOption>
								),
							)}
						</NativeSelect>
					)}
				</FieldShell>
				<MoneyField
					label="Valor sugerido"
					hint="Regra provisória: uma diária"
					field={plainField(draft.amountCents, (amountCents) =>
						onChange({ ...draft, amountCents }),
					)}
				/>
			</div>
			<DecisionPicker
				label={divergence.label}
				value={draft.decision}
				onChange={(decision) => onChange({ ...draft, decision })}
			/>
		</div>
	);
}

function DecisionPicker({
	label,
	value,
	onChange,
}: {
	label: string;
	value: OccurrenceDecision;
	onChange: (value: OccurrenceDecision) => void;
}) {
	return (
		<fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
			<legend className="sr-only">Decisão sobre {label}</legend>
			{OCCURRENCE_DECISIONS.map((decision) => (
				<button
					key={decision}
					type="button"
					aria-pressed={value === decision}
					onClick={() => onChange(decision)}
					className={cn(
						"min-h-11 flex-1 rounded-lg border-[1.5px] px-3 text-sm font-bold transition-colors",
						value === decision
							? "border-primary bg-primary text-primary-foreground"
							: "border-input bg-field text-foreground",
					)}
				>
					{OCCURRENCE_DECISION_LABELS[decision]}
				</button>
			))}
		</fieldset>
	);
}

function MediaSlot({
	inspection,
	media,
	onSaved,
	onBusyChange,
	readOnly,
}: {
	inspection: Inspection;
	media: InspectionMedia;
	onSaved: (slot: ChecklistMediaSlot, file: FileRef) => Promise<void>;
	onBusyChange: (slot: ChecklistMediaSlot, busy: boolean) => void;
	readOnly: boolean;
}) {
	const label = CHECKLIST_MEDIA_LABELS[media.slot];
	const isVideo = media.slot === "TEST_VIDEO";
	const showsCheckout = inspection.kind === "RETURN";

	const slot = readOnly ? (
		media.file ? (
			<FilePreview
				fileKey={media.file.fileKey}
				contentType={media.file.contentType}
				alt={label}
				className="aspect-square w-full rounded-lg"
			/>
		) : (
			<span className="border-line-strong text-muted-foreground flex aspect-square items-center justify-center rounded-lg border border-dashed p-2 text-center text-xs">
				{label}: sem registro
			</span>
		)
	) : (
		<UploadSlot
			purpose={isVideo ? "CHECKLIST_VIDEO" : "CHECKLIST_PHOTO"}
			label={showsCheckout ? `${label} na volta` : label}
			file={media.file}
			onUploaded={(file) => onSaved(media.slot, file)}
			onBusyChange={(busy) => onBusyChange(media.slot, busy)}
			emptyIcon={isVideo ? <Video aria-hidden className="size-5" /> : undefined}
		/>
	);

	if (!showsCheckout) return slot;

	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-semibold">{label}</span>
			<div className="grid grid-cols-2 gap-1.5">
				{media.checkoutFile ? (
					<FilePreview
						fileKey={media.checkoutFile.fileKey}
						contentType={media.checkoutFile.contentType}
						alt={`${label} na saída`}
						className="aspect-square w-full rounded-lg"
					/>
				) : (
					<span className="bg-background text-muted-foreground flex aspect-square items-center justify-center rounded-lg p-1 text-center text-[11px]">
						sem foto na saída
					</span>
				)}
				{slot}
			</div>
		</div>
	);
}

function MoneyCheck({
	id,
	label,
	state,
	onChange,
	askAmount,
}: {
	id: string;
	label: string;
	state: Money;
	onChange: (next: Money) => void;
	askAmount: boolean;
}) {
	return (
		<div className="flex flex-col gap-2">
			<label
				htmlFor={id}
				className="flex min-h-11 items-center gap-3 text-[15px]"
			>
				<Checkbox
					id={id}
					checked={state.received}
					onCheckedChange={(received) => onChange({ ...state, received })}
				/>
				{label}
			</label>
			{state.received && (
				<div className="grid grid-cols-2 gap-3 pl-[34px]">
					{askAmount && (
						<MoneyField
							label="Valor"
							field={plainField(state.amountCents, (amountCents) =>
								onChange({ ...state, amountCents }),
							)}
						/>
					)}
					<MethodPicker
						label="Forma"
						value={state.method}
						onChange={(method) => onChange({ ...state, method })}
					/>
				</div>
			)}
		</div>
	);
}

function CheckoutPanel({
	inspection,
	busy,
	readyItems,
	onComplete,
	pending,
}: {
	inspection: Inspection;
	busy: boolean;
	readyItems: boolean;
	pending: boolean;
	onComplete: (values: {
		termSigned: boolean;
		balance: { amountCents: number; method: PaymentMethod } | null;
		deposit: { amountCents: number; method: PaymentMethod } | null;
	}) => void;
}) {
	const [termSigned, setTermSigned] = useState(inspection.termSigned);
	const [balance, setBalance] = useState<Money>({
		received: false,
		amountCents: inspection.balanceCents,
		method: "PIX",
	});
	const [deposit, setDeposit] = useState<Money>({
		received: false,
		amountCents: inspection.depositExpectedCents,
		method: "PIX",
	});
	const hasBalance = inspection.balanceCents > 0;
	const hasDeposit = inspection.depositReceivedCents === 0;
	const missingDeposit = deposit.received && !deposit.amountCents;

	return (
		<Card aria-labelledby="aceite" className="px-(--card-spacing)">
			<h2 id="aceite" className="type-title text-xl/6">
				Na entrega
			</h2>
			<label
				htmlFor="termo"
				className="flex min-h-11 items-center gap-3 text-[15px]"
			>
				<Checkbox
					id="termo"
					checked={termSigned}
					onCheckedChange={setTermSigned}
				/>
				Termo assinado por {inspection.customerName}
			</label>
			{hasBalance ? (
				<MoneyCheck
					id="saldo"
					label={`Saldo de ${money(inspection.balanceCents)} recebido`}
					state={balance}
					onChange={setBalance}
					askAmount={false}
				/>
			) : (
				<p className="text-muted-foreground text-sm">Saldo já pago.</p>
			)}
			{hasDeposit ? (
				<MoneyCheck
					id="caucao"
					label={
						inspection.depositExpectedCents === null
							? "Caução recebida, com recibo"
							: `Caução de ${money(inspection.depositExpectedCents)} recebida, com recibo`
					}
					state={deposit}
					onChange={setDeposit}
					askAmount={inspection.depositExpectedCents === null}
				/>
			) : (
				<p className="text-muted-foreground text-sm">
					Caução de {money(inspection.depositReceivedCents)} já recebida.
				</p>
			)}
			{inspection.depositExpectedCents === null && hasDeposit && (
				<p className="text-muted-foreground text-[13px]">
					Caução deste tipo: <ToDefine />. Digite o valor combinado.
				</p>
			)}
			<Button
				size="lg"
				disabled={pending || busy || !readyItems || missingDeposit}
				onClick={() =>
					onComplete({
						termSigned,
						balance:
							hasBalance && balance.received
								? {
										amountCents: inspection.balanceCents,
										method: balance.method,
									}
								: null,
						deposit:
							hasDeposit && deposit.received && deposit.amountCents
								? { amountCents: deposit.amountCents, method: deposit.method }
								: null,
					})
				}
			>
				{busy ? "Enviando arquivos…" : "Concluir saída"}
			</Button>
			<p className="text-muted-foreground text-[13px]/[19px]">
				Fotos, vídeo e respostas ficam guardados na {inspection.rentalNumber}{" "}
				para comparar na volta.
			</p>
		</Card>
	);
}

function ReturnPanel({
	inspection,
	divergences,
	lines,
	resolutions,
	onResolutionChange,
	busy,
	readyItems,
	pending,
	onComplete,
}: {
	inspection: Inspection;
	divergences: Divergence[];
	lines: Record<string, LineDraft>;
	resolutions: Record<string, ResolutionDraft>;
	onResolutionChange: (itemId: string, next: ResolutionDraft) => void;
	busy: boolean;
	readyItems: boolean;
	pending: boolean;
	onComplete: (values: {
		outcome: ReturnOutcome;
		lateFee: { amountCents: number; decision: OccurrenceDecision } | null;
	}) => void;
}) {
	const [outcome, setOutcome] = useState<ReturnOutcome>("AVAILABLE");
	const { lateFee } = inspection;
	const isLate = lateFee.extraDailies > 0;
	const [lateAmount, setLateAmount] = useState<number | null>(
		lateFee.suggestedCents,
	);
	const [lateDecision, setLateDecision] =
		useState<OccurrenceDecision>("CHARGE");
	const resolutionFor = (divergence: Divergence): ResolutionDraft =>
		resolutions[divergence.itemId] ?? {
			kind: divergence.kind,
			amountCents: suggestOccurrenceAmount({
				dailyPriceCents: inspection.dailyPriceCents,
			}),
			decision: "CHARGE",
		};

	return (
		<Card aria-labelledby="volta" className="px-(--card-spacing)">
			<h2 id="volta" className="type-title text-xl/6">
				Na volta
			</h2>
			{divergences.length === 0 ? (
				<p className="text-muted-foreground text-sm/5">
					Nenhuma diferença entre a saída e a volta até aqui.
				</p>
			) : (
				<div className="flex flex-col gap-3">
					<p className="text-sm font-semibold">
						{divergences.length === 1
							? "1 ocorrência para decidir"
							: `${divergences.length} ocorrências para decidir`}
					</p>
					{divergences.map((divergence) => (
						<OccurrenceCard
							key={divergence.itemId}
							divergence={divergence}
							draft={resolutionFor(divergence)}
							observation={lines[divergence.itemId]?.observation ?? null}
							onChange={(next) => onResolutionChange(divergence.itemId, next)}
						/>
					))}
				</div>
			)}
			{isLate && (
				<div className="bg-alert/40 flex flex-col gap-3 rounded-lg p-3.5">
					<b className="text-[15px]">
						Atraso de {lateFee.extraDailies}{" "}
						{lateFee.extraDailies === 1 ? "dia" : "dias"}
					</b>
					<MoneyField
						label="Valor do atraso"
						hint="Regra provisória: dias a mais × diárias da locação"
						field={plainField(lateAmount, setLateAmount)}
					/>
					<DecisionPicker
						label="o atraso"
						value={lateDecision}
						onChange={setLateDecision}
					/>
				</div>
			)}
			{inspection.itemKind === "UNIT" && (
				<RadioGroup
					aria-label="Como a unidade fica depois da inspeção"
					value={outcome}
					onValueChange={(value) => setOutcome(value as ReturnOutcome)}
				>
					{OUTCOMES.map((option) => (
						<label
							key={option.value}
							className="border-input bg-field has-data-checked:border-primary flex min-h-[52px] items-center gap-3 rounded-lg border-[1.5px] px-3.5 py-2 has-data-checked:border-2"
						>
							<RadioGroupItem value={option.value} />
							<span className="flex flex-col">
								<b className="text-[15px]">{option.label}</b>
								<span className="text-muted-foreground text-[13px]">
									{option.hint}
								</span>
							</span>
						</label>
					))}
				</RadioGroup>
			)}
			<Button
				size="lg"
				disabled={pending || busy || !readyItems}
				onClick={() =>
					onComplete({
						outcome,
						lateFee: isLate
							? { amountCents: lateAmount ?? 0, decision: lateDecision }
							: null,
					})
				}
			>
				{busy ? "Enviando arquivos…" : "Concluir volta"}
			</Button>
		</Card>
	);
}

export function ChecklistScreen({
	rentalNumber,
	unitCode,
	kind,
}: {
	rentalNumber: string;
	unitCode: string;
	kind: InspectionKind;
}) {
	const navigate = useNavigate();
	const inspection = useQuery(
		orpc.inspections.get.queryOptions({
			input: { rentalNumber, unitCode, kind },
		}),
	);
	const saveItem = useMutation(orpc.inspections.saveItem.mutationOptions());
	const attachMedia = useMutation(
		orpc.inspections.attachMedia.mutationOptions(),
	);
	const complete = useMutation(orpc.inspections.complete.mutationOptions());

	const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
	const [resolutions, setResolutions] = useState<
		Record<string, ResolutionDraft>
	>({});
	const [busySlots, setBusySlots] = useState<ChecklistMediaSlot[]>([]);
	const [submitError, setSubmitError] = useState<string | null>(null);

	if (inspection.isPending) return <ScreenSkeleton />;
	if (inspection.isError) {
		return (
			<ErrorState
				error={inspection.error}
				onRetry={() => inspection.refetch()}
			/>
		);
	}

	const { data } = inspection;
	const readOnly = data.completedAt !== null;
	const line = (item: InspectionItem): LineDraft =>
		drafts[item.id] ?? { answer: item.answer, observation: item.observation };
	const lines = Object.fromEntries(
		data.items.map((item) => [item.id, line(item)]),
	);

	const update = (item: InspectionItem, next: LineDraft) => {
		setDrafts((current) => ({ ...current, [item.id]: next }));
		saveItem.mutate({
			inspectionId: data.id,
			itemId: item.id,
			answer: next.answer,
			observation: next.observation,
		});
	};

	const items = data.items.map((item) => ({
		...item,
		answer: line(item).answer,
	}));
	const answered = items.filter((item) => item.answer !== null).length;
	const readyItems = isChecklistComplete(items);
	const divergences =
		kind === "RETURN"
			? detectDivergences(
					data.items.map((item) => ({ ...item, answer: item.checkoutAnswer })),
					items,
				)
			: [];

	const saveMedia = async (slot: ChecklistMediaSlot, file: FileRef) => {
		await attachMedia.mutateAsync({
			inspectionId: data.id,
			slot,
			fileKey: file.fileKey,
		});
		toast.success(`${CHECKLIST_MEDIA_LABELS[slot]} salvo.`);
	};

	const setSlotBusy = (slot: ChecklistMediaSlot, busy: boolean) => {
		setBusySlots((current) => {
			if (current.includes(slot) === busy) return current;
			return busy
				? [...current, slot]
				: current.filter((entry) => entry !== slot);
		});
	};

	const finish = async (values: {
		termSigned?: boolean;
		balance?: { amountCents: number; method: PaymentMethod } | null;
		deposit?: { amountCents: number; method: PaymentMethod } | null;
		outcome?: ReturnOutcome;
		lateFee?: { amountCents: number; decision: OccurrenceDecision } | null;
	}) => {
		setSubmitError(null);
		const occurrences: OccurrenceResolution[] = divergences.map(
			(divergence) => {
				const draft = resolutions[divergence.itemId];
				return {
					itemId: divergence.itemId,
					kind: draft?.kind ?? divergence.kind,
					description:
						lines[divergence.itemId]?.observation ?? divergence.label,
					amountCents:
						draft?.amountCents ??
						suggestOccurrenceAmount({ dailyPriceCents: data.dailyPriceCents }),
					decision: draft?.decision ?? "CHARGE",
				};
			},
		);
		try {
			await complete.mutateAsync({
				inspectionId: data.id,
				resolutions: occurrences,
				...values,
			});
			toast.success(
				kind === "CHECKOUT" ? "Saída concluída." : "Volta concluída.",
			);
			await navigate({
				to: "/locacoes/$numero",
				params: { numero: rentalNumber },
			});
		} catch (error) {
			if (isLocallyHandled(error)) setSubmitError(describeError(error));
		}
	};

	const stage = kind === "CHECKOUT" ? "Saída" : "Volta";
	const where = [data.customerName, data.siteCity].filter(Boolean).join(" em ");
	const description =
		kind === "CHECKOUT"
			? `${data.unitName} · entrega para ${where}`
			: `${data.unitName} · coleta com ${where}`;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				back={{
					to: "/locacoes/$numero",
					params: { numero: rentalNumber },
					label: rentalNumber,
				}}
				title={`${stage} · ${data.unitCode}`}
				titleAddon={<F2Badge />}
				description={description}
			/>

			{readOnly && (
				<Alert>
					<AlertDescription>
						{stage} concluída em {formatDateAndTime(data.completedAt ?? "")}.{" "}
						<Link
							to="/locacoes/$numero"
							params={{ numero: rentalNumber }}
							className="font-bold"
						>
							Voltar para a locação
						</Link>
					</AlertDescription>
				</Alert>
			)}

			<div className="flex flex-col gap-2">
				<span className="flex justify-between gap-3 text-[15px]">
					<b>
						{answered} de {items.length} itens conferidos
					</b>
					<span className="text-muted-foreground">
						mesmo checklist na volta
					</span>
				</span>
				<Progress
					aria-label="Itens conferidos"
					value={items.length === 0 ? 0 : (answered / items.length) * 100}
				/>
			</div>

			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
				<Card aria-labelledby="itens" className="gap-1 px-(--card-spacing)">
					<h2 id="itens" className="type-title mb-2 text-xl/6">
						Checklist · {data.typeName}
					</h2>
					{data.items.map((item) => (
						<ChecklistRow
							key={item.id}
							item={item}
							kind={kind}
							draft={line(item)}
							readOnly={readOnly}
							onAnswer={(answer) => update(item, { ...line(item), answer })}
							onObservation={(observation) =>
								update(item, { ...line(item), observation })
							}
						/>
					))}
				</Card>

				<div className="flex min-w-0 flex-col gap-6">
					<Card aria-labelledby="fotos" className="px-(--card-spacing)">
						<h2 id="fotos" className="type-title text-xl/6">
							Fotos e vídeo
						</h2>
						<div
							className={cn(
								"grid gap-2",
								kind === "RETURN" ? "grid-cols-2" : "grid-cols-3",
							)}
						>
							{data.media.map((media) => (
								<MediaSlot
									key={media.slot}
									inspection={data}
									media={media}
									onSaved={saveMedia}
									onBusyChange={setSlotBusy}
									readOnly={readOnly}
								/>
							))}
						</div>
						<p className="text-muted-foreground text-[13px]/[19px]">
							Mesmos ângulos da foto de entrada. Na volta, o sistema mostra as
							duas lado a lado.
						</p>
					</Card>

					{submitError && (
						<Alert variant="destructive">
							<AlertDescription>{submitError}</AlertDescription>
						</Alert>
					)}
					{!readOnly && !readyItems && (
						<p className="text-alert-foreground text-sm font-semibold">
							Responda todos os itens para concluir.
						</p>
					)}
					{!readOnly && kind === "CHECKOUT" && (
						<CheckoutPanel
							inspection={data}
							busy={busySlots.length > 0}
							readyItems={readyItems}
							pending={complete.isPending}
							onComplete={finish}
						/>
					)}
					{!readOnly && kind === "RETURN" && (
						<ReturnPanel
							inspection={data}
							divergences={divergences}
							lines={lines}
							resolutions={resolutions}
							onResolutionChange={(itemId, next) =>
								setResolutions((current) => ({ ...current, [itemId]: next }))
							}
							busy={busySlots.length > 0}
							readyItems={readyItems}
							pending={complete.isPending}
							onComplete={finish}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
