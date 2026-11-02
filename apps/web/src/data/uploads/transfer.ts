import { UploadError } from "./types";

export function putWithProgress(input: {
	url: string;
	file: File;
	headers: Record<string, string>;
	onProgress?: (fraction: number) => void;
	signal?: AbortSignal;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = new XMLHttpRequest();
		request.open("PUT", input.url);
		for (const [name, value] of Object.entries(input.headers)) {
			request.setRequestHeader(name, value);
		}
		request.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				input.onProgress?.(event.loaded / event.total);
			}
		};
		request.onload = () => {
			if (request.status >= 200 && request.status < 300) {
				input.onProgress?.(1);
				resolve();
			} else {
				reject(new UploadError("O envio falhou. Tente de novo."));
			}
		};
		request.onerror = () =>
			reject(new UploadError("Sem conexão. Tente de novo."));
		request.onabort = () => reject(new UploadError("Envio cancelado."));
		input.signal?.addEventListener("abort", () => request.abort());
		request.send(input.file);
	});
}
