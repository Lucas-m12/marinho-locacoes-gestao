import { dashboardToday } from "@marinho-gestao/read-model";
import type { ServiceDeps } from "./deps";
import { HOLDING_RENTALS } from "./scopes";
import { loadSnapshot } from "./snapshot";

export { dashboardSummary } from "./money";

export async function today(deps: ServiceDeps) {
	const snapshot = await loadSnapshot(deps.db, {
		rentals: HOLDING_RENTALS,
		activeCatalogOnly: true,
	});
	return dashboardToday(snapshot, deps.clock());
}
