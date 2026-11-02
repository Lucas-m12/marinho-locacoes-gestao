import type { ObjectStorage, PutFileResult } from "@marinho-gestao/api";
import type { Database } from "@marinho-gestao/db";

export type JobDetails = Record<string, string | number | boolean | string[]>;

export type JobResult = { affected: number; details?: JobDetails };

export type DumpDatabase = (
	databaseUrl: string,
	outputPath: string,
) => Promise<void>;

export type BackupTarget = {
	putFile(
		key: string,
		filePath: string,
		contentType: string,
	): Promise<PutFileResult>;
};

export type BackupSetup = {
	databaseUrl: string;
	target: BackupTarget;
	dump: DumpDatabase;
};

export type JobContext = {
	db: Database;
	storage: ObjectStorage;
	clock: () => Date;
	backup: () => BackupSetup;
};

export type Job = {
	name: string;
	schedule: string;
	recordEveryRun: boolean;
	run: (context: JobContext) => Promise<JobResult>;
};
