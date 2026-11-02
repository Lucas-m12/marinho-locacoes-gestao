import {
	CreateUserInput,
	type DeliveryFee,
	type Settings,
	type SignalRule,
	type User,
} from "@marinho-gestao/contract";
import { ROLES, type Role } from "@marinho-gestao/domain";
import { Alert, AlertDescription } from "@marinho-gestao/ui/components/alert";
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
import { FieldGroup } from "@marinho-gestao/ui/components/field";
import { Input } from "@marinho-gestao/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@marinho-gestao/ui/components/native-select";
import {
	RadioGroup,
	RadioGroupItem,
} from "@marinho-gestao/ui/components/radio-group";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@marinho-gestao/ui/components/tabs";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
	FieldShell,
	MoneyField,
	SelectField,
	TextField,
} from "@/components/form/fields";
import { validateWith } from "@/components/form/validate";
import { ErrorState, PageHeader, ScreenSkeleton } from "@/components/page";
import { orpc } from "@/data/client";
import { canRestoreSampleData, restoreSampleData } from "@/data/demo";
import { invalidateEverything } from "@/data/invalidation";
import { describeError, isLocallyHandled } from "@/lib/errors";
import { ROLE_LABELS } from "@/lib/labels";

export const SettingsSearch = z.object({
	aba: z.enum(["precos", "entrega", "regras", "pessoas"]).optional(),
});
export type SettingsSearch = z.infer<typeof SettingsSearch>;

type Tab = NonNullable<SettingsSearch["aba"]>;

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

type PriceRow = {
	key: string;
	name: string;
	detail: string;
	dailyPriceCents: number | null;
	depositCents: number | null;
};

function PricesPanel({ settings }: { settings: Settings }) {
	const update = useMutation(orpc.settings.update.mutationOptions());
	const [rows, setRows] = useState<PriceRow[]>([
		...settings.types.map((type) => ({
			key: type.typeId,
			name: type.name,
			detail: type.codes.join(", "),
			dailyPriceCents: type.dailyPriceCents,
			depositCents: type.depositCents,
		})),
		...settings.lots.map((lot) => ({
			key: lot.lotId,
			name: lot.name,
			detail: lot.perPiece ? "por peça" : "por lote",
			dailyPriceCents: lot.dailyPriceCents,
			depositCents: lot.depositCents,
		})),
	]);

	const change = (key: string, patch: Partial<PriceRow>) =>
		setRows((current) =>
			current.map((row) => (row.key === key ? { ...row, ...patch } : row)),
		);

	const prices = ({ key, dailyPriceCents, depositCents }: PriceRow) => ({
		key,
		dailyPriceCents,
		depositCents,
	});

	const save = async () => {
		const isLot = (key: string) =>
			settings.lots.some((lot) => lot.lotId === key);
		await update.mutateAsync({
			types: rows
				.filter((row) => !isLot(row.key))
				.map(prices)
				.map(({ key, ...row }) => ({ typeId: key, ...row })),
			lots: rows
				.filter((row) => isLot(row.key))
				.map(prices)
				.map(({ key, ...row }) => ({ lotId: key, ...row })),
		});
		toast.success("Preços salvos. Locações com sinal não mudam.");
	};

	return (
		<Card className="gap-0 px-(--card-spacing)">
			<h2 className="type-title text-xl/6">Preços e cauções por tipo</h2>
			<p className="text-muted-foreground pt-1 pb-3 text-sm/5">
				Campo em branco fica “a definir”. Tipo sem diária não entra em
				orçamento. Caução em branco é digitada na entrega.
			</p>
			{rows.map((row) => (
				<div
					key={row.key}
					className="grid items-center gap-x-4 gap-y-2 border-t py-3 md:grid-cols-[minmax(0,1fr)_160px_160px]"
				>
					<span className="flex min-w-0 flex-col">
						<b className="text-[15px]">{row.name}</b>
						<span className="text-muted-foreground text-[13px]">
							{row.detail}
						</span>
					</span>
					<MoneyField
						label="Diária"
						placeholder="a definir"
						field={plainField(row.dailyPriceCents, (dailyPriceCents) =>
							change(row.key, { dailyPriceCents }),
						)}
					/>
					<MoneyField
						label="Caução"
						placeholder="a definir"
						field={plainField(row.depositCents, (depositCents) =>
							change(row.key, { depositCents }),
						)}
					/>
				</div>
			))}
			<Button
				className="mt-3 self-start"
				disabled={update.isPending}
				onClick={save}
			>
				Salvar preços
			</Button>
		</Card>
	);
}

