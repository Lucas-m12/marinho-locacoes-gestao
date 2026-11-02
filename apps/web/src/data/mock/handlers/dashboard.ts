import { dashboardSummary, dashboardToday } from "@marinho-gestao/read-model";
import { api, requirePermission, requireUser } from "../base";
import { mockNow } from "../clock";
import { getDb } from "../db";

export const dashboard = {
	today: api.dashboard.today.handler(({ context }) => {
		requireUser(context);
		return dashboardToday(getDb(), mockNow());
	}),

	summary: api.dashboard.summary.handler(({ context, input }) => {
		requirePermission(context, "money:read");
		return dashboardSummary(getDb(), input);
	}),
};
