import {
	CreateCustomerInput,
	type Customer,
	type CustomerDetail,
} from "@marinho-gestao/contract";
import {
	CUSTOMER_KINDS,
	CUSTOMER_ORIGINS,
	type CustomerKind,
	type CustomerOrigin,
} from "@marinho-gestao/domain";
import { Button } from "@marinho-gestao/ui/components/button";
import { Checkbox } from "@marinho-gestao/ui/components/checkbox";
import {
	Field,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@marinho-gestao/ui/components/field";
import {
	RadioGroup,
	RadioGroupItem,
} from "@marinho-gestao/ui/components/radio-group";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@marinho-gestao/ui/components/sheet";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	NullableTextField,
	SelectField,
	TextareaField,
	TextField,
} from "@/components/form/fields";
import { orpc } from "@/data/client";
import { CUSTOMER_KIND_LABELS, CUSTOMER_ORIGIN_LABELS } from "@/lib/labels";

function initialValues(customer: CustomerDetail | undefined) {
	return {
		kind: (customer?.kind ?? "PROFESSIONAL") as CustomerKind,
		name: customer?.name ?? "",
		taxId: customer?.taxId ?? null,
		responsible: customer?.responsible ?? null,
		authorizedReceivers: customer?.authorizedReceivers ?? [],
		whatsapp: customer?.whatsapp ?? "",
		alternatePhone: customer?.alternatePhone ?? null,
		address: customer?.address ?? null,
		neighborhood: customer?.neighborhood ?? null,
		city: customer?.city ?? "",
		occupation: customer?.occupation ?? null,
		origin: (customer?.origin ?? null) as CustomerOrigin | null,
		referredBy: customer?.referredBy ?? null,
		acceptsPromotions: customer?.acceptsPromotions ?? false,
		notes: customer?.notes ?? null,
	};
}

export function CustomerSheet({
	open,
	onOpenChange,
	customer,
	onSaved,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	customer?: CustomerDetail;
	onSaved?: (customer: Customer) => void;
}) {
	const create = useMutation(orpc.customers.create.mutationOptions());
	const update = useMutation(orpc.customers.update.mutationOptions());

	const form = useForm({
		defaultValues: initialValues(customer),
		validators: { onSubmit: CreateCustomerInput },
		onSubmit: async ({ value, formApi }) => {
			const saved = customer
				? await update.mutateAsync({ ...value, id: customer.id })
				: await create.mutateAsync(value);
			toast.success(customer ? "Cadastro atualizado." : "Cliente cadastrado.");
			if (!customer) formApi.reset();
			onSaved?.(saved);
			onOpenChange(false);
		},
	});

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>
						{customer ? `Editar ${customer.name}` : "Cadastrar cliente"}
					</SheetTitle>
					<SheetDescription>
						O endereço da obra fica na locação, não aqui.
					</SheetDescription>
				</SheetHeader>
				<form
					noValidate
					className="px-5 pb-6"
					onSubmit={(event) => {
						event.preventDefault();
						form.handleSubmit();
					}}
				>
					<FieldGroup>
						<form.Field name="kind">
							{(field) => (
								<FieldSet>
									<FieldLegend>Tipo de cliente</FieldLegend>
									<RadioGroup
										value={field.state.value}
										onValueChange={(value) =>
											field.handleChange(value as CustomerKind)
										}
									>
										{CUSTOMER_KINDS.map((kind) => (
											<label
												key={kind}
												className="border-input bg-field has-data-checked:border-primary flex min-h-11 items-center gap-3 rounded-lg border-[1.5px] px-3.5 text-[15px] font-semibold has-data-checked:border-2"
											>
												<RadioGroupItem value={kind} />
												{CUSTOMER_KIND_LABELS[kind]}
											</label>
										))}
									</RadioGroup>
								</FieldSet>
							)}
						</form.Field>
						<form.Field name="name">
							{(field) => (
								<TextField field={field} label="Nome ou razão social" />
							)}
						</form.Field>
						<form.Field name="taxId">
							{(field) => (
								<NullableTextField field={field} label="CPF ou CNPJ" />
							)}
						</form.Field>
						<form.Subscribe selector={(state) => state.values.kind}>
							{(kind) =>
								kind === "COMPANY" && (
									<>
										<form.Field name="responsible">
											{(field) => (
												<NullableTextField field={field} label="Responsável" />
											)}
										</form.Field>
										<form.Field name="authorizedReceivers">
											{(field) => (
												<TextField
													label="Pessoas autorizadas a receber"
													hint="Separe os nomes por vírgula."
													field={{
														state: {
															value: field.state.value.join(", "),
															meta: field.state.meta,
														},
														handleBlur: field.handleBlur,
														handleChange: (text: string) =>
															field.handleChange(
																text
																	.split(",")
																	.map((name) => name.trim())
																	.filter(Boolean),
															),
													}}
												/>
											)}
										</form.Field>
									</>
								)
							}
						</form.Subscribe>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="whatsapp">
								{(field) => (
									<TextField field={field} label="WhatsApp" inputMode="tel" />
								)}
							</form.Field>
							<form.Field name="alternatePhone">
								{(field) => (
									<NullableTextField
										field={field}
										label="Telefone alternativo"
										inputMode="tel"
									/>
								)}
							</form.Field>
						</div>
						<form.Field name="address">
							{(field) => <NullableTextField field={field} label="Endereço" />}
						</form.Field>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="neighborhood">
								{(field) => <NullableTextField field={field} label="Bairro" />}
							</form.Field>
							<form.Field name="city">
								{(field) => <TextField field={field} label="Cidade" />}
							</form.Field>
						</div>
						<form.Field name="occupation">
							{(field) => (
								<NullableTextField
									field={field}
									label="Profissão ou atividade"
								/>
							)}
						</form.Field>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="origin">
								{(field) => (
									<SelectField<CustomerOrigin>
										field={field}
										label="Chegou por"
										placeholder="Escolha"
										options={CUSTOMER_ORIGINS.map((origin) => ({
											value: origin,
											label: CUSTOMER_ORIGIN_LABELS[origin],
										}))}
									/>
								)}
							</form.Field>
							<form.Field name="referredBy">
								{(field) => (
									<NullableTextField field={field} label="Quem indicou" />
								)}
							</form.Field>
						</div>
						<form.Field name="acceptsPromotions">
							{(field) => (
								<Field orientation="horizontal" className="min-h-11">
									<Checkbox
										id={field.name}
										checked={field.state.value}
										onCheckedChange={(checked) => field.handleChange(checked)}
									/>
									<FieldLabel htmlFor={field.name} className="font-normal">
										Aceita receber mensagens promocionais
									</FieldLabel>
								</Field>
							)}
						</form.Field>
						<form.Field name="notes">
							{(field) => <TextareaField field={field} label="Observações" />}
						</form.Field>
						<form.Subscribe selector={(state) => state.isSubmitting}>
							{(isSubmitting) => (
								<Button type="submit" size="lg" disabled={isSubmitting}>
									{customer ? "Salvar cadastro" : "Salvar cliente"}
								</Button>
							)}
						</form.Subscribe>
					</FieldGroup>
				</form>
			</SheetContent>
		</Sheet>
	);
}
