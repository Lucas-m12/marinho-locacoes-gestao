import type {
	AvailabilitySearchInput,
	CalendarInput,
} from "@marinho-gestao/contract";
import {
	availabilityCalendar,
	searchAvailability,
} from "@marinho-gestao/read-model";
import type { z } from "zod";
import type { ServiceDeps } from "./deps";
import { HOLDING_RENTALS } from "./scopes";
import { loadSnapshot } from "./snapshot";

async function bookingSnapshot(deps: ServiceDeps) {
	return loadSnapshot(deps.db, {
		rentals: HOLDING_RENTALS,
		activeCatalogOnly: true,
	});
}

export async function search(
	deps: ServiceDeps,
	input: z.output<typeof AvailabilitySearchInput>,
) {
	return searchAvailability(await bookingSnapshot(deps), input, deps.clock());
}

export async function calendar(
	deps: ServiceDeps,
	input: z.output<typeof CalendarInput>,
) {
	return availabilityCalendar(await bookingSnapshot(deps), input, deps.clock());
}
