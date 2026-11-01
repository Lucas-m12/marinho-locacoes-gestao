import type { AppClient } from "@marinho-gestao/contract";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { ENV } from "@/env.public";

export function createHttpClient(): AppClient {
	const link = new RPCLink({
		url: `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/rpc`,
		fetch(url, options) {
			return fetch(url, { ...options, credentials: "include" });
		},
	});
	return createORPCClient(link);
}
