import { api, depsOf, requirePermission } from "../procedures";
import { dashboardSummary, today } from "../services/dashboard";

export const dashboard = {
	today: api.dashboard.today.handler(({ context }) => today(depsOf(context))),
	summary: api.dashboard.summary
		.use(requirePermission("money:read"))
		.handler(({ context, input }) => dashboardSummary(depsOf(context), input)),
};
