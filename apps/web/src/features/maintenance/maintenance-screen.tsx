import {
	type MaintenanceOrder,
	OpenMaintenanceInput,
} from "@marinho-gestao/contract";
import {
	addCalendarDays,
	calendarDay,
	type MaintenanceLocation,
	PAYMENT_METHODS,
	type PaymentMethod,
	type UnitStatus,
	zonedTimeToIso,
} from "@marinho-gestao/domain";
import { Alert, AlertDescription } from "@marinho-gestao/ui/components/alert";
import { Button, buttonVariants } from "@marinho-gestao/ui/components/button";
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
import {
	NativeSelect,
	NativeSelectOption,
} from "@marinho-gestao/ui/components/native-select";
import {
	RadioGroup,
	RadioGroupItem,
} from "@marinho-gestao/ui/components/radio-group";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { F2Badge } from "@/components/f2-badge";
import {
	DateTimeField,
	FieldShell,
	MoneyField,
	NullableTextField,
	SelectField,
	TextField,
} from "@/components/form/fields";
import { validateWith } from "@/components/form/validate";
import { KpiCard } from "@/components/kpi-card";
import { Money } from "@/components/money";
import {
	EmptyState,
	ErrorState,
	PageHeader,
	ScreenSkeleton,
} from "@/components/page";
import { StatusChip } from "@/components/status-chip";
import { ToDefine } from "@/components/to-define";
import { orpc } from "@/data/client";
import { useCan } from "@/features/auth/use-current-user";
import { describeError, isLocallyHandled } from "@/lib/errors";
import { formatDate, money } from "@/lib/format";
import {
	MAINTENANCE_LOCATION_LABELS,
	MAINTENANCE_STATUS_LABELS,
	PAYMENT_METHOD_LABELS,
	UNIT_STATUS_LABELS,
} from "@/lib/labels";

const OPENABLE_STATUSES: readonly UnitStatus[] = [
	"AVAILABLE",
	"IN_INSPECTION",
	"DAMAGED",
];

const STATUS_TONES = {
	IN_REPAIR: "alert",
	AWAITING_INSPECTION: "waiting",
	DONE: "available",
} as const;

