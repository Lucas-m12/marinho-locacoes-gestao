import type { Rental } from "@marinho-gestao/contract";
import {
	addHours,
	PAYMENT_KINDS,
	PAYMENT_METHODS,
	type PaymentKind,
	type PaymentMethod,
} from "@marinho-gestao/domain";
import { Alert, AlertDescription } from "@marinho-gestao/ui/components/alert";
import { Button } from "@marinho-gestao/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@marinho-gestao/ui/components/dialog";
import {
	NativeSelect,
	NativeSelectOption,
} from "@marinho-gestao/ui/components/native-select";
import { Textarea } from "@marinho-gestao/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	DateTimeInput,
	FieldShell,
	MoneyField,
} from "@/components/form/fields";
import { orpc } from "@/data/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { describeError, isLocallyHandled, showLocalError } from "@/lib/errors";
import { dailiesLabel, formatDate, money } from "@/lib/format";
import { PAYMENT_KIND_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/labels";

type DialogProps = {
	rental: Rental;
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

function MoneyInput({
	label,
	hint,
	value,
	onChange,
	error,
}: {
	label: string;
	hint?: string;
	value: number | null;
	onChange: (value: number | null) => void;
	error?: string | null;
}) {
	return (
		<MoneyField
			label={label}
			hint={hint}
			field={{
				state: { value, meta: { errors: error ? [error] : [] } },
				handleChange: onChange,
				handleBlur: () => undefined,
			}}
		/>
	);
}

function MethodSelect({
	value,
	onChange,
}: {
	value: PaymentMethod;
	onChange: (value: PaymentMethod) => void;
}) {
	return (
		<FieldShell label="Forma">
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

function suggestedKind(rental: Rental): PaymentKind {
	if (rental.status === "AWAITING_DEPOSIT" && rental.signalPaidCents === 0) {
		return "SIGNAL";
	}
	return "BALANCE";
}

function suggestedAmount(rental: Rental, kind: PaymentKind): number | null {
	if (kind === "SIGNAL") return rental.signalRequiredCents;
	if (kind === "BALANCE") return rental.balanceCents || null;
	return null;
}

export function PaymentDialog({ rental, open, onOpenChange }: DialogProps) {
	const record = useMutation(orpc.rentals.recordPayment.mutationOptions());
	const [kind, setKind] = useState(suggestedKind(rental));
	const [amount, setAmount] = useState(
		suggestedAmount(rental, suggestedKind(rental)),
	);
	const [method, setMethod] = useState<PaymentMethod>("PIX");
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (!amount || amount <= 0) {
			setError("Informe o valor.");
			return;
		}
		try {
			await record.mutateAsync({
				number: rental.number,
				kind,
				amountCents: amount,
				method,
			});
			toast.success(`${PAYMENT_KIND_LABELS[kind]} registrado.`);
			setError(null);
			onOpenChange(false);
		} catch (mutationError) {
			if (isLocallyHandled(mutationError)) {
				setError(describeError(mutationError));
			}
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Registrar pagamento</DialogTitle>
					<DialogDescription>
						{rental.number} · falta {money(rental.balanceCents)}
					</DialogDescription>
				</DialogHeader>
				<FieldShell label="O que foi pago">
					{({ id }) => (
						<NativeSelect
							id={id}
							value={kind}
							onChange={(event) => {
								const next = event.target.value as PaymentKind;
								setKind(next);
								setAmount(suggestedAmount(rental, next));
							}}
						>
							{PAYMENT_KINDS.map((option) => (
								<NativeSelectOption key={option} value={option}>
									{PAYMENT_KIND_LABELS[option]}
								</NativeSelectOption>
							))}
						</NativeSelect>
					)}
				</FieldShell>
				<div className="grid grid-cols-2 gap-4">
					<MoneyInput
						label="Valor"
						value={amount}
						onChange={setAmount}
						error={error}
					/>
					<MethodSelect value={method} onChange={setMethod} />
				</div>
				{kind === "SIGNAL" && rental.signalRequiredCents === null && (
					<p className="text-muted-foreground text-sm">
						O valor do sinal ainda está a definir: digite o que foi combinado.
					</p>
				)}
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button type="button" onClick={submit} disabled={record.isPending}>
						Salvar pagamento
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export type DepositAction = "receive" | "refund" | "retain";

const DEPOSIT_TITLES: Record<DepositAction, string> = {
	receive: "Registrar caução recebida",
	refund: "Devolver caução",
	retain: "Reter caução",
};

export function DepositDialog({
	rental,
	action,
	onClose,
}: {
	rental: Rental;
	action: DepositAction | null;
	onClose: () => void;
}) {
	const receive = useMutation(orpc.deposits.recordReceived.mutationOptions());
	const refund = useMutation(orpc.deposits.recordRefund.mutationOptions());
	const retain = useMutation(orpc.deposits.recordRetention.mutationOptions());
	const held = rental.deposit.heldCents;
	const [amount, setAmount] = useState<number | null>(null);
	const [method, setMethod] = useState<PaymentMethod>("PIX");
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);

	const close = () => {
		setAmount(null);
		setReason("");
		setError(null);
		onClose();
	};

	const value =
		amount ?? (action === "receive" ? rental.deposit.expectedCents : held);

	const submit = async () => {
		if (!value || value <= 0) {
			setError("Informe o valor.");
			return;
		}
		if (action === "retain" && reason.trim().length < 3) {
			setError("Informe o motivo da retenção.");
			return;
		}
		const movement = { rentalNumber: rental.number, amountCents: value };
		try {
			if (action === "receive") {
				await receive.mutateAsync({ ...movement, method });
			} else if (action === "refund") {
				await refund.mutateAsync({ ...movement, method });
			} else {
				await retain.mutateAsync({ ...movement, reason });
			}
			toast.success("Caução atualizada.");
			close();
		} catch (mutationError) {
			if (isLocallyHandled(mutationError)) {
				setError(describeError(mutationError));
			}
		}
	};

	return (
		<Dialog open={action !== null} onOpenChange={(open) => !open && close()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{action ? DEPOSIT_TITLES[action] : ""}</DialogTitle>
					<DialogDescription>
						{action === "retain"
							? "Só o valor retido entra no caixa, e sempre com motivo."
							: "A caução fica numa conta separada e não é faturamento."}
					</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-2 gap-4">
					<MoneyInput
						label="Valor"
						hint={action === "receive" ? undefined : `Em mãos: ${money(held)}`}
						value={value}
						onChange={setAmount}
						error={error}
					/>
					{action !== "retain" && (
						<MethodSelect value={method} onChange={setMethod} />
					)}
				</div>
				{action === "retain" && (
					<FieldShell label="Motivo">
						{({ id }) => (
							<Textarea
								id={id}
								value={reason}
								onChange={(event) => setReason(event.target.value)}
							/>
						)}
					</FieldShell>
				)}
				<DialogFooter>
					<Button type="button" variant="outline" onClick={close}>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={submit}
						disabled={receive.isPending || refund.isPending || retain.isPending}
					>
						Salvar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ExtendDialog({ rental, open, onOpenChange }: DialogProps) {
	const extend = useMutation(orpc.rentals.extend.mutationOptions());
	const [newEnd, setNewEnd] = useState(
		addHours(rental.endAt, 24).toISOString(),
	);
	const debounced = useDebouncedValue(newEnd);
	const later = Date.parse(debounced) > Date.parse(rental.endAt);
	const preview = useQuery(
		orpc.rentals.previewExtend.queryOptions({
			input: { number: rental.number, newEndAt: debounced },
			enabled: open && later,
		}),
	);

	const submit = async () => {
		try {
			await extend.mutateAsync({ number: rental.number, newEndAt: newEnd });
			toast.success("Locação prorrogada.");
			onOpenChange(false);
		} catch (error) {
			showLocalError(error);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Prorrogar locação</DialogTitle>
					<DialogDescription>
						A agenda é conferida e o valor recalculado antes de salvar.
					</DialogDescription>
				</DialogHeader>
				<FieldShell label="Nova devolução">
					{({ id }) => (
						<DateTimeInput id={id} value={newEnd} onChange={setNewEnd} />
					)}
				</FieldShell>
				{!later && (
					<Alert variant="destructive">
						<AlertDescription>
							Escolha uma data depois da devolução atual.
						</AlertDescription>
					</Alert>
				)}
				{later && preview.data && !preview.data.available && (
					<Alert variant="destructive">
						<AlertDescription>
							Não dá para prorrogar até essa data:{" "}
							{preview.data.conflicts
								.map(
									(entry) =>
										`${entry.code} tem outra reserva${entry.rentalNumber ? ` (${entry.rentalNumber})` : ""}`,
								)
								.join(", ")}
							.
						</AlertDescription>
					</Alert>
				)}
				{later && preview.data?.available && (
					<dl className="bg-background flex flex-col gap-1 rounded-lg p-3.5 text-[15px]">
						<div className="flex justify-between gap-3">
							<dt className="text-muted-foreground">Agora são</dt>
							<dd className="font-bold">
								{dailiesLabel(preview.data.dailies)}
							</dd>
						</div>
						<div className="flex justify-between gap-3">
							<dt className="text-muted-foreground">A mais</dt>
							<dd className="font-bold">
								{money(preview.data.differenceCents)}
							</dd>
						</div>
						<div className="flex justify-between gap-3">
							<dt className="text-muted-foreground">Novo total</dt>
							<dd className="font-bold">{money(preview.data.newTotalCents)}</dd>
						</div>
					</dl>
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
						disabled={!preview.data?.available || extend.isPending}
					>
						Prorrogar até {later ? formatDate(newEnd) : "…"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function CancelDialog({ rental, open, onOpenChange }: DialogProps) {
	const cancel = useMutation(orpc.rentals.cancel.mutationOptions());
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (reason.trim().length < 3) {
			setError("Informe o motivo.");
			return;
		}
		try {
			await cancel.mutateAsync({ number: rental.number, reason });
			toast.success("Locação cancelada.");
			onOpenChange(false);
		} catch (mutationError) {
			showLocalError(mutationError);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Cancelar {rental.number}</DialogTitle>
					<DialogDescription>
						As unidades voltam para a agenda. Isso não pode ser desfeito.
					</DialogDescription>
				</DialogHeader>
				<FieldShell label="Motivo" errors={error ? [error] : []}>
					{({ id, invalid, describedBy }) => (
						<Textarea
							id={id}
							value={reason}
							onChange={(event) => setReason(event.target.value)}
							aria-invalid={invalid}
							aria-describedby={describedBy}
						/>
					)}
				</FieldShell>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Voltar
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={submit}
						disabled={cancel.isPending}
					>
						Cancelar locação
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
