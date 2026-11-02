import { api, depsOf } from "../procedures";
import { calendar, search } from "../services/availability";

export const availability = {
	search: api.availability.search.handler(({ context, input }) =>
		search(depsOf(context), input),
	),
	calendar: api.availability.calendar.handler(({ context, input }) =>
		calendar(depsOf(context), input),
	),
};
