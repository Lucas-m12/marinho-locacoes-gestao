import { SERVER_URL } from "./env";

async function post(path: string, body: unknown): Promise<void> {
	const response = await fetch(`${SERVER_URL}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		throw new Error(
			`${path} respondeu ${response.status}: ${await response.text()}. O servidor subiu com E2E_TEST_HOOKS=1?`,
		);
	}
}

export function resetServer(now: string | Date): Promise<void> {
	return post("/__test/reset", { now: new Date(now).toISOString() });
}

export function setServerClock(now: string | Date): Promise<void> {
	return post("/__test/clock", { now: new Date(now).toISOString() });
}
