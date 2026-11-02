import { useCallback, useState } from "react";

function newKey(): string {
	if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
		"",
	);
}

export function useIdempotencyKey(): readonly [string, () => void] {
	const [key, setKey] = useState(newKey);
	const renew = useCallback(() => setKey(newKey()), []);
	return [key, renew];
}
