import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { orpc } from "./client";

type Module =
	| "availability"
	| "customers"
	| "dashboard"
	| "equipment"
	| "inspections"
	| "ledger"
	| "maintenance"
	| "rentals"
	| "settings"
	| "users";

const RENTAL_FLOW: Module[] = [
	"rentals",
	"availability",
	"dashboard",
	"equipment",
	"customers",
];
const MONEY_FLOW: Module[] = [...RENTAL_FLOW, "ledger"];

const AFFECTED: Record<string, Module[]> = {
	"equipment.createType": ["equipment", "settings", "availability"],
	"equipment.updateType": ["equipment", "settings", "availability"],
	"equipment.createUnit": ["equipment", "availability", "dashboard"],
	"equipment.updateUnit": ["equipment", "availability", "settings"],
	"equipment.changeUnitStatus": [
		"equipment",
		"availability",
		"dashboard",
		"maintenance",
	],
	"equipment.addUnitPhoto": ["equipment"],
	"equipment.addKnownDamage": ["equipment", "inspections"],
	"equipment.updateLot": ["equipment", "availability", "settings", "dashboard"],
	"customers.create": ["customers"],
	"customers.update": ["customers", "rentals"],
	"customers.addDocument": ["customers"],
	"rentals.createQuote": RENTAL_FLOW,
	"rentals.sendQuote": RENTAL_FLOW,
	"rentals.recordPayment": MONEY_FLOW,
	"rentals.confirm": RENTAL_FLOW,
	"rentals.markSeparated": RENTAL_FLOW,
	"rentals.extend": RENTAL_FLOW,
	"rentals.cancel": RENTAL_FLOW,
	"rentals.close": MONEY_FLOW,
	"rentals.recordLostDemand": ["rentals"],
	"inspections.saveItem": ["inspections"],
	"inspections.attachMedia": ["inspections"],
	"inspections.complete": [...MONEY_FLOW, "inspections", "maintenance"],
	"deposits.recordReceived": MONEY_FLOW,
	"deposits.recordRefund": MONEY_FLOW,
	"deposits.recordRetention": MONEY_FLOW,
	"ledger.create": ["ledger", "dashboard", "equipment", "maintenance"],
	"maintenance.open": ["maintenance", "equipment", "availability", "dashboard"],
	"maintenance.complete": [
		"maintenance",
		"equipment",
		"availability",
		"dashboard",
		"ledger",
	],
	"settings.update": ["settings", "equipment", "availability", "rentals"],
	"users.create": ["users"],
	"users.update": ["users"],
};

export function invalidateAfter(
	queryClient: QueryClient,
	mutationKey: QueryKey | undefined,
) {
	const path = mutationKey?.[0];
	if (!Array.isArray(path)) return;
	const modules = AFFECTED[path.join(".")] ?? [];
	return Promise.all(
		modules.map((module) =>
			queryClient.invalidateQueries({ queryKey: orpc[module].key() }),
		),
	);
}

export function invalidateEverything(queryClient: QueryClient) {
	return queryClient.invalidateQueries();
}
