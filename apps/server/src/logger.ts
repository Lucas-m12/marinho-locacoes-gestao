type Level = "info" | "warn" | "error";

export function log(level: Level, message: string, fields: object = {}): void {
	const line = JSON.stringify({
		level,
		message,
		time: new Date().toISOString(),
		...fields,
	});
	if (level === "error") console.error(line);
	else console.log(line);
}

export function errorFields(error: unknown): Record<string, unknown> {
	if (!(error instanceof Error)) return { error: String(error) };
	return { error: error.name, detail: error.message, stack: error.stack };
}
