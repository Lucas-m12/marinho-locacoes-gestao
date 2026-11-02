import {
	deleteStalePendingUploads,
	expireStaleQuotes,
	purgeExpiredCustomerDocuments,
} from "@marinho-gestao/api";
import { backupDatabase } from "./backup";
import type { Job } from "./types";

export const JOBS: readonly Job[] = [
	{
		name: "expire-quotes",
		schedule: "*/5 * * * *",
		recordEveryRun: false,
		async run({ db, clock }) {
			const rentalIds = await expireStaleQuotes(db, clock());
			return { affected: rentalIds.length, details: { rentalIds } };
		},
	},
	{
		name: "cleanup-uploads",
		schedule: "15 * * * *",
		recordEveryRun: false,
		async run(context) {
			const { deleted } = await deleteStalePendingUploads(context);
			return { affected: deleted };
		},
	},
	{
		name: "purge-customer-documents",
		schedule: "30 3 * * *",
		recordEveryRun: false,
		async run(context) {
			const result = await purgeExpiredCustomerDocuments(context);
			return {
				affected: result.documents,
				details: {
					customers: result.customers,
					retentionMonths: result.retentionMonths,
				},
			};
		},
	},
	{
		name: "backup-database",
		schedule: "0 3 * * *",
		recordEveryRun: true,
		run: (context) => backupDatabase(context.backup(), context.clock),
	},
];

export function findJob(name: string): Job | undefined {
	return JOBS.find((job) => job.name === name);
}
