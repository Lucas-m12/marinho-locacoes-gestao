import { defineConfig, devices } from "@playwright/test";
import { IS_MOCK, SERVER_URL, storageStateOf, WEB_URL } from "./support/env";

const CI = Boolean(process.env.CI);
const VISUAL_CAPTURE = process.env.E2E_VISUAL_CAPTURE === "1";

const shared = {
	browserName: "chromium" as const,
	deviceScaleFactor: 1,
	locale: "pt-BR",
	timezoneId: "America/Maceio",
	contextOptions: { reducedMotion: "reduce" as const },
};

const webServer = [
	{
		command: "bun scripts/start-web.ts",
		url: WEB_URL,
		reuseExistingServer: !CI,
		timeout: 240_000,
		gracefulShutdown: { signal: "SIGTERM" as const, timeout: 5_000 },
	},
];
if (!IS_MOCK) {
	webServer.unshift({
		command: "bun scripts/start-server.ts",
		url: `${SERVER_URL}/health`,
		reuseExistingServer: !CI,
		timeout: 240_000,
		gracefulShutdown: { signal: "SIGTERM" as const, timeout: 5_000 },
	});
}

export default defineConfig({
	testDir: "./tests",
	testIgnore: VISUAL_CAPTURE ? [] : ["**/visual/captura.spec.ts"],
	testMatch: VISUAL_CAPTURE ? ["**/visual/captura.spec.ts"] : undefined,
	outputDir: "./test-results",
	snapshotPathTemplate:
		"{testDir}/visual/__screenshots__/{projectName}/{arg}{ext}",
	workers: 1,
	fullyParallel: false,
	forbidOnly: CI,
	retries: CI ? 1 : 0,
	timeout: 60_000,
	expect: {
		timeout: 10_000,
		toHaveScreenshot: {
			maxDiffPixelRatio: 0.01,
			animations: "disabled",
			caret: "hide",
			scale: "css",
		},
	},
	reporter: CI
		? [["github"], ["list"], ["html", { open: "never" }]]
		: [["list"], ["html", { open: "never" }]],
	globalSetup: "./support/global-setup.ts",
	use: {
		baseURL: WEB_URL,
		storageState: storageStateOf("lucas"),
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		actionTimeout: 15_000,
		navigationTimeout: 30_000,
	},
	projects: [
		{
			name: "desktop",
			use: {
				...devices["Desktop Chrome"],
				...shared,
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: "tablet",
			use: {
				...shared,
				viewport: { width: 834, height: 1194 },
				hasTouch: true,
				isMobile: false,
			},
		},
		{
			name: "celular",
			use: {
				...shared,
				viewport: { width: 390, height: 844 },
				isMobile: true,
				hasTouch: true,
			},
		},
	],
	webServer,
});
