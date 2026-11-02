import type {
	CustomerDetail,
	CustomerDocument,
} from "@marinho-gestao/contract";
import type { DocumentKind } from "@marinho-gestao/domain";
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
import { Textarea } from "@marinho-gestao/ui/components/textarea";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { F2Badge } from "@/components/f2-badge";
import { FilePreview } from "@/components/file-preview";
import { FieldShell } from "@/components/form/fields";
import { ErrorState, PageHeader, ScreenSkeleton } from "@/components/page";
import { StatusChip } from "@/components/status-chip";
import { ToDefine } from "@/components/to-define";
import { UploadButton } from "@/components/upload-slot";
import { orpc } from "@/data/client";
import { formatDate, formatPeriod, initials, money } from "@/lib/format";
import {
	CUSTOMER_KIND_LABELS,
	CUSTOMER_ORIGIN_LABELS,
	documentLabel,
	taxIdLabel,
} from "@/lib/labels";
import { CustomerSheet } from "./customer-sheet";

const EXPECTED_DOCUMENTS: readonly DocumentKind[] = [
	"PHOTO_ID",
	"TAX_ID",
	"PROOF_OF_ADDRESS",
];

function maskTaxId(taxId: string): string {
	return taxId.replace(/\d/g, "•");
}

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex justify-between gap-4 border-t py-2.5 text-[15px]">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="text-right font-bold">{children}</dd>
		</div>
	);
}

function DataCard({ customer }: { customer: CustomerDetail }) {
	const address = [customer.address, customer.neighborhood, customer.city]
		.filter(Boolean)
		.join(", ");
	const origin = customer.origin
		? [CUSTOMER_ORIGIN_LABELS[customer.origin], customer.referredBy]
				.filter(Boolean)
				.join(" · ")
		: null;
	return (
		<Card aria-labelledby="dados" className="gap-1.5 px-(--card-spacing)">
			<h2 id="dados" className="type-title mb-2 text-xl/6">
				Dados
			</h2>
			<dl className="flex flex-col">
				<Row label="Tipo">{CUSTOMER_KIND_LABELS[customer.kind]}</Row>
				<Row label={taxIdLabel(customer.kind)}>
					{customer.taxId ? maskTaxId(customer.taxId) : <ToDefine />}
				</Row>
				{customer.kind === "COMPANY" && (
					<>
						<Row label="Responsável">
							{customer.responsible ?? <ToDefine />}
						</Row>
						<Row label="Autorizados a receber">
							{customer.authorizedReceivers.join(", ") || <ToDefine />}
						</Row>
					</>
				)}
				<Row label="WhatsApp">{customer.whatsapp ?? <ToDefine />}</Row>
				{customer.alternatePhone && (
					<Row label="Telefone alternativo">{customer.alternatePhone}</Row>
				)}
				<Row label="Endereço">{address || <ToDefine />}</Row>
				<Row label="Chegou por">{origin ?? <ToDefine />}</Row>
				<Row label="Aceita mensagens">
					{customer.acceptsPromotions ? "Sim" : "Não"}
				</Row>
			</dl>
		</Card>
	);
}

function DocumentViewer({
	document,
	onClose,
}: {
	document: CustomerDocument;
	onClose: () => void;
}) {
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{document.label}</DialogTitle>
					<DialogDescription>
						Recebido em {formatDate(document.receivedAt)}. O link é temporário.
					</DialogDescription>
				</DialogHeader>
				<FilePreview
					fileKey={document.file.fileKey}
					contentType={document.file.contentType}
					alt={document.label}
					className="max-h-[60dvh] w-full rounded-lg object-contain"
				/>
			</DialogContent>
		</Dialog>
	);
}

