import type {
	AvailabilitySearchInput,
	CalendarInput,
} from "@marinho-gestao/contract";
import { addCalendarDays, zonedTimeToIso } from "@marinho-gestao/domain";
import {
	availabilityCalendar,
	searchAvailability,
} from "@marinho-gestao/read-model";
import type { z } from "zod";
import type { ServiceDeps } from "./deps";
import { FINISHED_RENTALS, HOLDING_RENTALS } from "./scopes";
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

/**
 * A agenda também mostra, nos dias que já passaram, o que foi alugado e já
 * voltou: além das reservas, carrega as locações devolvidas e encerradas que
 * cruzam a janela.
 */
export async function calendar(
	deps: ServiceDeps,
	input: z.output<typeof CalendarInput>,
) {
	const from = new Date(zonedTimeToIso(input.start, "00:00"));
	const to = new Date(
		zonedTimeToIso(addCalendarDays(input.start, input.days), "00:00"),
	);
	const snapshot = await loadSnapshot(deps.db, {
		rentals: {
			OR: [
				HOLDING_RENTALS,
				{
					...FINISHED_RENTALS,
					startsAt: { lt: to },
					OR: [{ endsAt: { gte: from } }, { returnedAt: { gte: from } }],
				},
			],
		},
		activeCatalogOnly: true,
	});
	return availabilityCalendar(snapshot, input, deps.clock());
}
