import { contract } from "@marinho-gestao/contract";
import { api, os } from "../procedures";
import { pending } from "./pending";
import { session } from "./session";
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
	dashboard: pendingModule("dashboard"),
	availability: pendingModule("availability"),
	equipment: pendingModule("equipment"),
	customers: pendingModule("customers"),
	rentals: pendingModule("rentals"),
	inspections: pendingModule("inspections"),
	deposits: pendingModule("deposits"),
	ledger: pendingModule("ledger"),
	maintenance: pendingModule("maintenance"),
	settings: pendingModule("settings"),
	uploads: pendingModule("uploads"),
	files: pendingModule("files"),
});

export type AppRouter = typeof appRouter;
