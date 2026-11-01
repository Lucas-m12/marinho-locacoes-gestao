import type { Customer } from "@marinho-gestao/contract";
import { type CustomerSegment, matchesSearch } from "@marinho-gestao/domain";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import { type CustomerRecord, getDb, nextId } from "../db";
import {
	customerDetail,
	customerDocumentView,
	customerView,
	requireCustomer,
} from "../views";

function matchesSegment(customer: Customer, segment: CustomerSegment): boolean {
	if (segment === "PROFESSIONALS") return customer.kind !== "INDIVIDUAL";
	if (segment === "HOME_RENOVATION") return customer.kind === "INDIVIDUAL";
	if (segment === "ATTENTION") {
		return customer.tier === "ATTENTION" || customer.tier === "BLOCKED";
	}
	return true;
}

export const customers = {
	list: api.customers.list.handler(({ context, input }) => {
		requirePermission(context, "customers:read");
		const db = getDb();
		const now = mockNow();
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
			)
			.sort((a, b) => b.stats.rentalCount - a.stats.rentalCount);
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
	}),

	get: api.customers.get.handler(({ context, input }) => {
		requirePermission(context, "customers:read");
		const db = getDb();
		return customerDetail(db, requireCustomer(db, input.id), mockNow());
	}),

	create: api.customers.create.handler(({ context, input }) => {
		requirePermission(context, "customers:write");
		const db = getDb();
		const now = mockNow();
		const customer: CustomerRecord = {
			...input,
			id: nextId(db, "c"),
			blockedManually: false,
			blockReason: null,
			createdAt: now.toISOString(),
			documents: [],
		};
		db.customers.push(customer);
		return customerView(db, customer, now);
	}),

	update: api.customers.update.handler(({ context, input }) => {
		requirePermission(context, "customers:write");
		const db = getDb();
		const customer = requireCustomer(db, input.id);
		const { id: _id, ...changes } = input;
		Object.assign(
			customer,
			Object.fromEntries(
				Object.entries(changes).filter(([, value]) => value !== undefined),
			),
		);
		return customerView(db, customer, mockNow());
	}),

	addDocument: api.customers.addDocument.handler(({ context, input }) => {
		requirePermission(context, "customers:write");
		const db = getDb();
		const customer = requireCustomer(db, input.customerId);
		const document = {
			id: nextId(db, "doc"),
			kind: input.kind,
			receivedAt: mockNow().toISOString(),
			fileKey: input.fileKey,
		};
		customer.documents.push(document);
		return customerDocumentView(db, document);
	}),
};
