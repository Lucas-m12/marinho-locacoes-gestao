import { api, depsOf, requirePermission } from "../procedures";
import * as service from "../services/money";

const read = requirePermission("money:read");
const write = requirePermission("money:write");

export const ledger = {
	list: api.ledger.list
		.use(read)
		.handler(({ context, input }) =>
			service.listLedger(depsOf(context), input),
		),
	create: api.ledger.create
		.use(write)
		.handler(({ context, input }) =>
			service.createLedgerEntry(depsOf(context), input),
		),
	reverse: api.ledger.reverse
		.use(write)
		.handler(({ context, input }) =>
			service.reverseLedgerEntry(depsOf(context), input),
		),
	exportCsv: api.ledger.exportCsv
		.use(read)
		.handler(({ context, input }) =>
			service.exportCsv(depsOf(context), input.month),
		),
	byCategory: api.ledger.byCategory
		.use(read)
		.handler(({ context, input }) =>
			service.byCategory(depsOf(context), input),
		),
	receivables: api.ledger.receivables
		.use(read)
		.handler(({ context }) => service.receivables(depsOf(context))),
	depositSummary: api.ledger.depositSummary
		.use(read)
		.handler(({ context, input }) =>
			service.depositSummary(depsOf(context), input),
		),
};

export const deposits = {
	recordReceived: api.deposits.recordReceived
		.use(write)
		.handler(({ context, input }) =>
			service.recordDepositReceived(depsOf(context), input),
		),
	recordRefund: api.deposits.recordRefund
		.use(write)
		.handler(({ context, input }) =>
			service.recordDepositRefund(depsOf(context), input),
		),
	recordRetention: api.deposits.recordRetention
		.use(write)
		.handler(({ context, input }) =>
			service.recordDepositRetention(depsOf(context), input),
		),
};
