import { os } from "../procedures";
import { availability } from "./availability";
import { customers } from "./customers";
import { dashboard } from "./dashboard";
import { equipment } from "./equipment";
import { inspections } from "./inspections";
import { deposits, ledger } from "./ledger";
import { maintenance } from "./maintenance";
import { rentals } from "./rentals";
import { session } from "./session";
import { settings } from "./settings";
import { files, uploads } from "./uploads";
import { users } from "./users";

export const appRouter = os.router({
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
});

export type AppRouter = typeof appRouter;
