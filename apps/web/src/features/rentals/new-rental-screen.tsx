import type {
	AvailabilityResult,
	ConflictingItem,
	Customer,
	Rental,
} from "@marinho-gestao/contract";
import { CreateQuoteInput } from "@marinho-gestao/contract";
import {
	addCalendarDays,
	calendarDay,
	countDailies,
	type DeliveryMode,
	type DocumentKind,
	type ItemKind,
	percentOfCents,
	quoteTotals,
	zonedTimeToIso,
} from "@marinho-gestao/domain";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@marinho-gestao/ui/components/alert";
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
	FieldError,
	FieldLegend,
	FieldSet,
} from "@marinho-gestao/ui/components/field";
import { Input } from "@marinho-gestao/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@marinho-gestao/ui/components/native-select";
import {
	RadioGroup,
	RadioGroupItem,
} from "@marinho-gestao/ui/components/radio-group";
import { Skeleton } from "@marinho-gestao/ui/components/skeleton";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
	DateTimeField,
	FieldShell,
	MoneyField,
	NullableTextField,
	TextareaField,
} from "@/components/form/fields";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page";
import { StatusChip } from "@/components/status-chip";
import { ToDefine } from "@/components/to-define";
import { orpc } from "@/data/client";
import { CustomerSheet } from "@/features/customers/customer-sheet";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { conflictData, describeError, isLocallyHandled } from "@/lib/errors";
import {
	dailiesLabel,
	formatDate,
	formatWeekdayName,
	initials,
	money,
} from "@/lib/format";
import { DELIVERY_MODE_LABELS } from "@/lib/labels";
import { useCopyQuoteText } from "./copy-quote";

export type NewRentalSearch = {
	item?: string;
	saida?: string;
	devolucao?: string;
	cliente?: string;
};

type ItemDraft = { kind: ItemKind; code: string; quantity: number };

const MISSING_DOCUMENT_TEXT: Record<DocumentKind, string> = {
	PHOTO_ID: "o documento com foto",
	TAX_ID: "o CPF ou CNPJ",
	PROOF_OF_ADDRESS: "o comprovante de endereço",
	OTHER: "outro documento",
};

function kindOfCode(code: string): ItemKind {
	return code.startsWith("MAR") ? "UNIT" : "LOT";
}

function defaultPeriod() {
	const tomorrow = addCalendarDays(calendarDay(new Date()), 1);
	return {
		start: zonedTimeToIso(tomorrow, "08:00"),
		end: zonedTimeToIso(addCalendarDays(tomorrow, 1), "17:00"),
	};
}

function Section({
	number,
	title,
	children,
}: {
	number: number;
	title: string;
	children: ReactNode;
}) {
	return (
		<Card
			aria-labelledby={`secao-${number}`}
			className="gap-3.5 px-(--card-spacing) md:[--card-spacing:--spacing(6)]"
		>
			<h2
				id={`secao-${number}`}
				className="type-title flex items-center gap-2.5 text-xl/6"
			>
				<span
					aria-hidden
					className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-lg text-[15px]"
				>
					{number}
				</span>
				{title}
			</h2>
			{children}
		</Card>
	);
}

