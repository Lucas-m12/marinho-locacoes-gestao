import { contract } from "@marinho-gestao/contract";
import { api, os } from "../procedures";
import { availability } from "./availability";
import { customers } from "./customers";
import { dashboard } from "./dashboard";
import { equipment } from "./equipment";
import { inspections } from "./inspections";
import { deposits, ledger } from "./ledger";
import { maintenance } from "./maintenance";
import { pending } from "./pending";
import { rentals } from "./rentals";
import { session } from "./session";
import { settings } from "./settings";
import { users } from "./users";

type Module = keyof typeof contract;

function pendingModule(module: Module) {
	const procedures = api[module] as unknown as Record<
		string,
		{ handler: (run: () => never) => unknown }
	>;
	return Object.fromEntries(
		Object.keys(contract[module]).map((name) => [
			name,
			procedures[name]?.handler(pending),
		]),
	) as never;
}

export const appRouter = os.router({
	session,
	users,
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
	uploads: pendingModule("uploads"),
	files: pendingModule("files"),
});

export type AppRouter = typeof appRouter;
