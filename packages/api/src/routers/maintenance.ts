import { api, depsOf, requirePermission } from "../procedures";
import * as service from "../services/maintenance";

const write = requirePermission("maintenance:write");

export const maintenance = {
	list: api.maintenance.list
		.use(requirePermission("maintenance:read"))
		.handler(({ context }) => service.listMaintenance(depsOf(context))),
	open: api.maintenance.open
		.use(write)
		.handler(({ context, input }) =>
			service.openMaintenance(depsOf(context), input),
		),
	complete: api.maintenance.complete
		.use(write)
		.handler(({ context, input }) =>
			service.completeMaintenance(depsOf(context), input),
		),
};
