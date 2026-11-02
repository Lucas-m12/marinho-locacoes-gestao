import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		exclude: ["src/**/*.server.test.ts", "node_modules/**"],
	},
});
