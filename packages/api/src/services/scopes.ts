import type { Prisma } from "@marinho-gestao/db";
import { BOOKING_RENTAL_STATUSES } from "@marinho-gestao/domain";

export const HOLDING_RENTALS: Prisma.RentalWhereInput = {
	status: { in: [...BOOKING_RENTAL_STATUSES] },
};

export const ALL_RENTALS: Prisma.RentalWhereInput = {};
