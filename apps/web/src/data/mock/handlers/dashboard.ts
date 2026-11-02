import type {
	AwaitingSignal,
	DashboardMovement,
	OverdueRental,
} from "@marinho-gestao/contract";
import {
	calendarDay,
	endOfZonedDay,
	isRentalOverdue,
	rentalDisplayStatus,
	startOfZonedDay,
	toMs,
	UNIT_STATUSES,
} from "@marinho-gestao/domain";
import { api, requirePermission, requireUser } from "../base";
import { mockNow } from "../clock";
import { getDb, type MockDb, type RentalRecord } from "../db";
import { bookingsFor, lotView } from "../queries";
import { equipmentSummary, itemLabel, requireCustomer } from "../views";
import { cashTotals, depositsHeld } from "./ledger";

function movement(
	db: MockDb,
	rental: RentalRecord,
	at: string,
	now: Date,
): DashboardMovement {
	const customer = requireCustomer(db, rental.customerId);
	return {
		rentalNumber: rental.number,
		at,
		customerName: customer.name,
		city: rental.siteCity ?? customer.city,
		displayStatus: rentalDisplayStatus(rental, now),
		items: rental.items.map((item) => ({
			code: item.code,
			label: itemLabel(db, item),
			unitStatus:
				db.units.find((unit) => unit.code === item.code)?.status ?? null,
		})),
	};
}

function overdueView(
	db: MockDb,
	rental: RentalRecord,
	now: Date,
): OverdueRental {
	const customer = requireCustomer(db, rental.customerId);
	const next = rental.items
		.flatMap((item) => bookingsFor(db, item.code, now, rental.number))
		.filter((booking) => toMs(booking.start) > now.getTime())
		.sort((a, b) => toMs(a.start) - toMs(b.start))[0];
	return {
		rentalNumber: rental.number,
		dueAt: rental.endAt,
		customerName: customer.name,
		city: rental.siteCity ?? customer.city,
		equipment: rental.items.map((item) => itemLabel(db, item)).join(", "),
		nextBooking: next
			? { rentalNumber: next.rental.number, startAt: next.start }
			: null,
	};
}

export const dashboard = {
	today: api.dashboard.today.handler(({ context }) => {
		requireUser(context);
		const db = getDb();
		const now = mockNow();
		const today = calendarDay(now);

		const leaving = db.rentals
			.filter(
				(rental) =>
					["CONFIRMED", "SEPARATED"].includes(rental.status) &&
					calendarDay(rental.startAt) === today,
			)
			.sort((a, b) => toMs(a.startAt) - toMs(b.startAt))
			.map((rental) => movement(db, rental, rental.startAt, now));

		const returning = db.rentals
			.filter(
				(rental) =>
					rental.status === "ON_SITE" && calendarDay(rental.endAt) === today,
			)
			.sort((a, b) => toMs(a.endAt) - toMs(b.endAt))
			.map((rental) => movement(db, rental, rental.endAt, now));

		const overdue = db.rentals
			.filter(
				(rental) =>
					isRentalOverdue(rental, now) && calendarDay(rental.endAt) !== today,
			)
			.map((rental) => overdueView(db, rental, now));

		const awaitingSignal: AwaitingSignal[] = db.rentals
			.filter(
				(rental) =>
					rental.status === "AWAITING_DEPOSIT" && rental.signalDueAt !== null,
			)
			.sort((a, b) => toMs(a.signalDueAt ?? "") - toMs(b.signalDueAt ?? ""))
			.map((rental) => {
				const customer = requireCustomer(db, rental.customerId);
				return {
					rentalNumber: rental.number,
					equipment: equipmentSummary(db, rental),
					customerName: customer.name,
					city: rental.siteCity ?? customer.city,
					startAt: rental.startAt,
					signalDueAt: rental.signalDueAt ?? rental.startAt,
				};
			});

		const units = db.units.filter((unit) => unit.status !== "RETIRED");
		const unitCounts = UNIT_STATUSES.map((status) => ({
			status,
			count: units.filter((unit) => unit.status === status).length,
		})).filter((entry) => entry.count > 0);

		const scaffoldLot = db.lots.find((lot) => lot.pricing === "PER_PIECE");
		const scaffold = scaffoldLot ? lotView(db, scaffoldLot, now) : null;
		const dayStart = startOfZonedDay(now);
		const dayEnd = endOfZonedDay(now);

		return {
			now: now.toISOString(),
			overdue,
			leaving,
			returning,
			unitCounts,
			unitTotal: units.length,
			scaffold: scaffold
				? {
						total: scaffold.total,
						free: scaffold.freeToday,
						reserved: scaffold.reservedToday,
						rentalNumbers: bookingsFor(db, scaffold.code, now)
							.filter(
								(booking) =>
									toMs(booking.start) < toMs(dayEnd) &&
									toMs(booking.end) > toMs(dayStart),
							)
							.map((booking) => booking.rental.number),
					}
				: null,
			awaitingSignal,
		};
	}),

	summary: api.dashboard.summary.handler(({ context, input }) => {
		requirePermission(context, "money:read");
		const db = getDb();
		const held = depositsHeld(db);
		return {
			...cashTotals(db, input.from, input.to),
			depositHeldCents: held.heldCents,
			depositHeldRentalCount: held.heldRentalCount,
		};
	}),
};
