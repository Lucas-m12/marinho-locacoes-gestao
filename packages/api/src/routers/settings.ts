import { api, depsOf, requirePermission } from "../procedures";
import { getSettings, updateSettings } from "../services/settings";

export const settings = {
	get: api.settings.get.handler(({ context }) => getSettings(depsOf(context))),
	update: api.settings.update
		.use(requirePermission("settings:manage"))
		.handler(({ context, input }) => updateSettings(depsOf(context), input)),
};
