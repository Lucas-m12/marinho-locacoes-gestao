import { expect, type Page, type TestInfo } from "@playwright/test";
import { DEMO_PASSWORD } from "./env";

export type ProjectName = "desktop" | "tablet" | "celular";

export function projectOf(testInfo: TestInfo): ProjectName {
	return testInfo.project.name as ProjectName;
}

export async function signIn(
	page: Page,
	username: string,
	options: { password?: string; remember?: boolean } = {},
): Promise<void> {
	await page.getByLabel("Usuário").fill(username);
	await page
		.getByLabel("Senha", { exact: true })
		.fill(options.password ?? DEMO_PASSWORD);
	const remember = page.getByRole("checkbox", {
		name: "Continuar conectado neste aparelho",
	});
	if (options.remember === false) await remember.uncheck();
	await page.getByRole("button", { name: "Entrar", exact: true }).click();
}

export function mainNav(page: Page) {
	return page.getByRole("navigation", { name: "Menu principal" });
}

export async function signOut(page: Page, project: ProjectName): Promise<void> {
	if (project === "desktop") {
		await mainNav(page).getByRole("button", { name: "Sair" }).click();
	} else if (project === "tablet") {
		await mainNav(page)
			.getByRole("button", { name: /menu da conta/ })
			.click();
		await page.getByRole("menuitem", { name: "Sair" }).click();
	} else {
		await mainNav(page).getByRole("link", { name: "Mais" }).click();
		await page
			.getByRole("navigation", { name: "Conta" })
			.getByRole("button", { name: "Sair" })
			.click();
	}
	await expect(page).toHaveURL(/\/entrar/);
}

export async function goToSection(
	page: Page,
	project: ProjectName,
	label: string,
): Promise<void> {
	const nav = mainNav(page);
	const direct = nav.getByRole("link", { name: label, exact: true });
	if (project !== "celular" || (await direct.count()) > 0) {
		await direct.click();
		return;
	}
	await nav.getByRole("link", { name: "Mais" }).click();
	await page
		.getByRole("navigation", { name: "Outras telas" })
		.getByRole("link", { name: new RegExp(`^${label}`) })
		.click();
}

export function heading(page: Page, name: string | RegExp) {
	return page.getByRole("heading", { level: 1, name });
}

export function checklistItems(page: Page) {
	return page
		.getByRole("region", { name: /^Checklist/ })
		.locator("fieldset")
		.filter({ has: page.locator("legend") });
}

export async function answerChecklist(
	page: Page,
	options: { notOk?: string; only?: number } = {},
): Promise<void> {
	const items = checklistItems(page);
	await expect(items.first()).toBeVisible();
	const total = options.only ?? (await items.count());
	for (let index = 0; index < total; index += 1) {
		const item = items.nth(index);
		const label = (await item.locator("legend").textContent()) ?? "";
		const answer = label === options.notOk ? "Não OK" : "OK";
		const button = item.getByRole("button", { name: answer, exact: true });
		await button.click();
		await expect(button).toHaveAttribute("aria-pressed", "true");
	}
}

export async function toast(page: Page, text: string | RegExp) {
	await expect(
		page.getByRole("listitem").filter({ hasText: text }).first(),
	).toBeVisible();
}
