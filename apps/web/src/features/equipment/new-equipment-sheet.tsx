import { CreateTypeInput, CreateUnitInput } from "@marinho-gestao/contract";
import { Button } from "@marinho-gestao/ui/components/button";
import { Checkbox } from "@marinho-gestao/ui/components/checkbox";
import {
	Field,
	FieldGroup,
	FieldLabel,
} from "@marinho-gestao/ui/components/field";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@marinho-gestao/ui/components/sheet";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@marinho-gestao/ui/components/tabs";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	MoneyField,
	NullableTextField,
	SelectField,
	TextField,
} from "@/components/form/fields";
import { orpc } from "@/data/client";
import { describeError } from "@/lib/errors";

type Tab = "unit" | "type";

function NewTypeForm({ onCreated }: { onCreated: (typeId: string) => void }) {
	const createType = useMutation(orpc.equipment.createType.mutationOptions());

	const form = useForm({
		defaultValues: {
			name: "",
			nicknames: [] as string[],
			description: null as string | null,
			dailyPriceCents: null as number | null,
			depositCents: null as number | null,
			turnaroundHours: 12,
			accessories: null as string | null,
		},
		validators: { onSubmit: CreateTypeInput },
		onSubmit: async ({ value }) => {
			try {
				const type = await createType.mutateAsync(value);
				toast.success(`Tipo ${type.name} cadastrado.`);
				onCreated(type.id);
			} catch (error) {
				toast.error(describeError(error));
			}
		},
	});

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<FieldGroup>
				<form.Field name="name">
					{(field) => <TextField field={field} label="Nome do tipo" />}
				</form.Field>
				<form.Field name="nicknames">
					{(field) => (
						<TextField
							label="Apelidos"
							hint="Separe por vírgula. A busca também acha por aqui."
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
											.map((part) => part.trim())
											.filter(Boolean),
									),
							}}
						/>
					)}
				</form.Field>
				<form.Field name="description">
					{(field) => <NullableTextField field={field} label="Descrição" />}
				</form.Field>
				<div className="grid grid-cols-2 gap-4">
					<form.Field name="dailyPriceCents">
						{(field) => (
							<MoneyField
								field={field}
								label="Diária"
								hint="Em branco: a definir"
							/>
						)}
					</form.Field>
					<form.Field name="depositCents">
						{(field) => (
							<MoneyField
								field={field}
								label="Caução"
								hint="Em branco: a definir"
							/>
						)}
					</form.Field>
				</div>
				<form.Field name="accessories">
					{(field) => <NullableTextField field={field} label="Acessórios" />}
				</form.Field>
				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button type="submit" size="lg" disabled={isSubmitting}>
							Salvar tipo
						</Button>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}

function NewUnitForm({
	presetTypeId,
	onDone,
}: {
	presetTypeId: string | null;
	onDone: () => void;
}) {
	const types = useQuery(orpc.equipment.listTypes.queryOptions());
	const createUnit = useMutation(orpc.equipment.createUnit.mutationOptions());

	const form = useForm({
		defaultValues: {
			typeId: presetTypeId ?? "",
			code: null as string | null,
			name: "",
			shortName: null as string | null,
			voltage: null as string | null,
			serialNumber: null as string | null,
			accessories: null as string | null,
			owner: null as string | null,
			labelApplied: false,
			purchaseValueCents: null as number | null,
			replacementValueCents: null as number | null,
			notes: null as string | null,
		},
		validators: { onSubmit: CreateUnitInput },
		onSubmit: async ({ value }) => {
			try {
				const unit = await createUnit.mutateAsync(value);
				toast.success(`${unit.code} cadastrada.`);
				onDone();
			} catch (error) {
				toast.error(describeError(error));
			}
		},
	});

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<FieldGroup>
				<form.Field name="typeId">
					{(field) => (
						<SelectField
							field={field}
							label="Tipo"
							placeholder="Escolha o tipo"
							options={(types.data ?? []).map((type) => ({
								value: type.id,
								label: type.name,
							}))}
						/>
					)}
				</form.Field>
				<form.Field name="name">
					{(field) => (
						<TextField
							field={field}
							label="Marca e modelo"
							placeholder="Ex.: Martelete Bosch GBH 2-28 D"
						/>
					)}
				</form.Field>
				<div className="grid grid-cols-2 gap-4">
					<form.Field name="voltage">
						{(field) => <NullableTextField field={field} label="Voltagem" />}
					</form.Field>
					<form.Field name="serialNumber">
						{(field) => <NullableTextField field={field} label="Nº de série" />}
					</form.Field>
				</div>
				<form.Field name="accessories">
					{(field) => <NullableTextField field={field} label="Acessórios" />}
				</form.Field>
				<form.Field name="owner">
					{(field) => <NullableTextField field={field} label="Dono" />}
				</form.Field>
				<div className="grid grid-cols-2 gap-4">
					<form.Field name="purchaseValueCents">
						{(field) => <MoneyField field={field} label="Valor de compra" />}
					</form.Field>
					<form.Field name="replacementValueCents">
						{(field) => <MoneyField field={field} label="Valor de reposição" />}
					</form.Field>
				</div>
				<form.Field name="labelApplied">
					{(field) => (
						<Field orientation="horizontal" className="min-h-11">
							<Checkbox
								id={field.name}
								checked={field.state.value}
								onCheckedChange={(checked) => field.handleChange(checked)}
							/>
							<FieldLabel htmlFor={field.name} className="font-normal">
								Etiqueta aplicada
							</FieldLabel>
						</Field>
					)}
				</form.Field>
				<form.Subscribe selector={(state) => state.isSubmitting}>
					{(isSubmitting) => (
						<Button type="submit" size="lg" disabled={isSubmitting}>
							Salvar unidade
						</Button>
					)}
				</form.Subscribe>
			</FieldGroup>
		</form>
	);
}

export function NewEquipmentSheet({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [tab, setTab] = useState<Tab>("unit");
	const [presetTypeId, setPresetTypeId] = useState<string | null>(null);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent>
				<SheetHeader>
					<SheetTitle>Cadastrar equipamento</SheetTitle>
					<SheetDescription>
						O código MAR é gerado automaticamente.
					</SheetDescription>
				</SheetHeader>
				<div className="px-5 pb-6">
					<Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
						<TabsList aria-label="O que cadastrar">
							<TabsTrigger value="unit">Unidade de um tipo</TabsTrigger>
							<TabsTrigger value="type">Tipo novo</TabsTrigger>
						</TabsList>
						<TabsContent value="unit">
							<NewUnitForm
								key={presetTypeId}
								presetTypeId={presetTypeId}
								onDone={() => onOpenChange(false)}
							/>
						</TabsContent>
						<TabsContent value="type">
							<NewTypeForm
								onCreated={(typeId) => {
									setPresetTypeId(typeId);
									setTab("unit");
								}}
							/>
						</TabsContent>
					</Tabs>
				</div>
			</SheetContent>
		</Sheet>
	);
}
