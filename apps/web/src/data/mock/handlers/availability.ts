import {
	availabilityCalendar,
	searchAvailability,
} from "@marinho-gestao/read-model";
import { api, requireUser } from "../base";
import { mockNow } from "../clock";
import { getDb } from "../db";

export const availability = {
	search: api.availability.search.handler(({ context, input }) => {
		requireUser(context);
		return searchAvailability(getDb(), input, mockNow());
	}),

	calendar: api.availability.calendar.handler(({ context, input }) => {
		requireUser(context);
		return availabilityCalendar(getDb(), input, mockNow());
	}),
};
