import { fileURLToPath } from "node:url";
import { goToSection, heading, mainNav, projectOf } from "../../support/app";
import { IS_MOCK } from "../../support/env";
import { as, expect, test } from "../../support/test";

const DOCUMENT = fileURLToPath(
	new URL("../../fixtures/foto.jpg", import.meta.url),
);

test.describe("Clientes", () => {
	test.describe("como atendimento", () => {
		test.use(as("atendimento"));

		test("cadastra cliente, envia documento e abre pela URL temporária", async ({
			page,
		}, testInfo) => {
			const name = `Raimundo Nonato ${testInfo.project.name}`;
			await page.goto("/painel");
			await goToSection(page, projectOf(testInfo), "Clientes");
			await expect(heading(page, "Clientes")).toBeVisible();

			await page.getByRole("button", { name: "Cadastrar cliente" }).click();
			const sheet = page.getByRole("dialog", { name: "Cadastrar cliente" });
			await sheet.getByLabel("Nome ou razão social").fill(name);
			await sheet.getByLabel("WhatsApp").fill("82999990000");
			await sheet.getByLabel("Cidade").fill("Cajueiro");
			await sheet.getByRole("button", { name: "Salvar cliente" }).click();
			await expect(page.getByText("Cliente cadastrado.")).toBeVisible();
			await expect(sheet).toBeHidden();

			await page.getByLabel("Buscar cliente").fill("Raimundo");
			await page.getByRole("link", { name: new RegExp(name) }).click();
			await expect(heading(page, name)).toBeVisible();

			const documents = page.getByRole("region", { name: "Documentos" });
			const chooser = page.waitForEvent("filechooser");
			await documents
				.getByRole("button", { name: "Enviar Documento com foto" })
				.click();
			await (await chooser).setFiles(DOCUMENT);
			await expect(page.getByText("Documento salvo.")).toBeVisible();

			await documents
				.getByRole("button", { name: "Ver Documento com foto" })
				.click();
			const viewer = page.getByRole("dialog", { name: "Documento com foto" });
			await expect(viewer).toContainText("O link é temporário.");
			const image = viewer.getByRole("img", { name: "Documento com foto" });
			await expect(image).toBeVisible();
			await expect
				.poll(() =>
					image.evaluate((element: HTMLImageElement) => element.naturalWidth),
				)
				.toBeGreaterThan(0);
			if (!IS_MOCK) {
				await expect(image).toHaveAttribute("src", /X-Amz-Expires=/);
			}
		});
	});

	test.describe("como equipamentos", () => {
		test.use(as("equipamentos"));

		test("não acessa Clientes pelo menu nem pela URL", async ({ page }) => {
			await page.goto("/painel");
			await expect(
				mainNav(page).getByRole("link", { name: "Clientes" }),
			).toHaveCount(0);
			await page.goto("/clientes");
			await expect(heading(page, "Sem acesso")).toBeVisible();
			await page.goto("/clientes/qualquer");
			await expect(heading(page, "Sem acesso")).toBeVisible();
		});
	});
});
