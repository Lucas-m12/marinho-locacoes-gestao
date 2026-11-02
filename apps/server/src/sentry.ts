import type { ErrorEvent } from "@sentry/bun";
import * as Sentry from "@sentry/bun";

const KEPT_HEADERS = new Set(["user-agent", "content-type"]);

export type SentryEnv = {
	SENTRY_DSN?: string;
	GIT_SHA?: string;
	NODE_ENV: string;
};

function withoutQuery(url: string): string {
	const end = url.search(/[?#]/);
	return end === -1 ? url : url.slice(0, end);
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

export function initSentry(env: SentryEnv, component: "api" | "jobs"): boolean {
	if (!env.SENTRY_DSN) return false;
	Sentry.init({
		dsn: env.SENTRY_DSN,
		release: env.GIT_SHA && env.GIT_SHA !== "dev" ? env.GIT_SHA : undefined,
		environment: env.NODE_ENV,
		serverName: component,
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			databaseQueryData: false,
			stackFrameVariables: false,
		},
		beforeSend: scrubEvent,
	});
	Sentry.setTag("component", component);
	return true;
}

export function reportError(error: unknown, tags: Record<string, string> = {}) {
	Sentry.captureException(error, { tags });
}

export function flushSentry(): Promise<boolean> {
	return Sentry.flush(2_000);
}
