import { api, depsOf, requirePermission } from "../procedures";
import * as service from "../services/equipment";

const read = requirePermission("units:read");
const operate = requirePermission("units:operate");
const catalog = requirePermission("catalog:manage");

export const equipment = {
	listTypes: api.equipment.listTypes.handler(({ context }) =>
		service.listTypes(depsOf(context)),
	),
	listUnits: api.equipment.listUnits
		.use(read)
		.handler(({ context, input }) => service.listUnits(depsOf(context), input)),
	getUnit: api.equipment.getUnit
		.use(read)
		.handler(({ context, input }) =>
			service.getUnit(depsOf(context), input.code),
		),
	createType: api.equipment.createType
		.use(catalog)
		.handler(({ context, input }) =>
			service.createType(depsOf(context), input),
		),
	updateType: api.equipment.updateType
		.use(catalog)
		.handler(({ context, input }) =>
			service.updateType(depsOf(context), input),
		),
	createUnit: api.equipment.createUnit
		.use(catalog)
		.handler(({ context, input }) =>
			service.createUnit(depsOf(context), input),
		),
	updateUnit: api.equipment.updateUnit
		.use(catalog)
		.handler(({ context, input }) =>
			service.updateUnit(depsOf(context), input),
		),
	changeUnitStatus: api.equipment.changeUnitStatus
		.use(operate)
		.handler(({ context, input }) =>
			service.changeUnitStatus(depsOf(context), input),
		),
	addUnitPhoto: api.equipment.addUnitPhoto
		.use(operate)
		.handler(({ context, input }) =>
			service.addUnitPhoto(depsOf(context), input),
		),
	addKnownDamage: api.equipment.addKnownDamage
		.use(operate)
		.handler(({ context, input }) =>
			service.addKnownDamage(depsOf(context), input),
		),
	listLots: api.equipment.listLots.handler(({ context }) =>
		service.listLots(depsOf(context)),
	),
	updateLot: api.equipment.updateLot
		.use(catalog)
		.handler(({ context, input }) => service.updateLot(depsOf(context), input)),
};
