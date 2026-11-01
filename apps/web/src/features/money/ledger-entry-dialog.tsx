import { CreateLedgerEntryInput, type FileRef } from "@marinho-gestao/contract";
import {
	calendarDay,
	LEDGER_IN_CATEGORIES,
	LEDGER_OUT_CATEGORIES,
	type LedgerCategory,
	type LedgerDirection,
	PAYMENT_METHODS,
	type PaymentMethod,
	zonedTimeToIso,
} from "@marinho-gestao/domain";
import { Button } from "@marinho-gestao/ui/components/button";
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
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	FieldShell,
	MoneyField,
	SelectField,
	TextField,
} from "@/components/form/fields";
import { validateWith } from "@/components/form/validate";
import { UploadSlot } from "@/components/upload-slot";
import { orpc } from "@/data/client";
import { LEDGER_CATEGORY_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";

const COPY: Record<LedgerDirection, { title: string; description: string }> = {
	IN: {
		title: "Nova entrada",
		description: "Dinheiro que entrou no caixa.",
	},
	OUT: {
		title: "Nova despesa",
		description: "Dinheiro que saiu do caixa.",
	},
};

export function LedgerEntryDialog({
	direction,
	onClose,
}: {
	direction: LedgerDirection;
	onClose: () => void;
}) {
	const create = useMutation(orpc.ledger.create.mutationOptions());
	const rentals = useQuery(
		orpc.rentals.list.queryOptions({ input: { tab: "OPEN" } }),
	);
	const units = useQuery(orpc.equipment.listUnits.queryOptions({ input: {} }));
	const [receipt, setReceipt] = useState<FileRef | null>(null);
	const [uploading, setUploading] = useState(false);

	const categories: readonly LedgerCategory[] =
		direction === "IN" ? LEDGER_IN_CATEGORIES : LEDGER_OUT_CATEGORIES;

	const form = useForm({
		defaultValues: {
			direction,
			category: categories[0] as LedgerCategory,
			amountCents: null as number | null,
			occurredAt: zonedTimeToIso(calendarDay(new Date()), "12:00"),
			method: "PIX" as PaymentMethod,
			description: "",
			rentalNumber: null as string | null,
			unitCode: null as string | null,
			receiptFileKey: null as string | null,
		},
		validators: { onSubmit: validateWith(CreateLedgerEntryInput) },
		onSubmit: async ({ value }) => {
			await create.mutateAsync(CreateLedgerEntryInput.parse(value));
			toast.success(
				direction === "IN" ? "Entrada lançada." : "Despesa lançada.",
			);
			onClose();
		},
	});

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{COPY[direction].title}</DialogTitle>
					<DialogDescription>{COPY[direction].description}</DialogDescription>
				</DialogHeader>
				<form
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						form.handleSubmit();
					}}
				>
					<FieldGroup>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="amountCents">
								{(field) => <MoneyField field={field} label="Valor" />}
							</form.Field>
							<form.Field name="occurredAt">
								{(field) => (
									<FieldShell label="Data" errors={field.state.meta.errors}>
										{({ id }) => (
											<Input
												id={id}
												type="date"
												value={calendarDay(field.state.value)}
												onChange={(event) =>
													event.target.value &&
													field.handleChange(
														zonedTimeToIso(event.target.value, "12:00"),
													)
												}
											/>
										)}
									</FieldShell>
								)}
							</form.Field>
						</div>
						<form.Field name="description">
							{(field) => <TextField field={field} label="Descrição" />}
						</form.Field>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="category">
								{(field) => (
									<SelectField<LedgerCategory>
										field={field}
										label="Categoria"
										options={categories.map((category) => ({
											value: category,
											label: LEDGER_CATEGORY_LABELS[category],
										}))}
									/>
								)}
							</form.Field>
							<form.Field name="method">
								{(field) => (
									<SelectField<PaymentMethod>
										field={field}
										label="Forma"
										options={PAYMENT_METHODS.map((method) => ({
											value: method,
											label: PAYMENT_METHOD_LABELS[method],
										}))}
									/>
								)}
							</form.Field>
						</div>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="rentalNumber">
								{(field) => (
									<SelectField<string>
										field={field}
										label="Locação (opcional)"
										placeholder="Nenhuma"
										options={(rentals.data?.rentals ?? []).map((rental) => ({
											value: rental.number,
											label: `${rental.number} · ${rental.customerName}`,
										}))}
									/>
								)}
							</form.Field>
							<form.Field name="unitCode">
								{(field) => (
									<SelectField<string>
										field={field}
										label="Equipamento (opcional)"
										placeholder="Nenhum"
										options={(units.data?.units ?? []).map((unit) => ({
											value: unit.code,
											label: `${unit.code} · ${unit.shortName}`,
										}))}
									/>
								)}
							</form.Field>
						</div>
						<div className="flex items-center gap-3">
							<UploadSlot
								purpose="RECEIPT"
								label="Comprovante"
								file={receipt}
								className="size-24 flex-none"
								onBusyChange={setUploading}
								onUploaded={(file) => {
									setReceipt(file);
									form.setFieldValue("receiptFileKey", file.fileKey);
								}}
							/>
							<span className="text-muted-foreground text-sm">
								Comprovante opcional, foto ou PDF.
							</span>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={onClose}>
								Cancelar
							</Button>
							<form.Subscribe selector={(state) => state.isSubmitting}>
								{(isSubmitting) => (
									<Button type="submit" disabled={isSubmitting || uploading}>
										{direction === "IN" ? "Lançar entrada" : "Lançar despesa"}
									</Button>
								)}
							</form.Subscribe>
						</DialogFooter>
					</FieldGroup>
				</form>
			</DialogContent>
		</Dialog>
	);
}
