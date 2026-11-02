import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "./src/index.ts",
		jobs: "./src/jobs/main.ts",
		seed: "../../packages/db/prisma/seed.ts",
	},
	format: "esm",
	outDir: "./dist",
	clean: true,
	deps: {
		alwaysBundle: [/@marinho-gestao\/.*/],
	},
});
