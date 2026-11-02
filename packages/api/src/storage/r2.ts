import { type FileHandle, open } from "node:fs/promises";
import { AwsClient } from "aws4fetch";
import type { ObjectHead, ObjectStorage } from "./object-storage";

export type R2Config = {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
	endpoint?: string;
};

export type PutFileResult = { sizeBytes: number; parts: number };

export const MULTIPART_PART_BYTES = 32 * 1024 * 1024;

function encodeKey(key: string): string {
	return key.split("/").map(encodeURIComponent).join("/");
}

async function readChunk(
	file: FileHandle,
	position: number,
	length: number,
): Promise<Uint8Array> {
	const buffer = new Uint8Array(length);
	let offset = 0;
	while (offset < length) {
		const { bytesRead } = await file.read(
			buffer,
			offset,
			length - offset,
			position + offset,
		);
		if (bytesRead === 0) {
			throw new Error("O arquivo terminou antes do esperado durante o envio");
		}
		offset += bytesRead;
	}
	return buffer;
}

async function ensureOk(response: Response, action: string): Promise<string> {
	const body = await response.text();
	if (!response.ok || body.includes("<Error>")) {
		throw new Error(
			`R2 respondeu ${response.status} ao ${action}: ${body.slice(0, 300)}`,
		);
	}
	return body;
}

export class R2Storage implements ObjectStorage {
	private readonly client: AwsClient;
	private readonly baseUrl: string;

	constructor(config: R2Config) {
		this.client = new AwsClient({
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
			service: "s3",
			region: "auto",
		});
		const endpoint =
			config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`;
		this.baseUrl = `${endpoint.replace(/\/$/, "")}/${config.bucket}`;
	}

	private objectUrl(
		key: string,
		params: Record<string, string> = {},
		expiresInSeconds?: number,
	): URL {
		const url = new URL(`${this.baseUrl}/${encodeKey(key)}`);
		for (const [name, value] of Object.entries(params)) {
			url.searchParams.set(name, value);
		}
		if (expiresInSeconds !== undefined) {
			url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
		}
		return url;
	}

	async presignPut(
		key: string,
		contentType: string,
		expiresInSeconds: number,
	): Promise<string> {
		const signed = await this.client.sign(
			new Request(this.objectUrl(key, {}, expiresInSeconds).toString(), {
				method: "PUT",
				headers: { "Content-Type": contentType },
			}),
			{ aws: { signQuery: true, allHeaders: true } },
		);
		return signed.url;
	}

	async presignGet(key: string, expiresInSeconds: number): Promise<string> {
		const signed = await this.client.sign(
			new Request(this.objectUrl(key, {}, expiresInSeconds).toString(), {
				method: "GET",
			}),
			{ aws: { signQuery: true } },
		);
		return signed.url;
	}

	async head(key: string): Promise<ObjectHead | null> {
		const response = await this.client.fetch(this.objectUrl(key), {
			method: "HEAD",
		});
		if (response.status === 404) return null;
		if (!response.ok) {
			throw new Error(`R2 respondeu ${response.status} ao conferir o objeto`);
		}
		return {
			sizeBytes: Number(response.headers.get("content-length") ?? "0"),
			contentType: response.headers.get("content-type"),
		};
	}

	async delete(key: string): Promise<void> {
		const response = await this.client.fetch(this.objectUrl(key), {
			method: "DELETE",
		});
		if (!response.ok && response.status !== 404) {
			throw new Error(`R2 respondeu ${response.status} ao apagar o objeto`);
		}
	}

	async putFile(
		key: string,
		filePath: string,
		contentType: string,
		partBytes = MULTIPART_PART_BYTES,
	): Promise<PutFileResult> {
		const file = await open(filePath, "r");
		try {
			const { size } = await file.stat();
			if (size <= partBytes) {
				const response = await this.client.fetch(this.objectUrl(key), {
					method: "PUT",
					headers: { "Content-Type": contentType },
					body: await readChunk(file, 0, size),
				});
				await ensureOk(response, "enviar o arquivo");
				return { sizeBytes: size, parts: 1 };
			}
			const parts = await this.putMultipart(
				key,
				file,
				size,
				contentType,
				partBytes,
			);
			return { sizeBytes: size, parts };
		} finally {
			await file.close();
		}
	}

	private async putMultipart(
		key: string,
		file: FileHandle,
		size: number,
		contentType: string,
		partBytes: number,
	): Promise<number> {
		const created = await this.client.fetch(
			this.objectUrl(key, { uploads: "" }),
			{ method: "POST", headers: { "Content-Type": contentType } },
		);
		const uploadId = (
			await ensureOk(created, "iniciar o envio em partes")
		).match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
		if (!uploadId) throw new Error("R2 não devolveu o UploadId");

		try {
			const etags: string[] = [];
			for (let position = 0; position < size; position += partBytes) {
				const partNumber = etags.length + 1;
				const response = await this.client.fetch(
					this.objectUrl(key, { partNumber: String(partNumber), uploadId }),
					{
						method: "PUT",
						body: await readChunk(
							file,
							position,
							Math.min(partBytes, size - position),
						),
					},
				);
				await ensureOk(response, `enviar a parte ${partNumber}`);
				const etag = response.headers.get("etag");
				if (!etag)
					throw new Error(`R2 não devolveu o ETag da parte ${partNumber}`);
				etags.push(etag);
			}
			const manifest = etags
				.map(
					(etag, index) =>
						`<Part><PartNumber>${index + 1}</PartNumber><ETag>${etag}</ETag></Part>`,
				)
				.join("");
			const completed = await this.client.fetch(
				this.objectUrl(key, { uploadId }),
				{
					method: "POST",
					headers: { "Content-Type": "application/xml" },
					body: `<CompleteMultipartUpload>${manifest}</CompleteMultipartUpload>`,
				},
			);
			await ensureOk(completed, "concluir o envio em partes");
			return etags.length;
		} catch (error) {
			await this.client
				.fetch(this.objectUrl(key, { uploadId }), { method: "DELETE" })
				.catch(() => undefined);
			throw error;
		}
	}
}
