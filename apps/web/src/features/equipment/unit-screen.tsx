import type { UnitDetail } from "@marinho-gestao/contract";
import {
	UNIT_PHOTO_SLOTS,
	type UnitPhotoSlot,
	type UnitStatus,
	unitStatusMachine,
} from "@marinho-gestao/domain";
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
import {
	RadioGroup,
	RadioGroupItem,
} from "@marinho-gestao/ui/components/radio-group";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@marinho-gestao/ui/components/sheet";
import { Textarea } from "@marinho-gestao/ui/components/textarea";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { F2Badge } from "@/components/f2-badge";
import { FilePreview } from "@/components/file-preview";
import {
	FieldShell,
	MoneyField,
	NullableTextField,
} from "@/components/form/fields";
import { Money } from "@/components/money";
import { ErrorState, PageHeader, ScreenSkeleton } from "@/components/page";
import { StatusChip } from "@/components/status-chip";
import { ToDefine } from "@/components/to-define";
import { UploadSlot } from "@/components/upload-slot";
import { orpc } from "@/data/client";
import { useCan } from "@/features/auth/use-current-user";
import { describeError } from "@/lib/errors";
import { formatDate, formatPeriod, money, relativeDay } from "@/lib/format";
import { UNIT_PHOTO_SLOT_LABELS, UNIT_STATUS_LABELS } from "@/lib/labels";
import { locationText } from "./unit-location";

function lowerFirst(text: string): string {
	return text.charAt(0).toLowerCase() + text.slice(1);
}

function Row({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex justify-between gap-4 border-t py-2.5 text-[15px]">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="text-right font-bold">{children}</dd>
		</div>
	);
}

function photoOf(unit: UnitDetail, slot: UnitPhotoSlot) {
	return unit.photos.find((photo) => photo.slot === slot)?.file ?? null;
}

function PhotosCard({ unit }: { unit: UnitDetail }) {
	const canOperate = useCan("units:operate");
	const addPhoto = useMutation(orpc.equipment.addUnitPhoto.mutationOptions());

	const save = (slot: UnitPhotoSlot) => async (file: { fileKey: string }) => {
		await addPhoto.mutateAsync({
			code: unit.code,
			slot,
			fileKey: file.fileKey,
		});
		toast.success("Foto salva.");
	};

	const [main, ...others] = UNIT_PHOTO_SLOTS;

	return (
		<Card aria-label="Fotos da unidade" className="px-(--card-spacing)">
			{canOperate ? (
				<UploadSlot
					purpose="UNIT_PHOTO"
					label={UNIT_PHOTO_SLOT_LABELS[main]}
					file={photoOf(unit, main)}
					onUploaded={save(main)}
					className="bg-background aspect-4/3 w-full rounded-xl text-sm"
				/>
			) : (
				<StaticPhoto
					file={photoOf(unit, main)}
					label={UNIT_PHOTO_SLOT_LABELS[main]}
					className="aspect-4/3 rounded-xl"
				/>
			)}
			<div className="grid grid-cols-4 gap-2">
				{others.map((slot) =>
					canOperate ? (
						<UploadSlot
							key={slot}
							purpose="UNIT_PHOTO"
							label={UNIT_PHOTO_SLOT_LABELS[slot]}
							file={photoOf(unit, slot)}
							onUploaded={save(slot)}
							className="bg-background"
						/>
					) : (
						<StaticPhoto
							key={slot}
							file={photoOf(unit, slot)}
							label={UNIT_PHOTO_SLOT_LABELS[slot]}
							className="aspect-square rounded-lg"
						/>
					),
				)}
			</div>
		</Card>
	);
}

function StaticPhoto({
	file,
	label,
	className,
}: {
	file: UnitDetail["photos"][number]["file"] | null;
	label: string;
	className?: string;
}) {
	if (file) {
		return (
			<FilePreview
				fileKey={file.fileKey}
				contentType={file.contentType}
				alt={label}
				className={className}
			/>
		);
	}
	return (
		<div
			className={`border-line-strong bg-background text-muted-foreground flex items-center justify-center border border-dashed p-2 text-center text-xs ${className}`}
		>
			{label}
		</div>
	);
}

