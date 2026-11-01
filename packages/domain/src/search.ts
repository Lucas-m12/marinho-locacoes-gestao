export function normalizeSearch(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.trim();
}

export function matchesSearch(
	query: string,
	haystack: readonly (string | null | undefined)[],
): boolean {
	const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
	if (terms.length === 0) return true;
	const target = normalizeSearch(haystack.filter(Boolean).join(" "));
	return terms.every((term) => target.includes(term));
}
