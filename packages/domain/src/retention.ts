import { addHours, type DateInput, toMs } from "./dates";

export const DEFAULT_DOCUMENT_RETENTION_MONTHS = 24;
export const PENDING_UPLOAD_TTL_HOURS = 24;

export type CustomerActivity = {
	createdAt: DateInput;
	rentals: readonly {
		createdAt: DateInput;
		endsAt: DateInput;
		returnedAt: DateInput | null;
		closedAt: DateInput | null;
	}[];
};

export function subtractMonths(value: DateInput, months: number): Date {
	const date = new Date(toMs(value));
	const day = date.getUTCDate();
	date.setUTCDate(1);
	date.setUTCMonth(date.getUTCMonth() - months);
	const lastDay = new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
	).getUTCDate();
	date.setUTCDate(Math.min(day, lastDay));
	return date;
}

export function lastCustomerActivity(customer: CustomerActivity): Date {
	const instants = [
		toMs(customer.createdAt),
		...customer.rentals.flatMap((rental) =>
			[rental.createdAt, rental.endsAt, rental.returnedAt, rental.closedAt]
				.filter((value): value is DateInput => value !== null)
				.map(toMs),
		),
	];
	return new Date(Math.max(...instants));
}

export function documentRetentionCutoff(
	now: DateInput,
	retentionMonths: number,
): Date {
	return subtractMonths(now, retentionMonths);
}

export function isDocumentRetentionOver(
	document: { receivedAt: DateInput },
	customer: CustomerActivity,
	now: DateInput,
	retentionMonths: number,
): boolean {
	const cutoff = toMs(documentRetentionCutoff(now, retentionMonths));
	return (
		toMs(document.receivedAt) < cutoff &&
		lastCustomerActivity(customer).getTime() < cutoff
	);
}

export function pendingUploadCutoff(now: DateInput): Date {
	return addHours(now, -PENDING_UPLOAD_TTL_HOURS);
}