function FichaCard({ unit }: { unit: UnitDetail }) {
	return (
		<Card className="gap-1.5 px-(--card-spacing)">
			<h2 className="text-title mb-2 text-xl/6">Ficha</h2>
			<dl className="flex flex-col">
				<Row label="Tipo">{unit.typeName}</Row>
				<Row label="Diária">
					<Money cents={unit.dailyPriceCents} />
				</Row>
				<Row label="Caução">
					<Money cents={unit.depositCents} />
				</Row>
				<Row label="Voltagem">
					{unit.voltage ?? <ToDefine>conferir</ToDefine>}
				</Row>
				<Row label="Nº de série">{unit.serialNumber ?? <ToDefine />}</Row>
				<Row label="Acessórios">
					{[unit.notes, unit.accessories].filter(Boolean).join(" · ") || (
						<ToDefine />
					)}
				</Row>
				<Row label="Dono">{unit.owner ?? <ToDefine />}</Row>
				<Row label="Etiqueta aplicada">{unit.labelApplied ? "Sim" : "Não"}</Row>
			</dl>
		</Card>
	);
}

function EarningsSection({ unit }: { unit: UnitDetail }) {
	const { stats, purchaseValueCents } = unit;
	const numbers = [
		["Locações", String(stats.rentalCount)],
		["Dias alugados", String(stats.rentedDays)],
		["Receita", money(stats.revenueCents)],
		["Manutenção", money(stats.maintenanceCents)],
	];
	const paidPercent =
		purchaseValueCents && purchaseValueCents > 0
			? Math.min(
					100,
					Math.round(
						((stats.revenueCents - stats.maintenanceCents) /
							purchaseValueCents) *
							100,
					),
				)
			: null;

	return (
		<section aria-labelledby="rendeu" className="flex flex-col gap-3">
			<div className="flex items-center gap-2.5">
				<h2 id="rendeu" className="text-title text-xl/6">
					Quanto rendeu
				</h2>
				<F2Badge />
			</div>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{numbers.map(([label, value]) => (
					<div
						key={label}
						className="bg-card flex flex-col gap-1 rounded-xl p-4"
					>
						<span className="text-muted-foreground text-[13px]">{label}</span>
						<b className="text-condensed text-2xl/7">{value}</b>
					</div>
				))}
			</div>
			<div className="bg-card flex flex-col gap-2 rounded-xl p-4">
				<span className="flex justify-between gap-3 text-sm">
					<span className="text-muted-foreground">
						Já pagou do valor de compra
					</span>
					<b>{paidPercent === null ? <ToDefine /> : `${paidPercent}%`}</b>
				</span>
				<span
					aria-hidden
					className="bg-muted flex h-2.5 overflow-hidden rounded-[5px]"
				>
					<span
						className="bg-bar-available"
						style={{ width: `${paidPercent ?? 0}%` }}
					/>
				</span>
				{paidPercent === null && (
					<span className="text-muted-foreground text-[13px]">
						Aparece quando o valor de compra for cadastrado.
					</span>
				)}
			</div>
		</section>
	);
}

function RentalsCard({ unit, now }: { unit: UnitDetail; now: Date }) {
	return (
		<Card className="gap-1 px-(--card-spacing)">
			<h2 className="text-title mb-2 text-xl/6">Locações desta unidade</h2>
			{unit.rentals.length === 0 && (
				<p className="text-muted-foreground border-t py-3">
					Esta unidade ainda não saiu em nenhuma locação.
				</p>
			)}
			{unit.rentals.map((rental) => {
				const leavesToday = relativeDay(rental.startAt, now) === "hoje";
				return (
					<Link
						key={rental.number}
						to="/locacoes/$numero"
						params={{ numero: rental.number }}
						className="flex min-h-[52px] flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t py-2.5"
					>
						<b className="w-[84px] flex-none text-sm">{rental.number}</b>
						<span className="flex flex-[1_1_160px] flex-col">
							<span className="text-[15px] font-semibold">
								{rental.customerName}
							</span>
							<span className="text-muted-foreground text-[13px]">
								{formatPeriod(rental.startAt, rental.endAt)}
								{leavesToday ? " · sai hoje" : ""}
							</span>
						</span>
						<b className="text-[15px]">{money(rental.valueCents)}</b>
					</Link>
				);
			})}
		</Card>
	);
}

