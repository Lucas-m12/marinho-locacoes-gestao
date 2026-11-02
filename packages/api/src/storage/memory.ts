import type { ObjectHead, ObjectStorage } from "./object-storage";

type StoredObject = { contentType: string | null; body: Uint8Array };

export class MemoryStorage implements ObjectStorage {
	private readonly objects = new Map<string, StoredObject>();

	constructor(private readonly baseUrl = "memory://bucket") {}

	put(key: string, body: Uint8Array, contentType: string | null): void {
		this.objects.set(key, { body, contentType });
	}

	has(key: string): boolean {
		return this.objects.has(key);
	}

	async presignPut(key: string, contentType: string, expiresInSeconds: number) {
		return `${this.baseUrl}/${key}?method=PUT&type=${encodeURIComponent(contentType)}&expires=${expiresInSeconds}`;
	}

	async presignGet(key: string, expiresInSeconds: number) {
		return `${this.baseUrl}/${key}?expires=${expiresInSeconds}`;
	}

	async head(key: string): Promise<ObjectHead | null> {
		const object = this.objects.get(key);
		return object
			? { sizeBytes: object.body.byteLength, contentType: object.contentType }
			: null;
	}

	async delete(key: string): Promise<void> {
		this.objects.delete(key);
	}
}
