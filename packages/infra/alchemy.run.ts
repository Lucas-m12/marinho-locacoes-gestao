import * as Cloudflare from "@alchemy.run/cloudflare";
import * as Alchemy from "alchemy";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import "varlock/auto-load";

const PRODUCTION_STAGE = "prod";
const APP_DOMAIN = "sistema.marinholocacoes.com";
const API_URL = "https://api.marinholocacoes.com";

const optional = (name: string) =>
	Config.String(name).pipe(Config.withDefault(""));

export default Alchemy.Stack(
	"marinho-gestao",
	{
		providers: Cloudflare.providers(),
		state: Cloudflare.state(),
	},
	Effect.gen(function* () {
		const stage = yield* Alchemy.Stage;
		const isProduction = stage === PRODUCTION_STAGE;

		const webWorker = yield* Cloudflare.Website.Vite("web", {
			rootDir: "../../apps/web",
			domain: isProduction ? APP_DOMAIN : undefined,
			assets: {
				htmlHandling: "auto-trailing-slash",
				notFoundHandling: "single-page-application",
			},
			env: {
				VITE_DATA_SOURCE: "http",
				VITE_SERVER_URL: API_URL,
				VITE_SENTRY_DSN: optional("VITE_SENTRY_DSN"),
				VITE_SENTRY_RELEASE: optional("VITE_SENTRY_RELEASE"),
				VITE_SENTRY_ENVIRONMENT: stage,
			},
			dev: {
				port: 3001,
			},
		});

		return {
			web: webWorker.url,
		};
	}),
);
