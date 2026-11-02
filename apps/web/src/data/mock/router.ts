import { api } from "./base";
import { availability } from "./handlers/availability";
import { customers } from "./handlers/customers";
import { dashboard } from "./handlers/dashboard";
import { deposits } from "./handlers/deposits";
import { equipment } from "./handlers/equipment";
import { inspections } from "./handlers/inspections";
import { ledger } from "./handlers/ledger";
import { maintenance } from "./handlers/maintenance";
import { rentals } from "./handlers/rentals";
import { session } from "./handlers/session";
import { settings } from "./handlers/settings";
import { files, uploads } from "./handlers/uploads";
import { users } from "./handlers/users";

export const mockRouter = api.router({
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
