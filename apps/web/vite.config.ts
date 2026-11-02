import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const DEFAULT_DATA_SOURCE = "mock";

function assertProductionBuild(dataSource: string, serverUrl: string): void {
	if (dataSource !== "http") {
		throw new Error(
			`O build de produção não pode usar VITE_DATA_SOURCE=${dataSource}: o mock nunca vai para produção. ` +
				"Use VITE_DATA_SOURCE=http e VITE_SERVER_URL=https://api.marinholocacoes.com.",
		);
	}
	if (!serverUrl) {
		throw new Error(
			"O build de produção com VITE_DATA_SOURCE=http precisa de VITE_SERVER_URL.",
		);
	}
}

export default defineConfig(({ command, mode }) => {
	const fileEnv = loadEnv(mode, process.cwd());
	const dataSource =
		process.env.VITE_DATA_SOURCE ??
		fileEnv.VITE_DATA_SOURCE ??
		DEFAULT_DATA_SOURCE;
	if (command === "build" && mode === "production") {
		assertProductionBuild(
			dataSource,
			process.env.VITE_SERVER_URL ?? fileEnv.VITE_SERVER_URL ?? "",
		);
	}

	return {
		define: {
			"import.meta.env.VITE_DATA_SOURCE": JSON.stringify(dataSource),
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
	};
});
