import type { UnitLocation } from "@marinho-gestao/contract";
import {
	formatDate,
	formatPeriod,
	formatTime,
	relativeDay,
} from "@/lib/format";

function dayAndTime(value: string, now: Date): string {
	const day = relativeDay(value, now);
	return day === "hoje" ? `hoje ${formatTime(value)}` : day;
}

export function locationText(location: UnitLocation, now: Date): string {
	switch (location.kind) {
		case "BASE":
			return "Na base";
		case "WITH_CUSTOMER":
			return location.overdue
				? `${location.customerName} · atrasada desde ${dayAndTime(location.dueAt, now)}`
				: `${location.customerName} · volta ${dayAndTime(location.dueAt, now)}`;
		case "LEAVING":
			return `Sai ${dayAndTime(location.startAt, now)} · ${location.rentalNumber}`;
		case "IN_MAINTENANCE":
			return location.expectedBackAt
				? `${location.reason} · volta ${formatDate(location.expectedBackAt)}`
				: location.reason;
		case "IN_INSPECTION":
			return location.returnedAt
				? `Voltou ${relativeDay(location.returnedAt, now)}, falta conferir`
				: "Falta conferir";
		case "QUOTED":
			return `Orçamento para ${formatPeriod(location.startAt, location.endAt)}`;
		case "OTHER":
			return location.reason ?? "Fora da agenda";
	}
}

export function isLocationAlert(location: UnitLocation): boolean {
	return location.kind === "WITH_CUSTOMER" && location.overdue;
}
