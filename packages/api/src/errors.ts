export * from "@marinho-gestao/read-model/errors";

const EXCLUSION_VIOLATION = "23P01";
const UNIQUE_VIOLATION = "23505";
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function errorChain(error: unknown): unknown[] {
	const chain: unknown[] = [];
	let current: unknown = error;
	while (current && typeof current === "object" && chain.length < 6) {
		chain.push(current);
		current = (current as { cause?: unknown }).cause;
	}
	return chain;
}

function hasCode(error: unknown, code: string): boolean {
	return errorChain(error).some((entry) => {
		const value = entry as {
			code?: unknown;
			originalCode?: unknown;
			meta?: { code?: unknown; driverAdapterError?: unknown };
		};
		return (
			value.code === code ||
			value.originalCode === code ||
			value.meta?.code === code ||
			(value.meta?.driverAdapterError !== undefined &&
				hasCode(value.meta.driverAdapterError, code))
		);
	});
}

export function isExclusionViolation(error: unknown): boolean {
	return hasCode(error, EXCLUSION_VIOLATION);
}

export function isUniqueViolation(error: unknown): boolean {
	return hasCode(error, UNIQUE_VIOLATION) || hasCode(error, "P2002");
}

export function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}
