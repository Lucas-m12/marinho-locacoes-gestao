export const INTERNAL_EMAIL_DOMAIN = "marinho.local";

export function internalEmail(username: string): string {
	return `${username}@${INTERNAL_EMAIL_DOMAIN}`;
}
