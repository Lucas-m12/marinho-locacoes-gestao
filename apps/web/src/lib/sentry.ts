import * as Sentry from "@sentry/react";
import { ENV } from "@/env.public";
import { scrubBreadcrumb, scrubEvent } from "./sentry-scrub";

export function initSentry(): boolean {
	if (!ENV.VITE_SENTRY_DSN) return false;
	Sentry.init({
		dsn: ENV.VITE_SENTRY_DSN,
		release: ENV.VITE_SENTRY_RELEASE || undefined,
		environment: ENV.VITE_SENTRY_ENVIRONMENT || "production",
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			stackFrameVariables: false,
		},
		beforeBreadcrumb: scrubBreadcrumb,
		beforeSend: scrubEvent,
	});
	return true;
}

export const reactErrorHandler = Sentry.reactErrorHandler;
