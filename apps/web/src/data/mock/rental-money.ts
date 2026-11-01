import {
	countDailies,
	quoteTotals,
	rentalBalanceCents,
	sumCents,
} from "@marinho-gestao/domain";
import type { MockDb, RentalItemRecord, RentalRecord } from "./db";

export function itemTablePrice(
	db: MockDb,
	item: Pick<RentalItemRecord, "kind" | "code">,
): { dailyPriceCents: number | null; depositCents: number | null } {
	if (item.kind === "LOT") {
		const lot = db.lots.find((entry) => entry.code === item.code);
		return {
			dailyPriceCents: lot?.dailyPriceCents ?? null,
			depositCents: lot?.depositCents ?? null,
		};
	}
	const unit = db.units.find((entry) => entry.code === item.code);
	const type = db.types.find((entry) => entry.id === unit?.typeId);
	return {
		dailyPriceCents: type?.dailyPriceCents ?? null,
		depositCents: type?.depositCents ?? null,
	};
}

export function itemPrice(
	db: MockDb,
	rental: Pick<RentalRecord, "priceFrozenAt">,
	item: RentalItemRecord,
): { dailyPriceCents: number | null; depositCents: number | null } {
	if (rental.priceFrozenAt) {
		return {
			dailyPriceCents: item.frozenDailyPriceCents,
			depositCents: item.frozenDepositCents,
		};
	}
	return itemTablePrice(db, item);
}

export function rentalTotals(
	db: MockDb,
	rental: Pick<
		RentalRecord,
		| "priceFrozenAt"
		| "items"
		| "startAt"
		| "endAt"
		| "deliveryFeeCents"
		| "discountCents"
	>,
) {
	const dailies = countDailies(rental.startAt, rental.endAt);
	return {
		dailies,
		...quoteTotals({
			items: rental.items.map((item) => ({
				...itemPrice(db, rental, item),
				dailies,
				pieces: item.quantity,
			})),
			deliveryFeeCents: rental.deliveryFeeCents,
			discountCents: rental.discountCents,
		}),
	};
}

export function rentalTotalCents(db: MockDb, rental: RentalRecord): number {
	return rentalTotals(db, rental).totalCents;
}

export function rentalChargesCents(rental: RentalRecord): number {
	return sumCents(
		rental.occurrences
			.filter((occurrence) => occurrence.decision === "CHARGE")
			.map((occurrence) => occurrence.amountCents),
	);
}

export function rentalBalance(db: MockDb, rental: RentalRecord): number {
	return rentalBalanceCents({
		totalCents: rentalTotalCents(db, rental),
		chargesCents: Math.max(
			0,
			rentalChargesCents(rental) - rental.deposit.retainedCents,
		),
		payments: rental.payments,
	});
}
