import type { Prisma } from "@marinho-gestao/db";
import {
	BOOKING_RENTAL_STATUSES,
	OCCUPYING_RENTAL_STATUSES,
} from "@marinho-gestao/domain";

export const HOLDING_RENTALS: Prisma.RentalWhereInput = {
	status: { in: [...BOOKING_RENTAL_STATUSES] },
};

/** Devolvidas e encerradas: o equipamento já voltou. */
export const FINISHED_RENTALS: Prisma.RentalWhereInput = {
	status: { in: ["RETURNED", "CLOSED"] },
};

/** Tudo o que tirou o equipamento da base, inclusive o que já voltou. */
export const OCCUPYING_RENTALS: Prisma.RentalWhereInput = {
	status: { in: [...OCCUPYING_RENTAL_STATUSES] },
};

export const ALL_RENTALS: Prisma.RentalWhereInput = {};