function DocumentsCard({ customer }: { customer: CustomerDetail }) {
	const addDocument = useMutation(orpc.customers.addDocument.mutationOptions());
	const [viewing, setViewing] = useState<CustomerDocument | null>(null);

	const save = (kind: DocumentKind) => async (file: { fileKey: string }) => {
		await addDocument.mutateAsync({
			customerId: customer.id,
			kind,
			fileKey: file.fileKey,
		});
		toast.success("Documento salvo.");
	};

	return (
		<Card aria-labelledby="docs" className="gap-2.5 px-(--card-spacing)">
			<h2 id="docs" className="type-title text-xl/6">
				Documentos
			</h2>
			{EXPECTED_DOCUMENTS.map((kind) => {
				const document = customer.documents.find(
					(entry) => entry.kind === kind,
				);
				return (
					<div key={kind} className="flex min-h-11 items-center gap-3">
						<span
							aria-hidden
							className={
								document
									? "bg-status-available text-positive flex size-7 flex-none items-center justify-center rounded-full"
									: "border-line-strong size-7 flex-none rounded-full border-[1.5px] border-dashed"
							}
						>
							{document && <Check className="size-4" strokeWidth={3} />}
						</span>
						<span className="flex grow flex-col">
							<b className="text-[15px]">
								{documentLabel(kind, customer.kind)}
							</b>
							<span className="text-muted-foreground text-[13px]">
								{document
									? `Recebido em ${formatDate(document.receivedAt)}`
									: "Falta receber"}
							</span>
						</span>
						{document ? (
							<Button
								variant="secondary"
								size="xs"
								aria-label={`Ver ${documentLabel(kind, customer.kind)}`}
								onClick={() => setViewing(document)}
							>
								Ver
							</Button>
						) : (
							<UploadButton
								purpose="CUSTOMER_DOCUMENT"
								label="Enviar"
								accessibleLabel={`Enviar ${documentLabel(kind, customer.kind)}`}
								onUploaded={save(kind)}
							/>
						)}
					</div>
				);
			})}
			<p className="text-muted-foreground text-[13px]">
				Só vocês três têm acesso às fotos dos documentos.
			</p>
			{viewing && (
				<DocumentViewer document={viewing} onClose={() => setViewing(null)} />
			)}
		</Card>
	);
}

function RentalsCard({ customer }: { customer: CustomerDetail }) {
	return (
		<Card aria-labelledby="locs" className="gap-1 px-(--card-spacing)">
			<h2 id="locs" className="type-title mb-2 text-xl/6">
				Locações
			</h2>
			{customer.rentals.length === 0 && (
				<p className="text-muted-foreground border-t py-3">
					Nenhuma locação ainda. Use “Nova locação para ele” para começar.
				</p>
			)}
			{customer.rentals.map((rental) => (
				<Link
					key={rental.number}
					to="/locacoes/$numero"
					params={{ numero: rental.number }}
					className="flex min-h-[76px] flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t py-2.5"
				>
					<b className="w-[84px] flex-none text-sm">{rental.number}</b>
					<span className="flex flex-[1_1_180px] flex-col">
						<span className="text-[15px] font-semibold">
							{rental.equipmentSummary}
						</span>
						<span className="text-muted-foreground text-[13px]">
							{formatPeriod(rental.startAt, rental.endAt)}
						</span>
					</span>
					<b className="text-[15px]">{money(rental.totalCents)}</b>
					<StatusChip kind="rental" status={rental.displayStatus} />
				</Link>
			))}
		</Card>
	);
}

function NotesCard({ customer }: { customer: CustomerDetail }) {
	const update = useMutation(orpc.customers.update.mutationOptions());
	const [notes, setNotes] = useState(customer.notes ?? "");
	const changed = notes !== (customer.notes ?? "");

	return (
		<Card aria-labelledby="obs" className="gap-2.5 px-(--card-spacing)">
			<h2 id="obs" className="type-title text-xl/6">
				Observações
			</h2>
			<FieldShell label="O que a família precisa lembrar">
				{({ id }) => (
					<Textarea
						id={id}
						value={notes}
						onChange={(event) => setNotes(event.target.value)}
					/>
				)}
			</FieldShell>
			{changed && (
				<Button
					variant="secondary"
					className="self-start"
					disabled={update.isPending}
					onClick={async () => {
						await update.mutateAsync({
							id: customer.id,
							notes: notes.trim() || null,
						});
						toast.success("Observações salvas.");
					}}
				>
					Salvar observações
				</Button>
			)}
			<div className="bg-background flex items-center gap-2.5 rounded-lg px-3.5 py-3 text-sm">
				<F2Badge />
				Condição especial de pagamento fica para a próxima fase.
			</div>
		</Card>
	);
}

