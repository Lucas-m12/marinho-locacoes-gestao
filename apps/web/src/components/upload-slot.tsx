import type { FileRef } from "@marinho-gestao/contract";
import type { UploadPurpose } from "@marinho-gestao/domain";
import { Progress } from "@marinho-gestao/ui/components/progress";
import { cn } from "@marinho-gestao/ui/lib/utils";
import { Camera, Plus, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { FilePreview } from "@/components/file-preview";
import { uploadService } from "@/data/uploads";
import { describeError } from "@/lib/errors";

type SlotState =
	| { phase: "idle" }
	| { phase: "uploading"; progress: number }
	| { phase: "failed"; file: File; message: string };

const ACCEPT: Record<UploadPurpose, string> = {
	UNIT_PHOTO: "image/*",
	DAMAGE_PHOTO: "image/*",
	CHECKLIST_PHOTO: "image/*",
	CHECKLIST_VIDEO: "video/*",
	CUSTOMER_DOCUMENT: "image/*,application/pdf",
	RECEIPT: "image/*,application/pdf",
};

const OPENS_CAMERA: readonly UploadPurpose[] = [
	"UNIT_PHOTO",
	"DAMAGE_PHOTO",
	"CHECKLIST_PHOTO",
	"CHECKLIST_VIDEO",
];

export function useUploader({
	purpose,
	onUploaded,
	onBusyChange,
}: {
	purpose: UploadPurpose;
	onUploaded: (file: FileRef) => void | Promise<void>;
	onBusyChange?: (busy: boolean) => void;
}) {
	const [state, setState] = useState<SlotState>({ phase: "idle" });

	const busy = state.phase === "uploading";
	useEffect(() => {
		onBusyChange?.(busy);
	}, [busy, onBusyChange]);

	const start = async (file: File) => {
		setState({ phase: "uploading", progress: 0 });
		try {
			const ref = await uploadService.upload(file, {
				purpose,
				onProgress: (progress) => setState({ phase: "uploading", progress }),
			});
			await onUploaded(ref);
			setState({ phase: "idle" });
		} catch (error) {
			const message = describeError(error);
			setState({ phase: "failed", file, message });
			toast.error(message);
		}
	};

	return { state, start };
}

export function UploadSlot({
	purpose,
	label,
	file,
	onUploaded,
	onBusyChange,
	className,
	emptyIcon,
	children,
}: {
	purpose: UploadPurpose;
	label: string;
	file: FileRef | null | undefined;
	onUploaded: (file: FileRef) => void | Promise<void>;
	onBusyChange?: (busy: boolean) => void;
	className?: string;
	emptyIcon?: ReactNode;
	children?: ReactNode;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const { state, start } = useUploader({ purpose, onUploaded, onBusyChange });

	const pick = () => {
		if (state.phase === "failed") {
			start(state.file);
			return;
		}
		inputRef.current?.click();
	};

	return (
		<button
			type="button"
			onClick={pick}
			disabled={state.phase === "uploading"}
			aria-label={
				state.phase === "failed"
					? `Tentar enviar de novo: ${label}`
					: file
						? `Trocar ${label}`
						: `Enviar ${label}`
			}
			className={cn(
				"border-line-strong relative flex aspect-square min-h-11 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-[1.5px] p-1.5 text-center text-xs font-semibold",
				file ? "bg-background border-solid" : "bg-field border-dashed",
				state.phase === "failed" && "border-destructive",
				className,
			)}
		>
			<input
				ref={inputRef}
				type="file"
				hidden
				accept={ACCEPT[purpose]}
				capture={OPENS_CAMERA.includes(purpose) ? "environment" : undefined}
				onChange={(event) => {
					const picked = event.target.files?.[0];
					event.target.value = "";
					if (picked) start(picked);
				}}
			/>
			{file && state.phase !== "uploading" && (
				<FilePreview
					fileKey={file.fileKey}
					contentType={file.contentType}
					alt={label}
					className="absolute inset-0 size-full"
				/>
			)}
			{state.phase === "uploading" && (
				<span className="flex w-full flex-col items-center gap-1.5 px-2">
					<span>{Math.round(state.progress * 100)}%</span>
					<Progress value={state.progress * 100} className="w-full" />
				</span>
			)}
			{state.phase === "failed" && (
				<>
					<RotateCcw aria-hidden className="text-destructive size-5" />
					<span className="text-destructive">Tentar de novo</span>
				</>
			)}
			{state.phase === "idle" && !file && (
				<>
					{emptyIcon ?? <Plus aria-hidden className="size-5" />}
					<span>{label}</span>
				</>
			)}
			{state.phase === "idle" && file && (
				<span className="bg-primary/75 text-primary-foreground absolute inset-x-0 bottom-0 px-1 py-0.5 text-[11px]">
					{label}
				</span>
			)}
			{children}
		</button>
	);
}

export { Camera as CameraIcon };
