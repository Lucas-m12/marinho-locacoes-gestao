import { api, depsOf, requirePermission } from "../procedures";
import * as service from "../services/rentals";

const read = requirePermission("rentals:read");
const sell = requirePermission("rentals:sell");

export const rentals = {
	list: api.rentals.list
		.use(read)
		.handler(({ context, input }) =>
			service.listRentals(depsOf(context), input),
		),
	get: api.rentals.get
		.use(read)
		.handler(({ context, input }) =>
			service.getRental(depsOf(context), input.number),
		),
	createQuote: api.rentals.createQuote
		.use(sell)
		.handler(({ context, input }) =>
			service.createQuote(depsOf(context), input),
		),
	sendQuote: api.rentals.sendQuote
		.use(sell)
		.handler(({ context, input }) =>
			service.sendQuote(depsOf(context), input.number),
		),
	recordPayment: api.rentals.recordPayment
		.use(requirePermission("money:write"))
		.handler(({ context, input }) =>
			service.recordPayment(depsOf(context), input),
		),
	confirm: api.rentals.confirm
		.use(sell)
		.handler(({ context, input }) =>
			service.confirmRental(depsOf(context), input.number),
		),
	markSeparated: api.rentals.markSeparated
		.use(requirePermission("rentals:separate"))
		.handler(({ context, input }) =>
			service.markSeparated(depsOf(context), input.number),
		),
	previewExtend: api.rentals.previewExtend
		.use(sell)
		.handler(({ context, input }) =>
			service.previewExtend(depsOf(context), input),
		),
	extend: api.rentals.extend
		.use(sell)
		.handler(({ context, input }) =>
			service.extendRental(depsOf(context), input),
		),
	cancel: api.rentals.cancel
		.use(sell)
		.handler(({ context, input }) =>
			service.cancelRental(depsOf(context), input),
		),
	close: api.rentals.close
		.use(requirePermission("rentals:close"))
		.handler(({ context, input }) =>
			service.closeRental(depsOf(context), input.number),
		),
	copyQuoteText: api.rentals.copyQuoteText
		.use(read)
		.handler(({ context, input }) =>
			service.copyQuoteText(depsOf(context), input.number),
		),
	recordLostDemand: api.rentals.recordLostDemand
		.use(requirePermission("lostDemand:write"))
		.handler(({ context, input }) =>
			service.recordLostDemand(depsOf(context), input),
		),
	listLostDemand: api.rentals.listLostDemand
		.use(read)
		.handler(({ context, input }) =>
			service.listLostDemand(depsOf(context), input),
		),
};