function OpenOrderDialog({ onClose }: { onClose: () => void }) {
	const open = useMutation(orpc.maintenance.open.mutationOptions());
	const units = useQuery(orpc.equipment.listUnits.queryOptions({ input: {} }));
	const eligible = (units.data?.units ?? []).filter((unit) =>
		OPENABLE_STATUSES.includes(unit.status),
	);

	const form = useForm({
		defaultValues: {
			unitCode: "",
			reason: "",
			location: "WORKSHOP" as MaintenanceLocation,
			locationName: null as string | null,
			estimatedCostCents: null as number | null,
			expectedBackAt: zonedTimeToIso(
				addCalendarDays(calendarDay(new Date()), 3),
				"17:00",
			),
		},
		validators: { onSubmit: validateWith(OpenMaintenanceInput) },
		onSubmit: async ({ value }) => {
			const order = await open.mutateAsync(value);
			toast.success(`${order.number} aberta. A unidade saiu da agenda.`);
			onClose();
		},
	});

	return (
		<Dialog open onOpenChange={(next) => !next && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Abrir ordem de serviço</DialogTitle>
					<DialogDescription>
						A unidade passa para Em manutenção e sai da agenda até voltar.
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
						<form.Field name="unitCode">
							{(field) => (
								<SelectField<string>
									field={field}
									label="Unidade"
									placeholder="Escolha a unidade"
									options={eligible.map((unit) => ({
										value: unit.code,
										label: `${unit.code} · ${unit.shortName}`,
									}))}
								/>
							)}
						</form.Field>
						<form.Field name="reason">
							{(field) => <TextField field={field} label="Motivo" />}
						</form.Field>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="location">
								{(field) => (
									<SelectField<MaintenanceLocation>
										field={field}
										label="Onde"
										options={(["WORKSHOP", "BASE"] as const).map(
											(location) => ({
												value: location,
												label: MAINTENANCE_LOCATION_LABELS[location],
											}),
										)}
									/>
								)}
							</form.Field>
							<form.Field name="locationName">
								{(field) => (
									<NullableTextField
										field={field}
										label="Nome da assistência"
									/>
								)}
							</form.Field>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<form.Field name="estimatedCostCents">
								{(field) => <MoneyField field={field} label="Custo previsto" />}
							</form.Field>
							<form.Field name="expectedBackAt">
								{(field) => (
									<DateTimeField field={field} label="Previsão de volta" />
								)}
							</form.Field>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={onClose}>
								Cancelar
							</Button>
							<Button type="submit" disabled={open.isPending}>
								Abrir ordem
							</Button>
						</DialogFooter>
					</FieldGroup>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function CompleteOrderDialog({
	order,
	onClose,
}: {
	order: MaintenanceOrder;
	onClose: () => void;
}) {
	const complete = useMutation(orpc.maintenance.complete.mutationOptions());
	const inspection = order.status === "AWAITING_INSPECTION";
	const [cost, setCost] = useState<number | null>(
		order.estimatedCostCents ?? 0,
	);
	const [method, setMethod] = useState<PaymentMethod>("PIX");
	const [outcome, setOutcome] = useState<UnitStatus>(
		order.allowedOutcomes[0] ?? "AVAILABLE",
	);
	const [error, setError] = useState<string | null>(null);

	const remaining = Math.max(0, (cost ?? 0) - order.alreadyPostedCents);

	const submit = async () => {
		try {
			await complete.mutateAsync({
				number: order.number,
				finalCostCents: cost ?? 0,
				method,
				unitStatusAfter: outcome,
			});
			toast.success(`${order.number} concluída.`);
			onClose();
		} catch (mutationError) {
			if (isLocallyHandled(mutationError)) {
				setError(describeError(mutationError));
			}
		}
	};

	return (
		<Dialog open onOpenChange={(next) => !next && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{inspection ? "Fazer inspeção" : "Marcar como pronta"}
					</DialogTitle>
					<DialogDescription>
						{order.number} · {order.unitCode} · {order.reason}
					</DialogDescription>
				</DialogHeader>
				<MoneyField
					label="Custo final"
					hint={
						order.alreadyPostedCents > 0
							? `Já lançado no caixa: ${money(order.alreadyPostedCents)}`
							: undefined
					}
					field={{
						state: { value: cost, meta: { errors: [] } },
						handleChange: setCost,
						handleBlur: () => undefined,
					}}
				/>
				{remaining > 0 && (
					<>
						<FieldShell label="Forma de pagamento">
							{({ id }) => (
								<NativeSelect
									id={id}
									value={method}
									onChange={(event) =>
										setMethod(event.target.value as PaymentMethod)
									}
								>
									{PAYMENT_METHODS.map((option) => (
										<NativeSelectOption key={option} value={option}>
											{PAYMENT_METHOD_LABELS[option]}
										</NativeSelectOption>
									))}
								</NativeSelect>
							)}
						</FieldShell>
						<p className="text-muted-foreground text-sm">
							Vai lançar {money(remaining)} como despesa de manutenção no caixa.
						</p>
					</>
				)}
				<RadioGroup
					aria-label="Status da unidade depois"
					value={outcome}
					onValueChange={(value) => setOutcome(value as UnitStatus)}
				>
					{order.allowedOutcomes.map((status) => (
						<label
							key={status}
							className="border-input bg-field has-data-checked:border-primary flex min-h-11 items-center gap-3 rounded-lg border-[1.5px] px-3.5 text-[15px] font-semibold has-data-checked:border-2"
						>
							<RadioGroupItem value={status} />
							{UNIT_STATUS_LABELS[status]}
						</label>
					))}
				</RadioGroup>
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Cancelar
					</Button>
					<Button type="button" onClick={submit} disabled={complete.isPending}>
						Concluir ordem
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function OrderCard({
	order,
	onComplete,
}: {
	order: MaintenanceOrder;
	onComplete: () => void;
}) {
	const canWrite = useCan("maintenance:write");
	const dateByStatus = {
		IN_REPAIR: ["Volta", order.expectedBackAt],
		AWAITING_INSPECTION: ["Voltou", order.openedAt],
		DONE: ["Concluída", order.completedAt],
	} as const;
	const [dateLabel, date] = dateByStatus[order.status];
	const cost = order.finalCostCents ?? order.estimatedCostCents;

	return (
		<article className="bg-card flex flex-col gap-3 rounded-2xl p-4 md:p-5">
			<div className="flex items-center justify-between gap-2.5">
				<b className="text-muted-foreground text-sm">{order.number}</b>
				<StatusChip tone={STATUS_TONES[order.status]}>
					{MAINTENANCE_STATUS_LABELS[order.status]}
				</StatusChip>
			</div>
			<span className="flex flex-col gap-0.5">
				<Link
					to="/estoque/$codigo"
					params={{ codigo: order.unitCode }}
					className="flex min-h-11 items-center text-[17px]/[23px] font-bold"
				>
					{order.unitCode} · {order.unitName}
				</Link>
				<span className="text-[15px]">{order.reason}</span>
			</span>
			<dl className="grid grid-cols-3 gap-2.5 border-t pt-2.5">
				<div className="flex flex-col gap-0.5">
					<dt className="text-muted-foreground text-xs">Onde</dt>
					<dd className="text-sm font-bold">
						{order.location === "BASE"
							? MAINTENANCE_LOCATION_LABELS.BASE
							: (order.locationName ?? <ToDefine />)}
					</dd>
				</div>
				<div className="flex flex-col gap-0.5">
					<dt className="text-muted-foreground text-xs">Custo</dt>
					<dd className="text-sm font-bold">
						<Money cents={cost} />
					</dd>
				</div>
				<div className="flex flex-col gap-0.5">
					<dt className="text-muted-foreground text-xs">{dateLabel}</dt>
					<dd className="text-sm font-bold">
						{date ? formatDate(date) : <ToDefine />}
					</dd>
				</div>
			</dl>
			{order.status === "DONE" ? (
				<Link
					to="/estoque/$codigo"
					params={{ codigo: order.unitCode }}
					className={`${buttonVariants({ variant: "secondary" })} self-start`}
				>
					Ver detalhes
				</Link>
			) : (
				canWrite && (
					<Button
						variant="secondary"
						className="self-start"
						onClick={onComplete}
					>
						{order.status === "IN_REPAIR"
							? "Marcar como pronta"
							: "Fazer inspeção"}
					</Button>
				)
			)}
		</article>
	);
}

export function MaintenanceScreen() {
	const canWrite = useCan("maintenance:write");
	const [opening, setOpening] = useState(false);
	const [completing, setCompleting] = useState<MaintenanceOrder | null>(null);
	const list = useQuery(orpc.maintenance.list.queryOptions());

	if (list.isPending) return <ScreenSkeleton />;
	if (list.isError) {
		return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
	}

	const { data } = list;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Manutenção"
				titleAddon={<F2Badge />}
				description="Conserto e revisão. A unidade sai da agenda até voltar."
				actions={
					canWrite ? (
						<Button onClick={() => setOpening(true)}>
							<Plus aria-hidden strokeWidth={2.4} />
							Abrir ordem de serviço
						</Button>
					) : undefined
				}
			/>

			<div className="grid grid-cols-2 gap-4 md:grid-cols-3">
				<KpiCard label="Em conserto" value={data.inRepair} />
				<KpiCard label="Aguardando inspeção" value={data.awaitingInspection} />
				<KpiCard
					label="Gasto em 30 dias"
					value={money(data.spentLast30DaysCents)}
				/>
			</div>

			<section aria-labelledby="os" className="flex flex-col gap-3">
				<h2 id="os" className="type-title text-xl/6">
					Ordens de serviço
				</h2>
				{data.orders.length === 0 ? (
					<Card>
						<EmptyState
							icon={Wrench}
							title="Nenhuma ordem de serviço"
							description="Abra uma ordem quando um equipamento precisar de conserto ou revisão."
						/>
					</Card>
				) : (
					<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						{data.orders.map((order) => (
							<OrderCard
								key={order.id}
								order={order}
								onComplete={() => setCompleting(order)}
							/>
						))}
					</div>
				)}
			</section>

			<Card aria-labelledby="rev" className="gap-2.5 px-(--card-spacing)">
				<h2 id="rev" className="type-title text-xl/6">
					Revisões programadas
				</h2>
				<p className="text-[15px]/[22px]">
					Cada tipo de equipamento vai ganhar uma regra, por exemplo “revisar
					escovas a cada tantas locações”. O sistema avisa o pai quando chegar a
					hora.
				</p>
				<p className="text-muted-foreground text-sm">
					Regras por tipo: <ToDefine>definir com o pai</ToDefine>
				</p>
			</Card>

			{opening && <OpenOrderDialog onClose={() => setOpening(false)} />}
			{completing && (
				<CompleteOrderDialog
					order={completing}
					onClose={() => setCompleting(null)}
				/>
			)}
		</div>
	);
}
