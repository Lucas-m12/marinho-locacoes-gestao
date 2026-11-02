import { api, depsOf, requirePermission } from "../procedures";
import * as service from "../services/inspections";

const run = requirePermission("inspections:run");

export const inspections = {
	get: api.inspections.get
		.use(run)
		.handler(({ context, input }) =>
			service.getInspection(depsOf(context), input),
		),
	saveItem: api.inspections.saveItem
		.use(run)
		.handler(({ context, input }) =>
			service.saveInspectionItem(depsOf(context), input),
		),
	attachMedia: api.inspections.attachMedia
		.use(run)
		.handler(({ context, input }) =>
			service.attachInspectionMedia(depsOf(context), input),
		),
	complete: api.inspections.complete
		.use(run)
		.handler(({ context, input }) =>
			service.completeInspection(depsOf(context), input),
		),
};