function BlockDialog({
	customer,
	onClose,
}: {
	customer: CustomerDetail;
	onClose: () => void;
}) {
	const update = useMutation(orpc.customers.update.mutationOptions());
	const blocked = customer.blockedManually;
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (!blocked && reason.trim().length < 3) {
			setError("Informe o motivo do bloqueio.");
			return;
		}
		await update.mutateAsync({
			id: customer.id,
			blockedManually: !blocked,
			blockReason: blocked ? null : reason.trim(),
		});
		toast.success(blocked ? "Cliente desbloqueado." : "Cliente bloqueado.");
		onClose();
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{blocked ? "Desbloquear cliente" : "Bloquear cliente"}
					</DialogTitle>
					<DialogDescription>
						{blocked
							? `Bloqueado por: ${customer.blockReason ?? "motivo não informado"}.`
							: "Cliente bloqueado não recebe orçamento. É a única situação marcada à mão."}
					</DialogDescription>
				</DialogHeader>
				{!blocked && (
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
				)}
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						Voltar
					</Button>
					<Button
						type="button"
						variant={blocked ? "default" : "destructive"}
						disabled={update.isPending}
						onClick={submit}
					>
						{blocked ? "Desbloquear" : "Bloquear"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function CustomerScreen({ id }: { id: string }) {
	const [editOpen, setEditOpen] = useState(false);
	const [blockOpen, setBlockOpen] = useState(false);
	const customer = useQuery(orpc.customers.get.queryOptions({ input: { id } }));

	if (customer.isPending) return <ScreenSkeleton />;
	if (customer.isError) {
		return (
			<ErrorState error={customer.error} onRetry={() => customer.refetch()} />
		);
	}

	const { data } = customer;
	const stats = [
		["Locações", String(data.stats.rentalCount)],
		["Total gasto", money(data.stats.totalSpentCents)],
		["Atrasos", String(data.stats.lateCount)],
		["Saldo em aberto", money(data.stats.openBalanceCents)],
	];

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				back={{ to: "/clientes", label: "Clientes" }}
				title={data.name}
				titleAddon={<StatusChip kind="customer" status={data.tier} size="lg" />}
				leading={
					<span
						aria-hidden
						className="type-condensed bg-primary text-primary-foreground flex size-14 flex-none items-center justify-center rounded-full text-[22px] font-extrabold"
					>
						{initials(data.name)}
					</span>
				}
				description={[
					data.occupation,
					data.city,
					`cliente desde ${formatDate(data.createdAt)}`,
				]
					.filter(Boolean)
					.join(" · ")}
				actions={
					<>
						<Button variant="outline" onClick={() => setBlockOpen(true)}>
							{data.blockedManually ? "Desbloquear" : "Bloquear"}
						</Button>
						<Button variant="outline" onClick={() => setEditOpen(true)}>
							Editar
						</Button>
						<Link
							to="/locacoes/nova"
							search={{ cliente: data.id }}
							className={buttonVariants()}
						>
							Nova locação para ele
						</Link>
					</>
				}
			/>

			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{stats.map(([label, value]) => (
					<div
						key={label}
						className="bg-card flex flex-col gap-1 rounded-xl p-4"
					>
						<span className="text-muted-foreground text-[13px]">{label}</span>
						<b className="type-condensed text-[26px]/[30px]">{value}</b>
					</div>
				))}
			</div>

			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
				<div className="flex min-w-0 flex-col gap-6">
					<DataCard customer={data} />
					<DocumentsCard customer={data} />
				</div>
				<div className="flex min-w-0 flex-col gap-6">
					<RentalsCard customer={data} />
					<NotesCard key={data.notes} customer={data} />
				</div>
			</div>

			{editOpen && (
				<CustomerSheet
					open={editOpen}
					onOpenChange={setEditOpen}
					customer={data}
				/>
			)}
			{blockOpen && (
				<BlockDialog customer={data} onClose={() => setBlockOpen(false)} />
			)}
		</div>
	);
}
