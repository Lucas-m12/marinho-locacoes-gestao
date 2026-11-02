export const CODE_PADDING = { LOC: 4, OS: 3, MAR: 3 } as const;

export type CodePrefix = keyof typeof CODE_PADDING;

export function formatCode(prefix: CodePrefix, sequence: number): string {
	return `${prefix}-${String(sequence).padStart(CODE_PADDING[prefix], "0")}`;
}

export function codeSequence(prefix: CodePrefix, code: string): number | null {
	const match = new RegExp(`^${prefix}-(\\d+)$`).exec(code);
	return match ? Number(match[1]) : null;
}

export function nextCode(
	prefix: CodePrefix,
	existing: readonly string[],
): string {
	const highest = existing.reduce(
		(max, code) => Math.max(max, codeSequence(prefix, code) ?? 0),
		0,
	);
	return formatCode(prefix, highest + 1);
}
