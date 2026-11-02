import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.server.test.ts"],
		globalSetup: ["../../packages/api/src/testing/global-setup.ts"],
		fileParallelism: false,
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
});
