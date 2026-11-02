import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const DEFAULT_DATA_SOURCE = "mock";

export default defineConfig(({ mode }) => ({
	define: {
		"import.meta.env.VITE_DATA_SOURCE": JSON.stringify(
			process.env.VITE_DATA_SOURCE ??
				loadEnv(mode, process.cwd()).VITE_DATA_SOURCE ??
				DEFAULT_DATA_SOURCE,
		),
	},
	server: {
		port: 3001,
	},
	resolve: {
		tsconfigPaths: true,
	},
	build: {
		target: "es2022",
	},
	plugins: [
		tailwindcss(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		react(),
	],
}));
