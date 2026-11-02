import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { answerChecklist, heading, type ProjectName } from "./app";
import { IS_MOCK, REFERENCE_NOW, storageStateOf } from "./env";
import { maceio, quoteForm } from "./rental";
import { openScreen, SCREENS, type Screen } from "./screens";
import { resetServer } from "./server";

const PHOTO = fileURLToPath(new URL("../fixtures/foto.jpg", import.meta.url));

export type VisualCase = {
	name: string;
	project: ProjectName;
	screen: Screen;
	use: { storageState: string | { cookies: []; origins: [] } };
};

export function visualCases(): VisualCase[] {
	return SCREENS.flatMap((screen) =>
		screen.projects.map((project) => ({
			name: `${screen.id}--${project}`,
			project,
			screen,
			use: {
				storageState: screen.user
					? storageStateOf(screen.user)
					: { cookies: [] as [], origins: [] as [] },
			},
		})),
	);
}

async function cancelRental(page: Page, number: string, reason: string) {
	await page.goto(`/locacoes/${number}`);
	await expect(heading(page, number)).toBeVisible();
	await page.getByRole("button", { name: "Cancelar" }).click();
	const dialog = page.getByRole("dialog", { name: `Cancelar ${number}` });
	await dialog.getByLabel("Motivo").fill(reason);
	await dialog.getByRole("button", { name: /Cancelar locação/ }).click();
	await expect(dialog).toBeHidden();
}

async function prepareNewRental(page: Page) {
	if (!IS_MOCK) {
		await cancelRental(
			page,
			"LOC-0033",
			"Refeita na tela de nova locação para a referência",
		);
	}
	const search = new URLSearchParams({
		item: "MAR-015",
		saida: maceio("2026-11-07", "08:00"),
		devolucao: maceio("2026-11-10", "17:00"),
	});
	await page.goto(`/locacoes/nova?${search}`);
	const form = quoteForm(page);
	await form.getByLabel("Buscar por nome ou telefone").fill("Cícero");
	await form.getByRole("button", { name: /^Cícero Santos/ }).click();
	await expect(
		form.getByRole("button", { name: /^Cícero Santos/ }),
	).toHaveCount(0);

	await form.getByRole("button", { name: "Adicionar equipamento" }).click();
	const add = page.getByRole("dialog", { name: "Adicionar equipamento" });
	await add.getByLabel("Código, nome ou apelido").fill("andaime");
	await add.getByRole("button", { name: /^Andaime/ }).click();
	await expect(add).toBeHidden();
	await form.getByLabel("Peças", { exact: true }).fill("12");

	await form.getByRole("radio", { name: "Entrega e coleta na obra" }).check();
	await form.getByLabel("Endereço da obra").fill("Rua do Rosário, 88");
	await form.getByLabel("Município").selectOption("Viçosa");
	await form
		.getByLabel("Para quem entrega e para o termo")
		.fill(
			"Pintura da fachada. Montar o andaime com 2 níveis na frente da casa.",
		);
	await expect(form).toContainText("Livres no período: 12 das 20 peças");
}

async function prepareCheckout(page: Page) {
	await page.goto("/locacoes/LOC-0029/saida/MAR-002");
	await expect(heading(page, "Saída · MAR-002")).toBeVisible();
	await answerChecklist(page, { only: 6 });
	for (const slot of ["Frente", "Verso", "Lado esquerdo", "Lado direito"]) {
		await page
			.getByRole("button", { name: `Enviar ${slot}` })
			.locator("input[type=file]")
			.setInputFiles(PHOTO);
		await expect(
			page.getByRole("button", { name: `Trocar ${slot}` }),
		).toBeVisible();
	}
	const delivery = page.getByRole("region", { name: "Na entrega" });
	await delivery.getByRole("checkbox", { name: /Termo assinado/ }).check();
	await delivery.getByRole("checkbox", { name: /^Saldo de/ }).check();
}

export async function prepareScreen(page: Page, screen: Screen): Promise<void> {
	if (!IS_MOCK) await resetServer(REFERENCE_NOW);
	if (screen.id === "04-nova-locacao") {
		await prepareNewRental(page);
		return;
	}
	if (screen.id === "12-saida-e-volta") {
		await prepareCheckout(page);
		return;
	}
	if (screen.id === "03-agenda") {
		await page.goto("/agenda?q=martel");
		await expect(heading(page, "Agenda")).toBeVisible();
		await expect(
			page.getByRole("region", { name: "Resultado" }).getByRole("listitem"),
		).toHaveCount(2);
		await expect(page.getByRole("status", { name: "Carregando" })).toHaveCount(
			0,
		);
		return;
	}
	await openScreen(page, screen);
}

const STILL = `
*, *::before, *::after {
	animation: none !important;
	transition: none !important;
	caret-color: transparent !important;
}
[data-sonner-toaster] { display: none !important; }
`;

export async function settleForScreenshot(page: Page, project: ProjectName) {
	await page.addStyleTag({ content: STILL });
	await page.evaluate(() => {
		(document.activeElement as HTMLElement | null)?.blur();
		window.scrollTo(0, 0);
	});
	await page.evaluate(() => document.fonts.ready);
	await page.waitForFunction(() =>
		[...document.images].every((image) => image.complete),
	);
	const width = page.viewportSize()?.width ?? 0;
	const base = project === "celular" ? 844 : project === "tablet" ? 1194 : 900;
	await page.setViewportSize({ width, height: base });
	const contentHeight = () =>
		page.evaluate(
			(minimum) => Math.max(document.documentElement.scrollHeight, minimum),
			base,
		);
	let previous = -1;
	let settled = await contentHeight();
	for (let attempt = 0; attempt < 20 && settled !== previous; attempt += 1) {
		previous = settled;
		await page.waitForTimeout(250);
		settled = await contentHeight();
	}
	await page.setViewportSize({ width, height: settled });
	await page.waitForTimeout(150);
	return { width, height: settled };
}