function DeliveryPanel({ settings }: { settings: Settings }) {
	const update = useMutation(orpc.settings.update.mutationOptions());
	const [fees, setFees] = useState<DeliveryFee[]>(settings.deliveryFees);

	return (
		<Card className="gap-0 px-(--card-spacing)">
			<h2 className="type-title text-xl/6">Taxa de entrega por município</h2>
			<p className="text-muted-foreground pt-1 pb-3 text-sm/5">
				Campo em branco fica “a definir” e o valor é digitado no orçamento.
			</p>
			<div className="grid gap-x-6 md:grid-cols-2">
				{fees.map((fee) => (
					<div
						key={fee.city}
						className="flex items-center justify-between gap-4 border-t py-2.5"
					>
						<b className="text-[15px]">{fee.city}</b>
						<MoneyField
							label={<span className="sr-only">Taxa para {fee.city}</span>}
							placeholder="a definir"
							className="w-40 flex-none"
							field={plainField(fee.feeCents, (feeCents) =>
								setFees((current) =>
									current.map((entry) =>
										entry.city === fee.city ? { ...entry, feeCents } : entry,
									),
								),
							)}
						/>
					</div>
				))}
			</div>
			<Button
				className="mt-3 self-start"
				disabled={update.isPending}
				onClick={async () => {
					await update.mutateAsync({ deliveryFees: fees });
					toast.success("Taxas salvas.");
				}}
			>
				Salvar taxas
			</Button>
		</Card>
	);
}

type SignalMode = "NONE" | "FIXED" | "PERCENT";

function RulesPanel({ settings }: { settings: Settings }) {
	const update = useMutation(orpc.settings.update.mutationOptions());
	const [mode, setMode] = useState<SignalMode>(settings.signal.mode ?? "NONE");
	const [valueCents, setValueCents] = useState(settings.signal.valueCents);
	const [percent, setPercent] = useState(settings.signal.percent);
	const [deadline, setDeadline] = useState(settings.signalDeadlineHours);
	const [turnarounds, setTurnarounds] = useState(
		Object.fromEntries([
			...settings.types.map((type) => [type.typeId, type.turnaroundHours]),
			...settings.lots.map((lot) => [lot.lotId, lot.turnaroundHours]),
		] as [string, number][]),
	);
	const rows = [
		...settings.types.map((type) => ({ id: type.typeId, name: type.name })),
		...settings.lots.map((lot) => ({ id: lot.lotId, name: lot.name })),
	];

	const save = async () => {
		const signal: SignalRule = {
			mode: mode === "NONE" ? null : mode,
			valueCents: mode === "FIXED" ? valueCents : null,
			percent: mode === "PERCENT" ? percent : null,
		};
		await update.mutateAsync({
			signal,
			signalDeadlineHours: deadline,
			types: settings.types.map((type) => ({
				typeId: type.typeId,
				turnaroundHours: turnarounds[type.typeId],
			})),
			lots: settings.lots.map((lot) => ({
				lotId: lot.lotId,
				turnaroundHours: turnarounds[lot.lotId],
			})),
		});
		toast.success("Regras salvas.");
	};

	return (
		<div className="flex flex-col gap-5">
			<Card className="px-(--card-spacing)">
				<h2 className="type-title text-xl/6">Sinal</h2>
				<RadioGroup
					aria-label="Como calcular o sinal"
					className="md:grid-cols-3"
					value={mode}
					onValueChange={(value) => setMode(value as SignalMode)}
				>
					{(
						[
							["NONE", "A definir"],
							["FIXED", "Valor fixo"],
							["PERCENT", "Percentual do total"],
						] as const
					).map(([value, label]) => (
						<label
							key={value}
							className="border-input bg-field has-data-checked:border-primary flex min-h-11 items-center gap-3 rounded-lg border-[1.5px] px-3.5 text-[15px] font-semibold has-data-checked:border-2"
						>
							<RadioGroupItem value={value} />
							{label}
						</label>
					))}
				</RadioGroup>
				<div className="grid gap-4 md:grid-cols-2">
					{mode === "FIXED" && (
						<MoneyField
							label="Valor do sinal"
							field={plainField(valueCents, setValueCents)}
						/>
					)}
					{mode === "PERCENT" && (
						<FieldShell label="Percentual">
							{({ id }) => (
								<Input
									id={id}
									type="number"
									inputMode="decimal"
									min={0}
									max={100}
									value={percent ?? ""}
									onChange={(event) =>
										setPercent(
											event.target.value === ""
												? null
												: Number(event.target.value),
										)
									}
								/>
							)}
						</FieldShell>
					)}
					<FieldShell
						label="Prazo do sinal, em horas"
						hint="Depois disso, o orçamento expira e libera a agenda."
					>
						{({ id, describedBy }) => (
							<Input
								id={id}
								type="number"
								inputMode="numeric"
								min={1}
								value={deadline}
								aria-describedby={describedBy}
								onChange={(event) =>
									setDeadline(Math.max(1, Number(event.target.value) || 1))
								}
							/>
						)}
					</FieldShell>
				</div>
			</Card>

			<Card className="gap-0 px-(--card-spacing)">
				<h2 className="type-title text-xl/6">Folga entre locações</h2>
				<p className="text-muted-foreground pt-1 pb-3 text-sm/5">
					Horas para conferir e limpar antes de a unidade sair de novo.
				</p>
				<div className="grid gap-x-6 md:grid-cols-2">
					{rows.map((row) => (
						<div
							key={row.id}
							className="flex items-center justify-between gap-4 border-t py-2"
						>
							<span className="text-[15px] font-semibold">{row.name}</span>
							<FieldShell
								label={<span className="sr-only">Folga de {row.name}</span>}
								className="w-24 flex-none"
							>
								{({ id }) => (
									<Input
										id={id}
										type="number"
										inputMode="numeric"
										min={0}
										value={turnarounds[row.id] ?? 0}
										onChange={(event) =>
											setTurnarounds((current) => ({
												...current,
												[row.id]: Math.max(0, Number(event.target.value) || 0),
											}))
										}
									/>
								)}
							</FieldShell>
						</div>
					))}
				</div>
			</Card>

			<Card className="gap-2.5 px-(--card-spacing)">
				<h2 className="type-title text-xl/6">Regras provisórias</h2>
				<Alert variant="destructive">
					<AlertDescription>
						Estas regras ainda vão ser decididas pelo negócio e não podem ser
						editadas aqui.
					</AlertDescription>
				</Alert>
				<p className="text-[15px]/[22px]">
					<b>Diárias:</b> {settings.dailiesRuleDescription}
				</p>
				<p className="text-[15px]/[22px]">
					<b>Atraso:</b> {settings.lateFeeRuleDescription}
				</p>
			</Card>

			<Button className="self-start" disabled={update.isPending} onClick={save}>
				Salvar regras
			</Button>
		</div>
	);
}

