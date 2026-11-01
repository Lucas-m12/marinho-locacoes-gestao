import type { z } from "zod";

export function validateWith(schema: z.ZodType) {
	return ({ value }: { value: unknown }) => {
		const result = schema.safeParse(value);
		if (result.success) return undefined;
		const fields: Record<string, string> = {};
		for (const issue of result.error.issues) {
			const path = issue.path.join(".");
			fields[path] ??= issue.message;
		}
		return { fields };
	};
}
