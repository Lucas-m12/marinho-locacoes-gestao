import type { BrowserContext } from "@playwright/test";
import { heading, projectOf, signIn, signOut } from "../../support/app";
import { expect, signedOut, test } from "../../support/test";

test.use(signedOut);

test.describe("Entrar", () => {
	test("usuário ou senha errada mostra a mensagem certa", async ({ page }) => {
		await page.goto("/entrar");
		await signIn(page, "lucas", { password: "senha-errada" });
		await expect(page.getByRole("alert")).toHaveText(
			"Usuário ou senha incorretos.",
		);
		await expect(page).toHaveURL(/\/entrar/);

		await signIn(page, "ninguem", { password: "marinho123" });
		await expect(page.getByRole("alert")).toHaveText(
			"Usuário ou senha incorretos.",
		);

		await page.getByLabel("Usuário").fill("");
		await page.getByLabel("Senha", { exact: true }).fill("");
		await page.getByRole("button", { name: "Entrar", exact: true }).click();
		await expect(page.getByText("Informe o usuário")).toBeVisible();
		await expect(page.getByText("Informe a senha")).toBeVisible();
	});

	test("entrar leva ao Painel", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveURL(/\/entrar/);
		await signIn(page, "lucas");
		await expect(page).toHaveURL(/\/painel$/);
		await expect(heading(page, "Bom dia, Lucas")).toBeVisible();
	});

	test("sem Continuar conectado, a sessão não sobrevive ao fechar o navegador", async ({
		page,
		context,
		openContext,
	}) => {
		await page.goto("/entrar");
		await signIn(page, "atendimento", { remember: false });
		await expect(heading(page, "Bom dia, Atendimento")).toBeVisible();

		const reopened = await openContext(await persistentState(context));
		const again = await reopened.newPage();
		await again.goto("/painel");
		await expect(again).toHaveURL(/\/entrar/);
	});

	test("com Continuar conectado, a sessão sobrevive ao fechar o navegador", async ({
		page,
		context,
		openContext,
	}, testInfo) => {
		await page.goto("/entrar");
		await signIn(page, "atendimento");
		await expect(heading(page, "Bom dia, Atendimento")).toBeVisible();

		const reopened = await openContext(await persistentState(context));
		const again = await reopened.newPage();
		await again.goto("/painel");
		await expect(heading(again, "Bom dia, Atendimento")).toBeVisible();
		await signOut(again, projectOf(testInfo));
	});

	test("sair funciona", async ({ page }, testInfo) => {
		await page.goto("/entrar");
		await signIn(page, "equipamentos");
		await expect(heading(page, "Bom dia, Equipamentos")).toBeVisible();
		await signOut(page, projectOf(testInfo));
		await page.goto("/painel");
		await expect(page).toHaveURL(/\/entrar/);
	});

	test("abrir /agenda sem sessão leva a /entrar e volta para /agenda depois do login", async ({
		page,
	}) => {
		await page.goto("/agenda");
		await expect(page).toHaveURL(/\/entrar\?redirect=/);
		await signIn(page, "lucas");
		await expect(page).toHaveURL(/\/agenda$/);
		await expect(heading(page, "Agenda")).toBeVisible();
	});
});

async function persistentState(context: BrowserContext) {
	const state = await context.storageState();
	return {
		cookies: state.cookies.filter((cookie) => cookie.expires > 0),
		origins: state.origins,
	};
}
