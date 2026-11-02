import type {
	ContractRouterClient,
	InferContractRouterInputs,
	InferContractRouterOutputs,
} from "@orpc/contract";
import { availability } from "./modules/availability";
import { customers } from "./modules/customers";
import { dashboard } from "./modules/dashboard";
import { deposits } from "./modules/deposits";
import { equipment } from "./modules/equipment";
import { inspections } from "./modules/inspections";
import { ledger } from "./modules/ledger";
import { maintenance } from "./modules/maintenance";
import { rentals } from "./modules/rentals";
import { session } from "./modules/session";
import { settings } from "./modules/settings";
import { files, uploads } from "./modules/uploads";
import { users } from "./modules/users";

export const contract = {
	session,
	dashboard,
	availability,
	equipment,
	customers,
	rentals,
	inspections,
	deposits,
	ledger,
	maintenance,
	settings,
	users,
	uploads,
	files,
};

export type Contract = typeof contract;
export type AppClient = ContractRouterClient<Contract>;
export type ContractInputs = InferContractRouterInputs<Contract>;
export type ContractOutputs = InferContractRouterOutputs<Contract>;

export * from "./common";
export * from "./modules/availability";
export * from "./modules/customers";
export * from "./modules/dashboard";
export * from "./modules/deposits";
export * from "./modules/equipment";
export * from "./modules/inspections";
export * from "./modules/ledger";
export * from "./modules/maintenance";
export * from "./modules/rentals";
export * from "./modules/session";
export * from "./modules/settings";
export * from "./modules/uploads";
export * from "./modules/users";
