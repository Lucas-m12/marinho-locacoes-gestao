import {
	customerDetail,
	customerDocumentView,
	customerView,
	listCustomers,
	requireCustomer,
} from "@marinho-gestao/read-model";
import { api, requirePermission } from "../base";
import { mockNow } from "../clock";
import { type CustomerRecord, getDb, nextId } from "../db";
import { requireUsableFile } from "../files";

export const customers = {
	list: api.customers.list.handler(({ context, input }) => {
		requirePermission(context, "customers:read");
		return listCustomers(getDb(), input, mockNow());
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
		const user = requirePermission(context, "customers:write");
		const db = getDb();
		const customer = requireCustomer(db, input.customerId);
		requireUsableFile(db, user.id, input.fileKey, ["CUSTOMER_DOCUMENT"]);
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
