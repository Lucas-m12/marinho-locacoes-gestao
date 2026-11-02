import {
	heading,
	mainNav,
	projectOf,
	signIn,
	signOut,
} from "../../support/app";
import { IS_MOCK } from "../../support/env";
import { as, expect, signedOut, test } from "../../support/test";

test.describe("Configurações", () => {
	test("a gestão cria uma pessoa, muda o papel e redefine a senha", async ({
		page,
		openContext,
	}, testInfo) => {
		const suffix = `${testInfo.project.name}${Date.now().toString(36)}`;
		const username = `joana.${suffix}`.slice(0, 30);
		const name = `Joana ${suffix}`;

		await page.goto("/configuracoes?aba=pessoas");
		await expect(heading(page, "Configurações")).toBeVisible();
		await page.getByRole("button", { name: "Criar pessoa" }).click();
		const create = page.getByRole("dialog", { name: "Criar pessoa" });
		await create.getByLabel("Nome").fill(name);
		await create.getByLabel("Usuário").fill(username);
		await create.getByLabel("Papel").selectOption({ label: "Atendimento" });
		await create.getByLabel("Senha inicial").fill("senha-inicial-1");
		await create.getByRole("button", { name: "Criar pessoa" }).click();
		await expect(page.getByText("Pessoa criada.")).toBeVisible();

		await page
			.getByLabel(`Papel de ${name}`)
			.selectOption({ label: "Equipamentos" });
		await expect(page.getByText(`Papel de ${name} atualizado.`)).toBeVisible();

		await page
			.getByRole("button", { name: `Redefinir senha de ${name}` })
			.click();
		const reset = page.getByRole("dialog", {
			name: `Redefinir senha de ${name}`,
		});
		await reset.getByLabel("Senha nova").fill("senha-nova-123");
		await reset.getByRole("button", { name: "Redefinir senha" }).click();
		const saved = page.getByRole("dialog", { name: "Senha redefinida" });
		await expect(saved).toContainText("senha-nova-123");
		await saved.getByRole("button", { name: "Já anotei" }).click();

		const fresh = IS_MOCK
			? page
			: await (await openContext(signedOut.storageState)).newPage();
		if (IS_MOCK) await signOut(page, projectOf(testInfo));
		await fresh.goto("/entrar");
		await signIn(fresh, username, { password: "senha-inicial-1" });
		await expect(fresh.getByRole("alert")).toHaveText(
			"Usuário ou senha incorretos.",
		);
		await signIn(fresh, username, { password: "senha-nova-123" });
		await expect(heading(fresh, `Bom dia, ${name}`)).toBeVisible();
		await expect(
			mainNav(fresh).getByRole("link", { name: /^Dinheiro/ }),
		).toHaveCount(0);
	});

	for (const username of ["atendimento", "equipamentos"] as const) {
		test.describe(`como ${username}`, () => {
			test.use(as(username));

			test("não vê Configurações", async ({ page }) => {
				await page.goto("/painel");
				await expect(
					mainNav(page).getByRole("link", { name: /^Config/ }),
				).toHaveCount(0);
				await page.goto("/configuracoes");
				await expect(heading(page, "Sem acesso")).toBeVisible();
			});
		});
	}
});