function DamageDialog({
	code,
	open,
	onOpenChange,
}: {
	code: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const addDamage = useMutation(
		orpc.equipment.addKnownDamage.mutationOptions(),
	);
	const [description, setDescription] = useState("");
	const [fileKey, setFileKey] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (description.trim().length < 3) {
			setError("Descreva o dano.");
			return;
		}
		await addDamage.mutateAsync({ code, description, fileKey });
		toast.success("Dano registrado.");
		setDescription("");
		setFileKey(null);
		setError(null);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Registrar dano</DialogTitle>
					<DialogDescription>
						Dano que a unidade já tem. Não se cobra do cliente e aparece no
						checklist.
					</DialogDescription>
				</DialogHeader>
				<FieldShell label="O que tem" errors={error ? [error] : []}>
					{({ id, invalid, describedBy }) => (
						<Textarea
							id={id}
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							aria-invalid={invalid}
							aria-describedby={describedBy}
						/>
					)}
				</FieldShell>
				<UploadSlot
					purpose="DAMAGE_PHOTO"
					label="Foto do dano"
					file={null}
					onUploaded={(file) => {
						setFileKey(file.fileKey);
						toast.success("Foto enviada.");
					}}
					onBusyChange={setUploading}
					className="size-24"
				/>
				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						type="button"
					>
						Cancelar
					</Button>
					<Button
						onClick={submit}
						disabled={addDamage.isPending || uploading}
						type="button"
					>
						Salvar dano
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DamagesCard({ unit }: { unit: UnitDetail }) {
	const canOperate = useCan("units:operate");
	const [dialogOpen, setDialogOpen] = useState(false);

	return (
		<Card className="gap-2.5 px-(--card-spacing)">
			<h2 className="text-title text-xl/6">Danos que já tinha</h2>
			{unit.knownDamages.length === 0 && (
				<p className="text-muted-foreground">Nenhum dano registrado.</p>
			)}
			{unit.knownDamages.map((damage) => (
				<div key={damage.id} className="flex items-center gap-3">
					{damage.photo ? (
						<FilePreview
							fileKey={damage.photo.fileKey}
							contentType={damage.photo.contentType}
							alt={damage.description}
							className="size-14 flex-none rounded-lg"
						/>
					) : (
						<span className="border-line-strong bg-background text-muted-foreground flex size-14 flex-none items-center justify-center rounded-lg border border-dashed text-center text-[11px]">
							sem foto
						</span>
					)}
					<span className="flex flex-col">
						<b className="text-[15px]">{damage.description}</b>
						<span className="text-muted-foreground text-[13px]">
							Registrado em {formatDate(damage.recordedAt)} · não se cobra do
							cliente
						</span>
					</span>
				</div>
			))}
			{canOperate && (
				<>
					<Button
						variant="secondary"
						className="self-start"
						onClick={() => setDialogOpen(true)}
					>
						Registrar dano
					</Button>
					<DamageDialog
						code={unit.code}
						open={dialogOpen}
						onOpenChange={setDialogOpen}
					/>
				</>
			)}
		</Card>
	);
}

function ChangeStatusDialog({
	unit,
	open,
	onOpenChange,
}: {
	unit: UnitDetail;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const changeStatus = useMutation(
		orpc.equipment.changeUnitStatus.mutationOptions(),
	);
	const [to, setTo] = useState<UnitStatus | null>(null);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);

	const needsReason = to !== null && unitStatusMachine.requiresReason(to);

	const submit = async () => {
		if (!to) {
			setError("Escolha o novo status.");
			return;
		}
		if (needsReason && !reason.trim()) {
			setError("Informe o motivo.");
			return;
		}
		try {
			await changeStatus.mutateAsync({ code: unit.code, to, reason });
			toast.success(`${unit.code}: ${UNIT_STATUS_LABELS[to]}.`);
			setTo(null);
			setReason("");
			setError(null);
			onOpenChange(false);
		} catch (mutationError) {
			setError(describeError(mutationError));
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Mudar status</DialogTitle>
					<DialogDescription>
						Agora: {UNIT_STATUS_LABELS[unit.status]}. Só aparecem as mudanças
						permitidas.
					</DialogDescription>
				</DialogHeader>
				{unit.allowedTransitions.length === 0 ? (
					<p>Esta unidade saiu do estoque e não muda mais de status.</p>
				) : (
					<RadioGroup
						aria-label="Novo status"
						value={to}
						onValueChange={(value) => setTo(value as UnitStatus)}
					>
						{unit.allowedTransitions.map((status) => (
							<label
								key={status}
								className="border-input bg-field has-data-checked:border-primary flex min-h-11 items-center gap-3 rounded-lg border-[1.5px] px-3.5 text-[15px] font-semibold has-data-checked:border-2"
							>
								<RadioGroupItem value={status} />
								{UNIT_STATUS_LABELS[status]}
							</label>
						))}
					</RadioGroup>
				)}
				{to && (
					<FieldShell label={needsReason ? "Motivo" : "Motivo (opcional)"}>
						{({ id }) => (
							<Textarea
								id={id}
								value={reason}
								onChange={(event) => setReason(event.target.value)}
							/>
						)}
					</FieldShell>
				)}
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={submit}
						disabled={changeStatus.isPending}
					>
						Salvar status
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EditUnitSheet({
	unit,
	open,
	onOpenChange,
}: {
	unit: UnitDetail;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const updateUnit = useMutation(orpc.equipment.updateUnit.mutationOptions());

	const form = useForm({
		defaultValues: {
			voltage: unit.voltage,
			serialNumber: unit.serialNumber,
			accessories: unit.accessories,
			owner: unit.owner,
			notes: unit.notes,
			dailyPriceCents: unit.dailyPriceCents,
			depositCents: unit.depositCents,
			purchaseValueCents: unit.purchaseValueCents,
			replacementValueCents: unit.replacementValueCents,
		},
		onSubmit: async ({ value }) => {
			await updateUnit.mutateAsync({ code: unit.code, ...value });
			toast.success("Ficha atualizada.");
			onOpenChange(false);
		},
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>Editar {unit.code}</SheetTitle>
				</SheetHeader>
				<form
					className="px-5 pb-6"
					onSubmit={(event) => {
						event.preventDefault();
						form.handleSubmit();
					}}
				>
					<FieldGroup>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="dailyPriceCents">
								{(field) => (
									<MoneyField
										field={field}
										label="Diária do tipo"
										hint={`Vale para todo o tipo ${unit.typeName}`}
									/>
								)}
							</form.Field>
							<form.Field name="depositCents">
								{(field) => <MoneyField field={field} label="Caução do tipo" />}
							</form.Field>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="voltage">
								{(field) => (
									<NullableTextField field={field} label="Voltagem" />
								)}
							</form.Field>
							<form.Field name="serialNumber">
								{(field) => (
									<NullableTextField field={field} label="Nº de série" />
								)}
							</form.Field>
						</div>
						<form.Field name="accessories">
							{(field) => (
								<NullableTextField field={field} label="Acessórios" />
							)}
						</form.Field>
						<form.Field name="owner">
							{(field) => <NullableTextField field={field} label="Dono" />}
						</form.Field>
						<form.Field name="notes">
							{(field) => (
								<NullableTextField field={field} label="Observações" />
							)}
						</form.Field>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="purchaseValueCents">
								{(field) => (
									<MoneyField field={field} label="Valor de compra" />
								)}
							</form.Field>
							<form.Field name="replacementValueCents">
								{(field) => (
									<MoneyField field={field} label="Valor de reposição" />
								)}
							</form.Field>
						</div>
						<Button type="submit" size="lg" disabled={updateUnit.isPending}>
							Salvar ficha
						</Button>
					</FieldGroup>
				</form>
			</SheetContent>
		</Sheet>
	);
}

export function UnitScreen({ code }: { code: string }) {
	const canOperate = useCan("units:operate");
	const canManage = useCan("catalog:manage");
	const [statusOpen, setStatusOpen] = useState(false);
	const [editOpen, setEditOpen] = useState(false);
	const unit = useQuery(
		orpc.equipment.getUnit.queryOptions({ input: { code } }),
	);
	const now = new Date();

	if (unit.isPending) return <ScreenSkeleton />;
	if (unit.isError) {
		return <ErrorState error={unit.error} onRetry={() => unit.refetch()} />;
	}

	const { data } = unit;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				back={{ to: "/estoque", label: "Estoque" }}
				title={data.code}
				titleAddon={<StatusChip kind="unit" status={data.status} size="lg" />}
				description={`${data.name} · ${lowerFirst(locationText(data.location, now))}`}
				actions={
					<>
						{canOperate && (
							<Button variant="outline" onClick={() => setStatusOpen(true)}>
								Mudar status
							</Button>
						)}
						{canManage && (
							<Button variant="outline" onClick={() => setEditOpen(true)}>
								Editar
							</Button>
						)}
					</>
				}
			/>

			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
				<div className="flex min-w-0 flex-col gap-6">
					<PhotosCard unit={data} />
					<FichaCard unit={data} />
				</div>
				<div className="flex min-w-0 flex-col gap-6">
					<EarningsSection unit={data} />
					<RentalsCard unit={data} now={now} />
					<DamagesCard unit={data} />
				</div>
			</div>

			{canOperate && (
				<ChangeStatusDialog
					unit={data}
					open={statusOpen}
					onOpenChange={setStatusOpen}
				/>
			)}
			{canManage && editOpen && (
				<EditUnitSheet unit={data} open={editOpen} onOpenChange={setEditOpen} />
			)}
		</div>
	);
}
