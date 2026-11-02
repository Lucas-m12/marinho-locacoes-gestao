import {
	MAX_DOCUMENT_BYTES,
	MAX_IMAGE_BYTES,
	MAX_VIDEO_BYTES,
	MAX_VIDEO_SECONDS,
	type UploadPurpose,
} from "@marinho-gestao/domain";
import { UploadError } from "./types";

const MAX_IMAGE_SIDE = 2000;
const JPEG_QUALITY = 0.85;

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(new UploadError("Não foi possível reduzir a foto.")),
			"image/jpeg",
			JPEG_QUALITY,
		);
	});
}

async function shrinkImage(file: File): Promise<File> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(
		1,
		MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height),
	);
	const canvas = document.createElement("canvas");
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();

	const blob = await canvasToBlob(canvas);
	const name = file.name.replace(/\.[^.]+$/, "") || "foto";
	return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}

function videoDuration(file: File): Promise<number> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement("video");
		video.preload = "metadata";
		video.onloadedmetadata = () => {
			URL.revokeObjectURL(url);
			resolve(video.duration);
		};
		video.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new UploadError("Não foi possível ler o vídeo."));
		};
		video.src = url;
	});
}

export async function prepareFile(
	file: File,
	purpose: UploadPurpose,
): Promise<File> {
	if (purpose === "CHECKLIST_VIDEO") {
		if (!file.type.startsWith("video/")) {
			throw new UploadError("Escolha um arquivo de vídeo.");
		}
		if (file.size > MAX_VIDEO_BYTES) {
			throw new UploadError("O vídeo passa de 50 MB.");
		}
		if ((await videoDuration(file)) > MAX_VIDEO_SECONDS) {
			throw new UploadError("O vídeo passa de 30 segundos.");
		}
		return file;
	}

	if (file.type.startsWith("image/")) {
		const prepared =
			file.type === "image/svg+xml" ? file : await shrinkImage(file);
		if (prepared.size > MAX_IMAGE_BYTES) {
			throw new UploadError("A foto passa de 10 MB mesmo depois de reduzida.");
		}
		return prepared;
	}

	if (purpose === "CUSTOMER_DOCUMENT" || purpose === "RECEIPT") {
		if (file.type !== "application/pdf") {
			throw new UploadError("Envie uma imagem ou um PDF.");
		}
		if (file.size > MAX_DOCUMENT_BYTES) {
			throw new UploadError("O documento passa de 10 MB.");
		}
		return file;
	}

	throw new UploadError("Escolha uma imagem.");
}
