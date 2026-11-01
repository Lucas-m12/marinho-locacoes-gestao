import { RecordLostDemandInput } from "@marinho-gestao/contract";
import { calendarDay } from "@marinho-gestao/domain";
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
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	FieldShell,
	NullableTextField,
	TextField,
} from "@/components/form/fields";
import { orpc } from "@/data/client";

export function LostDemandDialog({
	open,
	onOpenChange,
	preset,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	preset?: { item?: string; typeId?: string | null; reason?: string };
}) {
	const record = useMutation(orpc.rentals.recordLostDemand.mutationOptions());

	const form = useForm({
		defaultValues: {
			item: preset?.item ?? "",
			typeId: preset?.typeId ?? null,
			reason: preset?.reason ?? "",
			city: null as string | null,
			requestedOn: calendarDay(new Date()),
		},
		validators: { onSubmit: RecordLostDemandInput },
		onSubmit: async ({ value, formApi }) => {
			await record.mutateAsync(value);
			toast.success("Pedido registrado.");
			formApi.reset();
			onOpenChange(false);
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Registrar pedido não atendido</DialogTitle>
					<DialogDescription>
						Vira dado para decidir o que comprar.
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
						<form.Field name="item">
							{(field) => (
								<TextField field={field} label="Equipamento ou tipo pedido" />
							)}
						</form.Field>
						<form.Field name="reason">
							{(field) => (
								<TextField
									field={field}
									label="Motivo"
									placeholder="Não temos no estoque"
								/>
							)}
						</form.Field>
						<div className="grid grid-cols-2 gap-4">
							<form.Field name="city">
								{(field) => (
									<NullableTextField field={field} label="Município" />
								)}
							</form.Field>
							<form.Field name="requestedOn">
								{(field) => (
									<FieldShell label="Data" errors={field.state.meta.errors}>
										{({ id, invalid, describedBy }) => (
											<Input
												id={id}
												type="date"
												value={field.state.value}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												aria-invalid={invalid}
												aria-describedby={describedBy}
											/>
										)}
									</FieldShell>
								)}
							</form.Field>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
							>
								Cancelar
							</Button>
							<Button type="submit" disabled={record.isPending}>
								Registrar pedido
							</Button>
						</DialogFooter>
					</FieldGroup>
				</form>
			</DialogContent>
		</Dialog>
	);
}