function CustomerStep({
	customerId,
	onSelect,
	errors,
}: {
	customerId: string;
	onSelect: (id: string) => void;
	errors: readonly unknown[];
}) {
	const [text, setText] = useState("");
	const [sheetOpen, setSheetOpen] = useState(false);
	const debounced = useDebouncedValue(text);
	const results = useQuery(
		orpc.customers.list.queryOptions({
			input: { q: debounced },
			enabled: debounced.length > 0,
		}),
	);
	const selected = useQuery(
		orpc.customers.get.queryOptions({
			input: { id: customerId },
			enabled: customerId !== "",
		}),
	);
	const customer = selected.data;

	const choose = (next: Customer) => {
		onSelect(next.id);
		setText("");
	};

	return (
		<>
			<FieldShell label="Buscar por nome ou telefone" errors={errors}>
				{({ id, invalid, describedBy }) => (
					<Input
						id={id}
						type="search"
						value={text}
						onChange={(event) => setText(event.target.value)}
						aria-invalid={invalid}
						aria-describedby={describedBy}
					/>
				)}
			</FieldShell>
			{debounced && results.data && (
				<ul className="flex flex-col gap-1.5">
					{results.data.customers.slice(0, 5).map((option) => (
						<li key={option.id}>
							<button
								type="button"
								onClick={() => choose(option)}
								className="border-input bg-field flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border-[1.5px] px-3.5 py-2 text-left"
							>
								<span className="flex flex-col">
									<b className="text-[15px]">{option.name}</b>
									<span className="text-muted-foreground text-[13px]">
										{[option.occupation, option.city]
											.filter(Boolean)
											.join(" · ")}
									</span>
								</span>
								<StatusChip kind="customer" status={option.tier} size="sm" />
							</button>
						</li>
					))}
					{results.data.customers.length === 0 && (
						<li className="text-muted-foreground text-sm">
							Ninguém com esse nome. Cadastre abaixo.
						</li>
					)}
				</ul>
			)}
			{customer && (
				<div className="border-primary bg-field flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-lg border-2 px-4 py-3.5">
					<span
						aria-hidden
						className="bg-background flex size-11 flex-none items-center justify-center rounded-full font-extrabold"
					>
						{initials(customer.name)}
					</span>
					<span className="flex flex-[1_1_180px] flex-col gap-0.5">
						<b className="text-base">{customer.name}</b>
						<span className="text-muted-foreground text-sm">
							{[customer.occupation, customer.city].filter(Boolean).join(" · ")}
						</span>
					</span>
					<StatusChip kind="customer" status={customer.tier} />
				</div>
			)}
			{customer?.tier === "BLOCKED" && (
				<Alert variant="destructive">
					<AlertDescription>
						Cliente bloqueado
						{customer.blockReason ? `: ${customer.blockReason}` : ""}. Dá para
						salvar o rascunho, mas não enviar o orçamento.
					</AlertDescription>
				</Alert>
			)}
			{customer && customer.missingDocuments.length > 0 && (
				<Alert variant="destructive">
					<AlertDescription>
						{customer.stats.rentalCount === 0
							? "Primeira locação: falta"
							: "Falta"}{" "}
						receber{" "}
						{customer.missingDocuments
							.map((kind) => MISSING_DOCUMENT_TEXT[kind])
							.join(" e ")}{" "}
						antes da entrega.
					</AlertDescription>
				</Alert>
			)}
			<Button
				type="button"
				variant="link"
				className="self-start px-0"
				onClick={() => setSheetOpen(true)}
			>
				{customer ? "Cadastrar outro cliente" : "Cadastrar cliente novo"}
			</Button>
			<CustomerSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				onSaved={choose}
			/>
		</>
	);
}

