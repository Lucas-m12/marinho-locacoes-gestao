import { AwsClient } from "aws4fetch";
import type { ObjectHead, ObjectStorage } from "./object-storage";

export type R2Config = {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucket: string;
};

function encodeKey(key: string): string {
	return key.split("/").map(encodeURIComponent).join("/");
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
		this.baseUrl = `https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}`;
	}

	private objectUrl(key: string, expiresInSeconds?: number): URL {
		const url = new URL(`${this.baseUrl}/${encodeKey(key)}`);
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
			new Request(this.objectUrl(key, expiresInSeconds).toString(), {
				method: "PUT",
				headers: { "Content-Type": contentType },
			}),
			{ aws: { signQuery: true, allHeaders: true } },
		);
		return signed.url;
	}

	async presignGet(key: string, expiresInSeconds: number): Promise<string> {
		const signed = await this.client.sign(
			new Request(this.objectUrl(key, expiresInSeconds).toString(), {
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
}
