type Area = "local" | "session";

const memory = new Map<string, string>();

function browserStorage(area: Area): Storage | null {
	try {
		return area === "local"
			? globalThis.localStorage
			: globalThis.sessionStorage;
	} catch {
		return null;
	}
}

export function readText(area: Area, key: string): string | null {
	const storage = browserStorage(area);
	if (storage) return storage.getItem(key);
	return memory.get(`${area}:${key}`) ?? null;
}

export function writeText(area: Area, key: string, value: string): void {
	const storage = browserStorage(area);
	if (storage) {
		storage.setItem(key, value);
		return;
	}
	memory.set(`${area}:${key}`, value);
}

export function removeKey(area: Area, key: string): void {
	const storage = browserStorage(area);
	if (storage) {
		storage.removeItem(key);
		return;
	}
	memory.delete(`${area}:${key}`);
}

export function readJson<T>(area: Area, key: string): T | null {
	const text = readText(area, key);
	if (text === null) return null;
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

export function writeJson(area: Area, key: string, value: unknown): void {
	writeText(area, key, JSON.stringify(value));
}
