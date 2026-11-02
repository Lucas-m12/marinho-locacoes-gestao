import { heading, mainNav } from "../../support/app";
import { as, expect, test } from "../../support/test";

test.describe("Mais", () => {
	test("no celular leva às telas certas", async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== "celular", "Mais só existe no celular");
		await page.goto("/painel");
		await mainNav(page).getByRole("link", { name: "Mais" }).click();
		await expect(heading(page, "Mais")).toBeVisible();
		await expect(
			mainNav(page).getByRole("link", { name: "Mais" }),
		).toHaveAttribute("aria-current", "page");

		const screens = page.getByRole("navigation", { name: "Outras telas" });
		const targets: [RegExp, RegExp, string][] = [
			[/^Estoque/, /\/estoque$/, "Estoque"],
			[/^Clientes/, /\/clientes$/, "Clientes"],
			[/^Dinheiro/, /\/dinheiro$/, "Dinheiro"],
			[/^Manutenção/, /\/manutencao$/, "Manutenção"],
		];
		for (const [link, url, title] of targets) {
			await page.goto("/mais");
			await screens.getByRole("link", { name: link }).click();
			await expect(page).toHaveURL(url);
			await expect(heading(page, title)).toBeVisible();
			await expect(
				mainNav(page).getByRole("link", { name: "Mais" }),
			).toHaveAttribute("aria-current", "page");
		}

		await page.goto("/mais");
		const account = page.getByRole("navigation", { name: "Conta" });
		await account.getByRole("link", { name: "Pessoas e acessos" }).click();
		await expect(page).toHaveURL(/\/configuracoes\?aba=pessoas/);
	});

	test.describe("como equipamentos", () => {
		test.use(as("equipamentos"));

		test("no celular só mostra o que o papel usa", async ({
			page,
		}, testInfo) => {
			test.skip(
				testInfo.project.name !== "celular",
				"Mais só existe no celular",
			);
			await page.goto("/mais");
			const screens = page.getByRole("navigation", { name: "Outras telas" });
			await expect(screens.getByRole("link")).toHaveCount(2);
			await expect(
				screens.getByRole("link", { name: /^Estoque/ }),
			).toBeVisible();
			await expect(
				screens.getByRole("link", { name: /^Manutenção/ }),
			).toBeVisible();
			const account = page.getByRole("navigation", { name: "Conta" });
			await expect(account.getByRole("link")).toHaveCount(0);
			await expect(account.getByRole("button", { name: "Sair" })).toBeVisible();
		});
	});

	test("em telas maiores /mais redireciona para o Painel", async ({
		page,
	}, testInfo) => {
		test.skip(testInfo.project.name === "celular", "No celular, Mais existe");
		await page.goto("/mais");
		await expect(page).toHaveURL(/\/painel$/);
		await expect(heading(page, "Bom dia, Lucas")).toBeVisible();
	});
});
