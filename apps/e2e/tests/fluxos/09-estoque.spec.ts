import { fileURLToPath } from "node:url";
import { heading } from "../../support/app";
import { expect, test } from "../../support/test";

const PHOTO = fileURLToPath(
	new URL("../../fixtures/foto.jpg", import.meta.url),
);

test.describe("Estoque e unidade", () => {
	test("filtra por status e busca por apelido", async ({ page }) => {
		await page.goto("/estoque");
		await expect(heading(page, "Estoque")).toBeVisible();
		const unit = (code: string) =>
			page.getByRole("link", { name: new RegExp(`^${code}\\b`) });
		await expect(unit("MAR-001")).toBeVisible();

		const filters = page.getByRole("group", { name: "Filtrar por status" });
		await filters.getByRole("button", { name: /^Em manutenção/ }).click();
		await expect(page).toHaveURL(/status=IN_MAINTENANCE/);
		await expect(unit("MAR-011")).toBeVisible();
		await expect(unit("MAR-001")).toHaveCount(0);
		await expect(
			filters.getByRole("button", { name: /^Em manutenção/ }),
		).toHaveAttribute("aria-pressed", "true");

		await filters.getByRole("button", { name: /^Todos/ }).click();
		await page.getByLabel("Buscar equipamento").fill("maquita");
		await expect(unit("MAR-008")).toBeVisible();
		await expect(unit("MAR-001")).toHaveCount(0);
		await expect(page).toHaveURL(/q=maquita/);
	});

	test("muda o status só pelas transições válidas e pede o motivo quando precisa", async ({
		page,
	}) => {
		await page.goto("/estoque/MAR-003");
		await expect(heading(page, "MAR-003")).toBeVisible();
		await page.getByRole("button", { name: "Mudar status" }).click();
		const dialog = page.getByRole("dialog", { name: "Mudar status" });
		const options = dialog
			.getByRole("radiogroup", { name: "Novo status" })
			.getByRole("radio");
		await expect(options).toHaveCount(4);
		for (const status of [
			"Separado",
			"Bloqueado",
			"Em manutenção",
			"Aposentado",
		]) {
			await expect(dialog.getByRole("radio", { name: status })).toBeVisible();
		}
		await expect(dialog.getByRole("radio", { name: "Alugado" })).toHaveCount(0);

		await dialog.getByRole("radio", { name: "Em manutenção" }).check();
		await expect(dialog.getByLabel("Motivo (opcional)")).toBeVisible();

		await dialog.getByRole("radio", { name: "Bloqueado" }).check();
		await expect(dialog.getByLabel("Motivo", { exact: true })).toBeVisible();
		await dialog.getByRole("button", { name: "Salvar status" }).click();
		await expect(dialog.getByText("Informe o motivo.")).toBeVisible();

		await dialog
			.getByLabel("Motivo", { exact: true })
			.fill("Mandril com folga, esperando peça");
		await dialog.getByRole("button", { name: "Salvar status" }).click();
		await expect(page.getByText("MAR-003: Bloqueado.")).toBeVisible();
		await expect(dialog).toBeHidden();
		await expect(page.getByText("Bloqueado").first()).toBeVisible();

		await page.getByRole("button", { name: "Mudar status" }).click();
		await expect(dialog.getByRole("radio")).toHaveCount(1);
		await expect(
			dialog.getByRole("radio", { name: "Disponível" }),
		).toBeVisible();
	});

	test("envia uma foto da unidade", async ({ page }) => {
		await page.goto("/estoque/MAR-004");
		await expect(heading(page, "MAR-004")).toBeVisible();
		const photos = page.getByRole("region", { name: "Fotos da unidade" });
		await photos
			.getByRole("button", { name: "Enviar Foto principal" })
			.locator("input[type=file]")
			.setInputFiles(PHOTO);
		await expect(page.getByText("Foto salva.")).toBeVisible();
		await expect(
			photos.getByRole("img", { name: "Foto principal" }),
		).toBeVisible();
		await page.reload();
		await expect(
			photos.getByRole("button", { name: "Trocar Foto principal" }),
		).toBeVisible();
	});
});