function NewUserDialog({ onClose }: { onClose: () => void }) {
	const create = useMutation(orpc.users.create.mutationOptions());
	const [error, setError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			role: "ATTENDANT" as Role,
			password: "",
		},
		validators: { onSubmit: validateWith(CreateUserInput) },
		onSubmit: async ({ value }) => {
			try {
				await create.mutateAsync(value);
				toast.success("Acesso criado.");
				onClose();
			} catch (mutationError) {
				if (isLocallyHandled(mutationError)) {
					setError(describeError(mutationError));
				}
			}
		},
	});

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Nova pessoa</DialogTitle>
					<DialogDescription>
						Não há cadastro público: só a gestão cria acessos.
					</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						form.handleSubmit();
					}}
				>
					<FieldGroup>
						<form.Field name="name">
							{(field) => <TextField field={field} label="Nome" />}
						</form.Field>
						<form.Field name="email">
							{(field) => (
								<TextField
									field={field}
									label="E-mail"
									type="email"
									autoComplete="off"
								/>
							)}
						</form.Field>
						<form.Field name="role">
							{(field) => (
								<SelectField<Role>
									field={field}
									label="Papel"
									options={ROLES.map((role) => ({
										value: role,
										label: ROLE_LABELS[role],
									}))}
								/>
							)}
						</form.Field>
						<form.Field name="password">
							{(field) => (
								<TextField
									field={field}
									label="Senha inicial"
									type="password"
									autoComplete="new-password"
								/>
							)}
						</form.Field>
						{error && (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={onClose}>
								Cancelar
							</Button>
							<Button type="submit" disabled={create.isPending}>
								Criar acesso
							</Button>
						</DialogFooter>
					</FieldGroup>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function UserRow({ user }: { user: User }) {
	const update = useMutation(orpc.users.update.mutationOptions());
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t py-3">
			<span className="flex min-w-0 flex-col">
				<b className="text-[15px]">{user.name}</b>
				<span className="text-muted-foreground text-sm">{user.email}</span>
			</span>
			<FieldShell
				label={<span className="sr-only">Papel de {user.name}</span>}
				className="w-48 flex-none"
			>
				{({ id }) => (
					<NativeSelect
						id={id}
						value={user.role}
						disabled={update.isPending}
						onChange={async (event) => {
							await update.mutateAsync({
								id: user.id,
								role: event.target.value as Role,
							});
							toast.success(`Papel de ${user.name} atualizado.`);
						}}
					>
						{ROLES.map((role) => (
							<NativeSelectOption key={role} value={role}>
								{ROLE_LABELS[role]}
							</NativeSelectOption>
						))}
					</NativeSelect>
				)}
			</FieldShell>
		</div>
	);
}

function PeoplePanel() {
	const users = useQuery(orpc.users.list.queryOptions());
	const [creating, setCreating] = useState(false);

	if (users.isPending) return <ScreenSkeleton />;
	if (users.isError) {
		return <ErrorState error={users.error} onRetry={() => users.refetch()} />;
	}

	return (
		<Card className="gap-0 px-(--card-spacing)">
			<div className="flex flex-wrap items-center justify-between gap-3 pb-3">
				<h2 className="type-title text-xl/6">Pessoas e acessos</h2>
				<Button variant="secondary" onClick={() => setCreating(true)}>
					<Plus aria-hidden strokeWidth={2.4} />
					Nova pessoa
				</Button>
			</div>
			{users.data.map((user) => (
				<UserRow key={user.id} user={user} />
			))}
			{creating && <NewUserDialog onClose={() => setCreating(false)} />}
		</Card>
	);
}

function SampleDataCard() {
	const queryClient = useQueryClient();
	const [confirming, setConfirming] = useState(false);

	return (
		<Card className="gap-2.5 px-(--card-spacing)">
			<h2 className="type-title text-xl/6">Dados de exemplo</h2>
			<p className="text-muted-foreground text-sm/5">
				Só nesta demonstração: volta tudo para a semana de exemplo, com as datas
				relativas a hoje. O que foi cadastrado aqui se perde.
			</p>
			<Button
				variant="destructive"
				className="self-start"
				onClick={() => setConfirming(true)}
			>
				Restaurar dados de exemplo
			</Button>
			<Dialog open={confirming} onOpenChange={setConfirming}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Restaurar dados de exemplo?</DialogTitle>
						<DialogDescription>
							Tudo o que foi feito nesta demonstração será apagado.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setConfirming(false)}
						>
							Voltar
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={async () => {
								await restoreSampleData();
								await invalidateEverything(queryClient);
								setConfirming(false);
								toast.success("Dados de exemplo restaurados.");
							}}
						>
							Restaurar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}

export function SettingsScreen({
	search,
	onSearchChange,
}: {
	search: SettingsSearch;
	onSearchChange: (next: SettingsSearch) => void;
}) {
	const tab: Tab = search.aba ?? "precos";
	const settings = useQuery(orpc.settings.get.queryOptions());

	if (settings.isPending) return <ScreenSkeleton />;
	if (settings.isError) {
		return (
			<ErrorState error={settings.error} onRetry={() => settings.refetch()} />
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Configurações"
				description="Preços, entrega, regras e quem acessa o sistema."
			/>
			<Tabs
				value={tab}
				onValueChange={(value) => onSearchChange({ aba: value as Tab })}
			>
				<TabsList aria-label="Configurações">
					<TabsTrigger value="precos">Preços</TabsTrigger>
					<TabsTrigger value="entrega">Entrega</TabsTrigger>
					<TabsTrigger value="regras">Regras</TabsTrigger>
					<TabsTrigger value="pessoas">Pessoas</TabsTrigger>
				</TabsList>
				<TabsContent value="precos">
					<PricesPanel settings={settings.data} />
				</TabsContent>
				<TabsContent value="entrega">
					<DeliveryPanel settings={settings.data} />
				</TabsContent>
				<TabsContent value="regras">
					<RulesPanel settings={settings.data} />
				</TabsContent>
				<TabsContent value="pessoas">
					<PeoplePanel />
				</TabsContent>
			</Tabs>
			{canRestoreSampleData && <SampleDataCard />}
		</div>
	);
}
