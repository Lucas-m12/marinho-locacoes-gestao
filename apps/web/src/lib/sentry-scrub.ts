import type { Breadcrumb, ErrorEvent } from "@sentry/react";

const URL_KEYS = ["url", "from", "to"] as const;
const KEPT_HEADERS = new Set(["user-agent"]);

export function withoutQuery(url: string): string {
	const end = url.search(/[?#]/);
	return end === -1 ? url : url.slice(0, end);
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
	if (breadcrumb.category === "console") return null;
	if (!breadcrumb.data) return breadcrumb;
	const data = { ...breadcrumb.data };
	for (const key of URL_KEYS) {
		const value = data[key];
		if (typeof value === "string") data[key] = withoutQuery(value);
	}
	return { ...breadcrumb, data };
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
	const { request, user: _user, ...rest } = event;
	if (!request) return rest;
	const headers = Object.fromEntries(
		Object.entries(request.headers ?? {}).filter(([name]) =>
			KEPT_HEADERS.has(name.toLowerCase()),
		),
	);
	return {
		...rest,
		request: {
			method: request.method,
			url: request.url ? withoutQuery(request.url) : undefined,
			headers,
		},
	};
}
