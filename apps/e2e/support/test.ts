import {
	type BrowserContext,
	type BrowserContextOptions,
	test as base,
	expect,
} from "@playwright/test";
import {
	ALLOWED_HOSTS,
	IS_MOCK,
	REFERENCE_NOW,
	storageStateOf,
	type Username,
} from "./env";
import { resetServer, setServerClock } from "./server";

export { expect };

export type Guards = {
	allow: (pattern: RegExp) => void;
	watch: (context: BrowserContext) => void;
};

export type OpenContext = (
	storageState: BrowserContextOptions["storageState"],
) => Promise<BrowserContext>;

export type Clock = {
	set: (instant: string | Date) => Promise<void>;
	advanceHours: (hours: number) => Promise<Date>;
};

const EXPECTED_CLIENT_ERROR =
	/^Failed to load resource: the server responded with a status of 4\d\d/;

let lastResetKey: string | null = null;

export const test = base.extend<{
	guards: Guards;
	resetPerFile: undefined;
	clock: Clock;
	openContext: OpenContext;
}>({
	context: async ({ context }, use) => {
		await context.clock.setFixedTime(new Date(REFERENCE_NOW));
		await use(context);
	},

	resetPerFile: [
		// biome-ignore lint/correctness/noEmptyPattern: o Playwright exige o objeto de fixtures
		async ({}, use, testInfo) => {
			const key = `${testInfo.project.name}:${testInfo.file}`;
			if (!IS_MOCK && lastResetKey !== key) {
				await resetServer(REFERENCE_NOW);
				lastResetKey = key;
			}
			await use(undefined);
		},
		{ auto: true },
	],

	guards: [
		async ({ context }, use, testInfo) => {
			const problems: string[] = [];
			const allowed: RegExp[] = [];
			const watched = new WeakSet<BrowserContext>();

			const watch = (target: BrowserContext) => {
				if (watched.has(target)) return;
				watched.add(target);
				target.on("console", (message) => {
					if (message.type() !== "error") return;
					const text = message.text();
					if (EXPECTED_CLIENT_ERROR.test(text)) return;
					problems.push(`erro no console: ${text}`);
				});
				target.on("weberror", (error) =>
					problems.push(`pageerror: ${error.error().message}`),
				);
				target.on("response", (response) => {
					if (response.status() >= 500) {
						problems.push(
							`resposta ${response.status()}: ${response.request().method()} ${response.url()}`,
						);
					}
				});
				target.on("request", (request) => {
					const url = new URL(request.url());
					if (!url.protocol.startsWith("http")) return;
					if (!ALLOWED_HOSTS.has(url.hostname)) {
						problems.push(`requisição para fora de localhost: ${url.href}`);
					}
				});
			};

			watch(context);
			await use({ allow: (pattern) => allowed.push(pattern), watch });

			const unexpected = problems.filter(
				(problem) => !allowed.some((pattern) => pattern.test(problem)),
			);
			if (unexpected.length > 0) {
				testInfo.annotations.push({
					type: "guardas",
					description: unexpected.join("\n"),
				});
				throw new Error(
					`Guardas do E2E encontraram problemas:\n- ${unexpected.join("\n- ")}`,
				);
			}
		},
		{ auto: true },
	],

	openContext: async ({ browser, guards }, use, testInfo) => {
		const opened: BrowserContext[] = [];
		const project = testInfo.project.use;
		await use(async (storageState) => {
			const context = await browser.newContext({
				baseURL: project.baseURL,
				viewport: project.viewport,
				isMobile: project.isMobile,
				hasTouch: project.hasTouch,
				deviceScaleFactor: project.deviceScaleFactor,
				locale: project.locale,
				timezoneId: project.timezoneId,
				reducedMotion: "reduce",
				storageState,
			});
			await context.clock.setFixedTime(new Date(REFERENCE_NOW));
			guards.watch(context);
			opened.push(context);
			return context;
		});
		for (const context of opened) await context.close();
	},

	clock: async ({ context }, use) => {
		let current = new Date(REFERENCE_NOW);
		await use({
			async set(instant) {
				current = new Date(instant);
				if (!IS_MOCK) await setServerClock(current);
				await context.clock.setFixedTime(current);
			},
			async advanceHours(hours) {
				current = new Date(current.getTime() + hours * 3_600_000);
				if (!IS_MOCK) await setServerClock(current);
				await context.clock.setFixedTime(current);
				return current;
			},
		});
		if (!IS_MOCK) await setServerClock(REFERENCE_NOW);
	},
});

export function as(username: Username) {
	return { storageState: storageStateOf(username) };
}

export const signedOut = {
	storageState: { cookies: [], origins: [] },
};

export function needsServer(reason: string): void {
	test.skip(IS_MOCK, `Só contra o servidor real: ${reason}`);
}

export function onlyProjects(...names: string[]): void {
	// biome-ignore lint/correctness/noEmptyPattern: o Playwright exige o objeto de fixtures
	test.beforeEach(({}, testInfo) => {
		test.skip(
			!names.includes(testInfo.project.name),
			`Só em ${names.join(", ")}`,
		);
	});
}
