export type ObjectHead = { sizeBytes: number; contentType: string | null };

export interface ObjectStorage {
	presignPut(
		key: string,
		contentType: string,
		expiresInSeconds: number,
	): Promise<string>;
	presignGet(key: string, expiresInSeconds: number): Promise<string>;
	head(key: string): Promise<ObjectHead | null>;
	delete(key: string): Promise<void>;
}
