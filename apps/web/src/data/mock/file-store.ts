import { createStore, get, set } from "idb-keyval";

const store = () => createStore("marinho-mock-files", "blobs");

export function putBlob(fileKey: string, blob: Blob): Promise<void> {
	return set(fileKey, blob, store());
}

export function getBlob(fileKey: string): Promise<Blob | undefined> {
	return get<Blob>(fileKey, store());
}
