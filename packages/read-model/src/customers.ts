import type { Customer } from "@marinho-gestao/contract";
import { type CustomerSegment, matchesSearch } from "@marinho-gestao/domain";
import type { Snapshot } from "./records";
import { customerView } from "./views";

function matchesSegment(customer: Customer, segment: CustomerSegment): boolean {
	if (segment === "PROFESSIONALS") return customer.kind !== "INDIVIDUAL";
	if (segment === "HOME_RENOVATION") return customer.kind === "INDIVIDUAL";
	if (segment === "ATTENTION") {
		return customer.tier === "ATTENTION" || customer.tier === "BLOCKED";
	}
	return true;
}

export function listCustomers(
	db: Snapshot,
	input: { q?: string; segment?: CustomerSegment },
	now: Date,
) {
	const matching = db.customers
		.map((customer) => customerView(db, customer, now))
		.filter((customer) =>
			matchesSearch(input.q ?? "", [
				customer.name,
				customer.whatsapp,
				customer.alternatePhone,
				customer.city,
				customer.occupation,
			]),
		);
	const count = (segment: CustomerSegment) =>
		matching.filter((customer) => matchesSegment(customer, segment)).length;
	return {
		customers: matching.filter((customer) =>
			matchesSegment(customer, input.segment ?? "ALL"),
		),
		counts: {
			ALL: matching.length,
			PROFESSIONALS: count("PROFESSIONALS"),
			HOME_RENOVATION: count("HOME_RENOVATION"),
			ATTENTION: count("ATTENTION"),
		},
	};
}
