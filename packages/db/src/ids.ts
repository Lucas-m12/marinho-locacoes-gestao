import { createHash } from "node:crypto";

export function stableUuid(text: string): string {
	const hex = createHash("sha256").update(text).digest("hex");
	const variant = (
		(Number.parseInt(hex.slice(16, 17), 16) & 0x3) |
		0x8
	).toString(16);
	return [
		hex.slice(0, 8),
		hex.slice(8, 12),
		`5${hex.slice(13, 16)}`,
		`${variant}${hex.slice(17, 20)}`,
		hex.slice(20, 32),
	].join("-");
}
