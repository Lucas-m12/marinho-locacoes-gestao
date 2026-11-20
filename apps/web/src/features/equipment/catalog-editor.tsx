import type { FileRef } from "@marinho-gestao/contract";
import { Button } from "@marinho-gestao/ui/components/button";
import { Textarea } from "@marinho-gestao/ui/components/textarea";
import { useState } from "react";
import { FieldShell } from "@/components/form/fields";
import { StatusChip } from "@/components/status-chip";
import { UploadSlot } from "@/components/upload-slot";

export const CATALOG_INTRO =
	"Aparece no Instagram, no Facebook e nos anúncios de catálogo. A Meta busca daqui, então mudar foto, texto ou diária aqui muda lá também.";

export function catalogMissing(input: {
	hasPhoto: boolean;
	description: string | null;
	dailyPriceCents: number | null;
}): string[] {
	const missing: string[] = [];
	if (!input.hasPhoto) missing.push("foto");
	if (!input.description?.trim()) missing.push("texto");
	if (input.dailyPriceCents === null) missing.push("diária");
	return missing;
}

export function CatalogStatus({ missing }: { missing: string[] }) {
	if (missing.length === 0) {
		return (
			<StatusChip tone="available" className="self-start">
				No catálogo
			</StatusChip>
		);
	}
	return (
		<span className="flex flex-wrap items-center gap-2">
			<StatusChip tone="draft">Fora do catálogo</StatusChip>
			<span className="text-muted-foreground text-sm">
				Falta {missing.join(", ")}.
			</span>
		</span>
	);
}

/**
 * Foto e texto públicos de um item. A foto sobe na hora; o texto só ao salvar.
 */
export function CatalogEditor({
	photo,
	description,
	onPhotoUploaded,
	onSaveDescription,
	saving,
}: {
	photo: FileRef | null;
	description: string | null;
	onPhotoUploaded: (fileKey: string) => Promise<void>;
	onSaveDescription: (description: string | null) => Promise<void>;
	saving: boolean;
}) {
	const [text, setText] = useState(description ?? "");
	const [error, setError] = useState<string | null>(null);

	const save = async () => {
		const value = text.trim();
		if (value.length > 0 && value.length < 10) {
			setError("Escreva pelo menos uma frase.");
			return;
		}
		if (value.length > 1000) {
			setError("Use até 1.000 caracteres.");
			return;
		}
		setError(null);
		await onSaveDescription(value || null);
	};

	return (
		<div className="flex flex-col gap-3">
			<UploadSlot
				purpose="UNIT_PHOTO"
				label="Foto do catálogo"
				file={photo}
				onUploaded={(file) => onPhotoUploaded(file.fileKey)}
				className="bg-background aspect-square w-full max-w-60 rounded-xl text-sm"
			/>
			<FieldShell
				label="Texto do catálogo"
				hint="Para que serve e o que vai junto. O preço e o rodapé de entrega entram sozinhos."
				errors={error ? [error] : []}
			>
				{({ id, invalid, describedBy }) => (
					<Textarea
						id={id}
						value={text}
						rows={4}
						onChange={(event) => setText(event.target.value)}
						aria-invalid={invalid}
						aria-describedby={describedBy}
					/>
				)}
			</FieldShell>
			<Button
				type="button"
				className="self-start"
				disabled={saving}
				onClick={save}
			>
				Salvar texto
			</Button>
		</div>
	);
}
