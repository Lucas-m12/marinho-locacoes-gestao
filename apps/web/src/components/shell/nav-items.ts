import { can, type Permission, type Role } from "@marinho-gestao/domain";
import type { LinkProps } from "@tanstack/react-router";
import {
	Boxes,
	CalendarDays,
	ClipboardList,
	Ellipsis,
	LayoutGrid,
	type LucideIcon,
	Plus,
	Settings,
	Users,
	Wallet,
	Wrench,
} from "lucide-react";

export type NavEntry = {
	to: NonNullable<LinkProps["to"]>;
	label: string;
	short: string;
	icon: LucideIcon;
	permission?: Permission;
	phaseTwo?: boolean;
};

export const MAIN_NAV: NavEntry[] = [
	{ to: "/painel", label: "Painel", short: "Painel", icon: LayoutGrid },
	{ to: "/agenda", label: "Agenda", short: "Agenda", icon: CalendarDays },
	{
		to: "/locacoes",
		label: "Locações",
		short: "Locações",
		icon: ClipboardList,
	},
	{ to: "/estoque", label: "Estoque", short: "Estoque", icon: Boxes },
	{
		to: "/clientes",
		label: "Clientes",
		short: "Clientes",
		icon: Users,
		permission: "customers:read",
	},
	{
		to: "/dinheiro",
		label: "Dinheiro",
		short: "Dinheiro",
		icon: Wallet,
		permission: "money:read",
	},
	{
		to: "/manutencao",
		label: "Manutenção",
		short: "Manutenç.",
		icon: Wrench,
		permission: "maintenance:read",
		phaseTwo: true,
	},
	{
		to: "/configuracoes",
		label: "Configurações",
		short: "Config.",
		icon: Settings,
		permission: "settings:manage",
	},
];

export const NEW_RENTAL: NavEntry = {
	to: "/locacoes/nova",
	label: "Nova locação",
	short: "Nova",
	icon: Plus,
	permission: "rentals:sell",
};

const MORE: NavEntry = {
	to: "/mais",
	label: "Mais",
	short: "Mais",
	icon: Ellipsis,
};

export function allowedEntries(entries: NavEntry[], role: Role): NavEntry[] {
	return entries.filter(
		(entry) => !entry.permission || can(role, entry.permission),
	);
}

export function bottomNav(role: Role): (NavEntry & { accent?: boolean })[] {
	const [painel, agenda, locacoes, estoque] = MAIN_NAV as [
		NavEntry,
		NavEntry,
		NavEntry,
		NavEntry,
	];
	const middle = can(role, "rentals:sell")
		? { ...NEW_RENTAL, accent: true }
		: estoque;
	return [painel, agenda, middle, locacoes, MORE];
}

export const MORE_SECTION_PATHS = [
	"/estoque",
	"/clientes",
	"/dinheiro",
	"/manutencao",
	"/configuracoes",
	"/mais",
];
