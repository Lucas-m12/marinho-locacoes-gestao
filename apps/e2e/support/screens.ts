import { expect, type Page } from "@playwright/test";
import type { ProjectName } from "./app";
import { heading } from "./app";
import type { Username } from "./env";

export type ScreenState = {
	procedure: string;
	empty?: { act: (page: Page) => Promise<void>; text: string };
};

export type Screen = {
	id: string;
	title: string | RegExp;
	user: Username | null;
	projects: readonly ProjectName[];
	nav: Partial<Record<ProjectName, string | null>>;
	open: (page: Page) => Promise<void>;
	states?: ScreenState;
};

const ALL: readonly ProjectName[] = ["desktop", "tablet", "celular"];

function go(path: string) {
	return async (page: Page) => {
		await page.goto(path);
	};
}

function sameNav(desktopAndTablet: string, phone: string) {
	return {
		desktop: desktopAndTablet,
		tablet: desktopAndTablet,
		celular: phone,
	};
}

async function searchFor(page: Page, label: string, text: string) {
	await page.getByLabel(label).fill(text);
}

export const SCREENS: readonly Screen[] = [
	{
		id: "01-entrar",
		title: "Entrar",
		user: null,
		projects: ALL,
		nav: {},
		open: go("/entrar"),
	},
	{
		id: "02-painel",
		title: "Bom dia, Lucas",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Painel", "Painel"),
		open: go("/painel"),
		states: { procedure: "dashboard/today" },
	},
	{
		id: "03-agenda",
		title: "Agenda",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Agenda", "Agenda"),
		open: go("/agenda"),
		states: {
			procedure: "availability/calendar",
			empty: {
				act: async (page) => {
					const form = page.getByRole("form", {
						name: "Consultar disponibilidade",
					});
					await form.getByLabel("Equipamento").fill("guindaste");
					await form
						.getByRole("button", { name: "Ver disponibilidade" })
						.click();
				},
				text: "Nada encontrado",
			},
		},
	},
	{
		id: "04-nova-locacao",
		title: "Nova locação",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Locações", "Locações"),
		open: go("/locacoes/nova"),
	},
	{
		id: "05-locacoes",
		title: "Locações",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Locações", "Locações"),
		open: go("/locacoes"),
		states: {
			procedure: "rentals/list",
			empty: {
				act: (page) => searchFor(page, "Buscar locação", "Ninguém Assim"),
				text: "Nada encontrado",
			},
		},
	},
	{
		id: "06-locacao",
		title: "LOC-0029",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Locações", "Locações"),
		open: go("/locacoes/LOC-0029"),
		states: { procedure: "rentals/get" },
	},
	{
		id: "07-estoque",
		title: "Estoque",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Estoque", "Mais"),
		open: go("/estoque"),
		states: {
			procedure: "equipment/listUnits",
			empty: {
				act: (page) => searchFor(page, "Buscar equipamento", "guindaste"),
				text: "Nada encontrado",
			},
		},
	},
	{
		id: "08-unidade",
		title: "MAR-002",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Estoque", "Mais"),
		open: go("/estoque/MAR-002"),
		states: { procedure: "equipment/getUnit" },
	},
	{
		id: "09-clientes",
		title: "Clientes",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Clientes", "Mais"),
		open: go("/clientes"),
		states: {
			procedure: "customers/list",
			empty: {
				act: (page) => searchFor(page, "Buscar cliente", "Ninguém Assim"),
				text: "Ninguém encontrado",
			},
		},
	},
	{
		id: "10-cliente",
		title: "José Carlos",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Clientes", "Mais"),
		open: async (page) => {
			await page.goto("/clientes");
			await page
				.getByRole("link", { name: /José Carlos/ })
				.first()
				.click();
			await expect(heading(page, "José Carlos")).toBeVisible();
		},
		states: { procedure: "customers/get" },
	},
	{
		id: "11-dinheiro",
		title: "Dinheiro",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Dinheiro", "Mais"),
		open: go("/dinheiro"),
		states: { procedure: "ledger/list" },
	},
	{
		id: "12-saida-e-volta",
		title: "Saída · MAR-002",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Locações", "Locações"),
		open: go("/locacoes/LOC-0029/saida/MAR-002"),
		states: { procedure: "inspections/get" },
	},
	{
		id: "13-manutencao",
		title: "Manutenção",
		user: "lucas",
		projects: ALL,
		nav: sameNav("Manutenção", "Mais"),
		open: go("/manutencao"),
		states: { procedure: "maintenance/list" },
	},
	{
		id: "14-mais",
		title: "Mais",
		user: "lucas",
		projects: ["celular"],
		nav: { celular: "Mais" },
		open: go("/mais"),
	},
];

export async function openScreen(page: Page, screen: Screen): Promise<void> {
	await screen.open(page);
	await expect(heading(page, screen.title)).toBeVisible();
	await expect(page.getByRole("status", { name: "Carregando" })).toHaveCount(0);
}