function AddItemDialog({
	open,
	onOpenChange,
	start,
	end,
	validPeriod,
	onAdd,
	alreadyAdded,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	start: string;
	end: string;
	validPeriod: boolean;
	onAdd: (item: ItemDraft) => void;
	alreadyAdded: string[];
}) {
	const [text, setText] = useState("");
	const debounced = useDebouncedValue(text);
	const results = useQuery(
		orpc.availability.search.queryOptions({
			input: { query: debounced, start, end },
			enabled: open && validPeriod,
		}),
	);

	const rows = (results.data?.results ?? []).filter(
		(result) => !alreadyAdded.includes(result.code),
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Adicionar equipamento</DialogTitle>
					<DialogDescription>
						Mostra o que está livre no período escolhido.
					</DialogDescription>
				</DialogHeader>
				<FieldShell label="Código, nome ou apelido">
					{({ id }) => (
						<Input
							id={id}
							type="search"
							value={text}
							onChange={(event) => setText(event.target.value)}
						/>
					)}
				</FieldShell>
				{results.isPending && <Skeleton className="h-24 rounded-lg" />}
				<ul className="flex max-h-[45dvh] flex-col gap-1.5 overflow-y-auto">
					{rows.map((result) => {
						const unpriced = result.dailyPriceCents === null;
						const blocked = !result.available || unpriced;
						return (
							<li key={result.code}>
								<button
									type="button"
									disabled={blocked}
									onClick={() => {
										onAdd({
											kind: result.kind,
											code: result.code,
											quantity: 1,
										});
										onOpenChange(false);
									}}
									className="border-input bg-field disabled:border-border disabled:bg-muted flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border-[1.5px] px-3.5 py-2 text-left disabled:cursor-not-allowed"
								>
									<span className="flex min-w-0 flex-col">
										<b className="text-[15px]">
											{result.kind === "UNIT"
												? `${result.code} · ${result.name}`
												: result.name}
										</b>
										<span className="text-muted-foreground text-[13px]">
											{unpriced
												? "Sem preço: cadastre a diária em Configurações"
												: result.available
													? result.perPiece
														? `${result.freeQuantity} de ${result.totalQuantity} peças livres`
														: "Livre no período"
													: result.freeFrom
														? `Livre a partir de ${formatDate(result.freeFrom)}`
														: "Indisponível no período"}
										</span>
									</span>
									<b className="flex-none text-sm">
										<Money cents={result.dailyPriceCents} />
									</b>
								</button>
							</li>
						);
					})}
				</ul>
			</DialogContent>
		</Dialog>
	);
}

function ItemRow({
	item,
	info,
	dailies,
	conflict,
	alternatives,
	onRemove,
	onQuantity,
	onSwap,
}: {
	item: ItemDraft;
	info: AvailabilityResult | undefined;
	dailies: number;
	conflict: ConflictingItem | undefined;
	alternatives: AvailabilityResult[];
	onRemove: () => void;
	onQuantity: (quantity: number) => void;
	onSwap: (code: string) => void;
}) {
	const price = info?.dailyPriceCents ?? null;
	const name =
		info?.kind === "LOT"
			? info.perPiece
				? `${info.name} · ${item.quantity} peças`
				: info.name
			: `${item.code} · ${info?.name ?? ""}`;
	const subtotal = price === null ? null : price * item.quantity * dailies;
	const freeLabel = (() => {
		if (!info) return "Conferindo a agenda…";
		if (info.perPiece) {
			return `Livres no período: ${info.freeQuantity} das ${info.totalQuantity} peças`;
		}
		return info.available ? "Livre no período" : "Ocupado no período";
	})();
	const short =
		conflict !== undefined ||
		(info !== undefined &&
			(!info.available ||
				(info.freeQuantity !== null && item.quantity > info.freeQuantity)));

	return (
		<div
			className={cn(
				"flex flex-col gap-2.5 border-t py-3.5",
				conflict && "border-destructive bg-alert/40 rounded-lg border-2 px-3",
			)}
		>
			<div className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
				<span className="flex min-w-0 flex-[1_1_240px] flex-col gap-1">
					<b className="text-base/[22px]">{name}</b>
					<span
						className={cn(
							"text-sm font-semibold",
							short ? "text-destructive" : "text-positive",
						)}
					>
						{freeLabel}
					</span>
				</span>
				{info?.perPiece && (
					<FieldShell label="Peças" className="w-24 flex-none">
						{({ id }) => (
							<Input
								id={id}
								type="number"
								inputMode="numeric"
								min={1}
								max={info.totalQuantity ?? undefined}
								value={item.quantity}
								onChange={(event) =>
									onQuantity(Math.max(1, Number(event.target.value) || 1))
								}
							/>
						)}
					</FieldShell>
				)}
				<span className="flex min-w-[150px] flex-none flex-col gap-0.5">
					<span className="text-muted-foreground text-sm">
						{price === null
							? "Sem preço"
							: info?.perPiece
								? `${money(price)} × ${item.quantity} peças × ${dailiesLabel(dailies)}`
								: `${money(price)} × ${dailiesLabel(dailies)}`}
					</span>
					<b className="text-base">
						<Money cents={subtotal} />
					</b>
				</span>
				<span className="text-muted-foreground flex-none text-sm">
					Caução{" "}
					<b className="text-foreground">
						<Money cents={info?.depositCents} />
					</b>
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="border-input"
					aria-label={`Tirar ${name}`}
					onClick={onRemove}
				>
					<X aria-hidden />
				</Button>
			</div>
			{conflict && alternatives.length > 0 && (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<span className="text-destructive font-semibold">Livres agora:</span>
					{alternatives.map((option) => (
						<Button
							key={option.code}
							type="button"
							variant="secondary"
							size="xs"
							onClick={() => onSwap(option.code)}
						>
							Trocar por {option.code}
						</Button>
					))}
				</div>
			)}
			{conflict && alternatives.length === 0 && (
				<p className="text-destructive text-sm font-semibold">
					{conflict.freeFrom
						? `Sem outra unidade livre. Esta fica livre a partir de ${formatDate(conflict.freeFrom)}.`
						: "Sem outra unidade livre neste período."}
				</p>
			)}
		</div>
	);
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className="border-navy-soft flex justify-between gap-4 border-b py-2.5 text-[15px]">
			<dt className="text-on-navy-muted">{label}</dt>
			<dd className="text-right font-bold">{value}</dd>
		</div>
	);
}

