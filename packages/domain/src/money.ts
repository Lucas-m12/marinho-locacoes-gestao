const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

function formatAbsolute(cents: number): { reais: string; decimals: string } {
	const absolute = Math.abs(Math.trunc(cents));
	const reais = Math.floor(absolute / 100)
		.toString()
		.replace(THOUSANDS, ".");
	const decimals = (absolute % 100).toString().padStart(2, "0");
	return { reais, decimals };
}

export function formatBRL(cents: number): string {
	const { reais, decimals } = formatAbsolute(cents);
	const sign = cents < 0 ? "- " : "";
	return `${sign}R$ ${reais},${decimals}`;
}

export function formatBRLShort(cents: number): string {
	const { reais, decimals } = formatAbsolute(cents);
	const sign = cents < 0 ? "- " : "";
	const suffix = decimals === "00" ? "" : `,${decimals}`;
	return `${sign}R$ ${reais}${suffix}`;
}

export function sumCents(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

export function percentOfCents(cents: number, percent: number): number {
	return Math.round((cents * percent) / 100);
}

export function parseBRLToCents(input: string): number | null {
	const cleaned = input.replace(/R\$/g, "").replace(/\s/g, "");
	if (cleaned === "") return null;
	const hasComma = cleaned.includes(",");
	const normalized = hasComma
		? cleaned.replace(/\./g, "").replace(",", ".")
		: cleaned.replace(/\.(?=\d{3}(\D|$))/g, "");
	if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
	const [whole = "0", fraction = ""] = normalized.split(".");
	return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function centsToInput(cents: number | null): string {
	if (cents === null) return "";
	const { reais, decimals } = formatAbsolute(cents);
	const plain = reais.replace(/\./g, "");
	return decimals === "00" ? plain : `${plain},${decimals}`;
}
