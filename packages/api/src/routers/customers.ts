import { api, depsOf, requirePermission } from "../procedures";
import * as service from "../services/customers";

const read = requirePermission("customers:read");
const write = requirePermission("customers:write");

export const customers = {
	list: api.customers.list
		.use(read)
		.handler(({ context, input }) =>
			service.listCustomers(depsOf(context), input),
		),
	get: api.customers.get
		.use(read)
		.handler(({ context, input }) =>
			service.getCustomer(depsOf(context), input.id),
		),
	create: api.customers.create
		.use(write)
		.handler(({ context, input }) =>
			service.createCustomer(depsOf(context), input),
		),
	update: api.customers.update
		.use(write)
		.handler(({ context, input }) =>
			service.updateCustomer(depsOf(context), input),
		),
	addDocument: api.customers.addDocument
		.use(write)
		.handler(({ context, input }) =>
			service.addCustomerDocument(depsOf(context), input),
		),
};