const onNavyPending = <ToDefine className="text-on-navy" />;

function SentDialog({
	rental,
	onViewRental,
}: {
	rental: Rental | null;
	onViewRental: (number: string) => void;
}) {
	const copy = useCopyQuoteText();
	return (
		<Dialog open={rental !== null}>
			<DialogContent showCloseButton={false}>
				<DialogHeader>
					<DialogTitle>Orçamento {rental?.number} enviado</DialogTitle>
					<DialogDescription>
						As unidades ficam seguras até o prazo do sinal. Copie o texto e cole
						na conversa do cliente.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						disabled={copy.isPending}
						onClick={() => rental && copy.mutate({ number: rental.number })}
					>
						Copiar texto do orçamento
					</Button>
					<Button
						type="button"
						onClick={() => rental && onViewRental(rental.number)}
					>
						Ver locação
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function NewRentalScreen({ search }: { search: NewRentalSearch }) {
	const navigate = useNavigate();
	const period = defaultPeriod();
	const createQuote = useMutation(orpc.rentals.createQuote.mutationOptions());
	const settings = useQuery(orpc.settings.get.queryOptions());
	const [dialogOpen, setDialogOpen] = useState(false);
	const [conflicts, setConflicts] = useState<ConflictingItem[]>([]);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [sent, setSent] = useState<Rental | null>(null);
	const itemsRef = useRef<HTMLDivElement>(null);

	const form = useForm({
		defaultValues: {
			customerId: search.cliente ?? "",
			startAt: search.saida ?? period.start,
			endAt: search.devolucao ?? period.end,
			items: (search.item
				? [{ kind: kindOfCode(search.item), code: search.item, quantity: 1 }]
				: []) as ItemDraft[],
			deliveryMode: "DELIVERY" as DeliveryMode,
			siteAddress: null as string | null,
			siteCity: null as string | null,
			sitePinUrl: null as string | null,
			deliveryFeeCents: null as number | null,
			discountCents: 0 as number | null,
			notes: null as string | null,
			send: false,
		},
		onSubmitMeta: { send: false },
		onSubmit: async ({ value, meta }) => {
			setSubmitError(null);
			setConflicts([]);
			const parsed = CreateQuoteInput.safeParse({
				...value,
				discountCents: value.discountCents ?? 0,
				send: meta.send,
			});
			if (!parsed.success) {
				setSubmitError(
					parsed.error.issues[0]?.message ?? "Confira os dados do orçamento.",
				);
				return;
			}
			try {
				const rental = await createQuote.mutateAsync(parsed.data);
				if (meta.send) {
					setSent(rental);
				} else {
					toast.success(`Rascunho ${rental.number} salvo.`);
					await navigate({
						to: "/locacoes/$numero",
						params: { numero: rental.number },
					});
				}
			} catch (error) {
				const conflict = conflictData(error);
				if (conflict) {
					setConflicts(conflict.conflicts);
					setSubmitError(describeError(error));
					itemsRef.current?.scrollIntoView({
						behavior: "smooth",
						block: "center",
					});
				} else if (isLocallyHandled(error)) {
					setSubmitError(describeError(error));
				}
			}
		},
	});

	const values = useStore(form.store, (state) => state.values);
	const { startAt, endAt, items, deliveryMode, siteCity } = values;
	const validPeriod = Date.parse(startAt) < Date.parse(endAt);
	const dailies = validPeriod ? countDailies(startAt, endAt) : 0;

	const availability = useQuery(
		orpc.availability.search.queryOptions({
			input: { start: startAt, end: endAt },
			enabled: validPeriod,
		}),
	);
	const byCode = new Map(
		(availability.data?.results ?? []).map((result) => [result.code, result]),
	);

	const cityFee = settings.data?.deliveryFees.find(
		(entry) => entry.city === siteCity,
	);
	useEffect(() => {
		if (cityFee?.feeCents != null) {
			form.setFieldValue("deliveryFeeCents", cityFee.feeCents);
		}
	}, [cityFee?.feeCents, form]);

	const deliveryFee = deliveryMode === "PICKUP" ? 0 : values.deliveryFeeCents;
	const totals = quoteTotals({
		items: items.map((item) => {
			const info = byCode.get(item.code);
			return {
				dailyPriceCents: info?.dailyPriceCents ?? null,
				depositCents: info?.depositCents ?? null,
				dailies,
				pieces: item.quantity,
			};
		}),
		deliveryFeeCents: deliveryFee,
		discountCents: values.discountCents ?? 0,
	});

	const signal = settings.data?.signal;
	const signalCents = (() => {
		if (signal?.mode === "FIXED") return signal.valueCents;
		if (signal?.mode === "PERCENT" && signal.percent !== null) {
			return percentOfCents(totals.totalCents, signal.percent);
		}
		return null;
	})();

	const swapItem = (code: string, next: string) => {
		form.setFieldValue(
			"items",
			items.map((item) =>
				item.code === code ? { ...item, code: next } : item,
			),
		);
		setConflicts((current) => current.filter((entry) => entry.code !== code));
		setSubmitError(null);
	};

	const summaryName = (item: ItemDraft) => {
		const info = byCode.get(item.code);
		if (!info) return item.code;
		return info.perPiece ? `${info.name}, ${item.quantity} peças` : info.name;
	};

	const hasPendingFee = deliveryMode === "DELIVERY" && deliveryFee === null;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				back={{ to: "/locacoes", label: "Locações" }}
				title="Nova locação"
				description="Monte o orçamento. Depois de enviado, as unidades ficam seguras por 24 horas."
			/>

			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
				<form
					aria-label="Orçamento"
					noValidate
					className="flex min-w-0 flex-col gap-5"
					onSubmit={(event) => event.preventDefault()}
				>
					<Section number={1} title="Cliente">
						<form.Field name="customerId">
							{(field) => (
								<CustomerStep
									customerId={field.state.value}
									onSelect={field.handleChange}
									errors={field.state.meta.errors}
								/>
							)}
						</form.Field>
					</Section>

					<Section number={2} title="Período">
						<div className="grid gap-4 md:grid-cols-2">
							<form.Field name="startAt">
								{(field) => <DateTimeField field={field} label="Saída" />}
							</form.Field>
							<form.Field name="endAt">
								{(field) => <DateTimeField field={field} label="Devolução" />}
							</form.Field>
						</div>
						{validPeriod ? (
							<p className="text-[15px]">
								<b>{dailiesLabel(dailies)}</b>{" "}
								<span className="text-muted-foreground">
									· {formatWeekdayName(startAt)} a {formatWeekdayName(endAt)}
								</span>
							</p>
						) : (
							<FieldError>A devolução precisa ser depois da saída.</FieldError>
						)}
					</Section>

					<div ref={itemsRef}>
						<Section number={3} title="Equipamentos">
							{items.length === 0 && (
								<p className="text-muted-foreground text-[15px]">
									Nenhum equipamento ainda. Adicione o que o cliente pediu.
								</p>
							)}
							{items.map((item) => {
								const conflict = conflicts.find(
									(entry) => entry.code === item.code,
								);
								const info = byCode.get(item.code);
								const alternatives = (availability.data?.results ?? []).filter(
									(result) =>
										result.available &&
										result.code !== item.code &&
										result.typeId !== null &&
										result.typeId === info?.typeId &&
										!items.some((entry) => entry.code === result.code),
								);
								return (
									<ItemRow
										key={item.code}
										item={item}
										info={info}
										dailies={dailies}
										conflict={conflict}
										alternatives={alternatives}
										onRemove={() =>
											form.setFieldValue(
												"items",
												items.filter((entry) => entry.code !== item.code),
											)
										}
										onQuantity={(quantity) =>
											form.setFieldValue(
												"items",
												items.map((entry) =>
													entry.code === item.code
														? { ...entry, quantity }
														: entry,
												),
											)
										}
										onSwap={(code) => swapItem(item.code, code)}
									/>
								);
							})}
							<Button
								type="button"
								variant="dashed"
								className="self-start"
								onClick={() => setDialogOpen(true)}
							>
								<Plus aria-hidden strokeWidth={2.4} />
								Adicionar equipamento
							</Button>
							<AddItemDialog
								open={dialogOpen}
								onOpenChange={setDialogOpen}
								start={startAt}
								end={endAt}
								validPeriod={validPeriod}
								alreadyAdded={items.map((item) => item.code)}
								onAdd={(item) => form.setFieldValue("items", [...items, item])}
							/>
						</Section>
					</div>

					<Section number={4} title="Entrega">
						<form.Field name="deliveryMode">
							{(field) => (
								<FieldSet>
									<FieldLegend>Como o equipamento chega</FieldLegend>
									<RadioGroup
										className="md:grid-cols-2"
										value={field.state.value}
										onValueChange={(value) =>
											field.handleChange(value as DeliveryMode)
										}
									>
										{(["DELIVERY", "PICKUP"] as const).map((mode) => (
											<label
												key={mode}
												className="border-input bg-field has-data-checked:border-primary flex min-h-[52px] items-center gap-3 rounded-lg border-[1.5px] px-4 text-[15px] font-semibold has-data-checked:border-2"
											>
												<RadioGroupItem value={mode} />
												{DELIVERY_MODE_LABELS[mode]}
											</label>
										))}
									</RadioGroup>
								</FieldSet>
							)}
						</form.Field>
						{deliveryMode === "DELIVERY" && (
							<>
								<div className="grid gap-4 md:grid-cols-2">
									<form.Field name="siteAddress">
										{(field) => (
											<NullableTextField
												field={field}
												label="Endereço da obra"
											/>
										)}
									</form.Field>
									<form.Field name="siteCity">
										{(field) => (
											<FieldShell label="Município">
												{({ id }) => (
													<NativeSelect
														id={id}
														value={field.state.value ?? ""}
														onChange={(event) =>
															field.handleChange(event.target.value || null)
														}
													>
														<NativeSelectOption value="">
															Escolha
														</NativeSelectOption>
														{settings.data?.deliveryFees.map((entry) => (
															<NativeSelectOption
																key={entry.city}
																value={entry.city}
															>
																{entry.city}
															</NativeSelectOption>
														))}
													</NativeSelect>
												)}
											</FieldShell>
										)}
									</form.Field>
								</div>
								<form.Field name="sitePinUrl">
									{(field) => (
										<NullableTextField
											field={field}
											label="Localização (link do pino)"
											type="url"
											placeholder="Cole o link que o cliente mandou"
										/>
									)}
								</form.Field>
								{siteCity && cityFee?.feeCents != null ? (
									<p className="text-muted-foreground text-sm">
										Taxa de entrega para {siteCity}:{" "}
										<b className="text-foreground">{money(cityFee.feeCents)}</b>
									</p>
								) : (
									<form.Field name="deliveryFeeCents">
										{(field) => (
											<MoneyField
												field={field}
												label={
													siteCity
														? `Taxa de entrega para ${siteCity}`
														: "Taxa de entrega"
												}
												hint="Sem tabela para este município: digite o valor combinado."
												className="max-w-xs"
											/>
										)}
									</form.Field>
								)}
							</>
						)}
					</Section>

					<Section number={5} title="Observações">
						<form.Field name="notes">
							{(field) => (
								<TextareaField
									field={field}
									label="Para quem entrega e para o termo"
									rows={3}
								/>
							)}
						</form.Field>
						<form.Field name="discountCents">
							{(field) => (
								<MoneyField
									field={field}
									label="Desconto"
									className="max-w-xs"
								/>
							)}
						</form.Field>
					</Section>
				</form>

				<aside
					aria-labelledby="resumo"
					className="on-navy bg-primary text-on-navy flex flex-col gap-3.5 rounded-2xl p-4 md:p-6 xl:sticky xl:top-6"
				>
					<h2 id="resumo" className="type-title text-[22px]/[26px]">
						Resumo
					</h2>
					<dl className="flex flex-col">
						{items.map((item, index) => (
							<SummaryRow
								key={item.code}
								label={summaryName(item)}
								value={
									totals.lines[index]?.subtotalCents === null ||
									totals.lines[index] === undefined
										? onNavyPending
										: money(totals.lines[index].subtotalCents ?? 0)
								}
							/>
						))}
						<SummaryRow
							label="Entrega e coleta"
							value={deliveryFee === null ? onNavyPending : money(deliveryFee)}
						/>
						<SummaryRow
							label="Desconto"
							value={money(values.discountCents ?? 0)}
						/>
					</dl>
					<div className="flex items-baseline justify-between gap-4">
						<span className="text-base font-bold">Total</span>
						<span className="type-title text-[28px] normal-case">
							{money(totals.totalCents)}
							{hasPendingFee && " + taxa"}
						</span>
					</div>
					<div className="bg-navy-soft flex flex-col gap-2 rounded-lg p-3.5 text-sm/5">
						<span className="flex justify-between gap-3">
							<span className="text-on-navy-muted">Sinal para reservar</span>
							<b>{signalCents === null ? onNavyPending : money(signalCents)}</b>
						</span>
						<span className="flex justify-between gap-3">
							<span className="text-on-navy-muted">
								Caução, devolvida depois
							</span>
							<b>
								{totals.depositTotalCents === null
									? onNavyPending
									: money(totals.depositTotalCents)}
							</b>
						</span>
					</div>
					{submitError && (
						<Alert variant="destructive">
							<TriangleAlert aria-hidden />
							<AlertTitle>Não deu para salvar</AlertTitle>
							<AlertDescription>{submitError}</AlertDescription>
						</Alert>
					)}
					<Button
						type="button"
						variant="highlight"
						size="lg"
						disabled={createQuote.isPending}
						onClick={() => form.handleSubmit({ send: true })}
					>
						Salvar e enviar orçamento
					</Button>
					<Button
						type="button"
						variant="on-navy"
						disabled={createQuote.isPending}
						onClick={() => form.handleSubmit({ send: false })}
					>
						Salvar rascunho
					</Button>
					<p className="text-on-navy-muted text-[13px]/[19px]">
						O preço fica congelado quando o sinal entra. Sem sinal em 24 horas,
						a agenda libera as unidades.
					</p>
				</aside>
			</div>

			<SentDialog
				rental={sent}
				onViewRental={(number) =>
					navigate({ to: "/locacoes/$numero", params: { numero: number } })
				}
			/>
		</div>
	);
}
