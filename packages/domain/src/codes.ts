export const CODE_PADDING = { LOC: 4, OS: 3, MAR: 3 } as const;

export type CodePrefix = keyof typeof CODE_PADDING;

export function nextCode(
	prefix: CodePrefix,
	existing: readonly string[],
): string {
	const pattern = new RegExp(`^${prefix}-(\\d+)$`);
	const highest = existing.reduce((max, code) => {
		const match = pattern.exec(code);
		return match ? Math.max(max, Number(match[1])) : max;
	}, 0);
	const sequence = String(highest + 1).padStart(CODE_PADDING[prefix], "0");
	return `${prefix}-${sequence}`;
}
