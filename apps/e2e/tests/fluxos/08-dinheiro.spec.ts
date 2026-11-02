import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { heading } from "../../support/app";
import { expect, test } from "../../support/test";

const RECEIPT = fileURLToPath(
	new URL("../../fixtures/foto.jpg", import.meta.url),
);
const DESCRIPTION = "Combustível da entrega em Pindoba";

test.describe("Dinheiro", () => {
	test.describe.configure({ mode: "serial" });

	test("despesa com comprovante, estorno e exportação do mês", async ({
		page,
	}) => {
		await page.goto("/dinheiro");
		await expect(heading(page, "Dinheiro")).toBeVisible();
		const spent = page.getByRole("region", { name: "Saiu" });
		await expect(spent).toContainText("R$ 610");

		await page.getByRole("button", { name: "Despesa" }).click();
		const dialog = page.getByRole("dialog", { name: "Nova despesa" });
		await dialog.getByLabel("Valor").fill("85,00");
		await dialog.getByLabel("Descrição").fill(DESCRIPTION);
		await dialog
			.getByRole("button", { name: "Enviar Comprovante" })
			.locator("input[type=file]")
			.setInputFiles(RECEIPT);
		await expect(
			dialog.getByRole("button", { name: "Trocar Comprovante" }),
		).toBeVisible();
		await dialog.getByRole("button", { name: "Lançar despesa" }).click();
		await expect(page.getByText("Despesa lançada.")).toBeVisible();
		await expect(spent).toContainText("R$ 695");

		const entries = page.getByRole("region", { name: "Lançamentos" });
		const original = entries
			.getByRole("listitem")
			.filter({ hasText: DESCRIPTION })
			.filter({ hasNotText: "Estorno de" });
		await expect(original).toContainText("− R$ 85");

		await original
			.getByRole("button", { name: `Estornar ${DESCRIPTION}` })
			.click();
		const reverse = page.getByRole("dialog", { name: "Estornar lançamento" });
		await reverse.getByLabel("Motivo").fill("Lançada em duplicidade");
		await reverse.getByRole("button", { name: "Estornar" }).click();
		await expect(page.getByText("Lançamento estornado.")).toBeVisible();

		await expect(original).toContainText("Estornado");
		await expect(original.getByText(DESCRIPTION)).toHaveCSS(
			"text-decoration-line",
			"line-through",
		);
		await expect(spent).toContainText("R$ 610");
		await expect(
			entries.getByRole("button", { name: `Estornar ${DESCRIPTION}` }),
		).toHaveCount(0);
		await expect(
			entries.getByRole("button", { name: /Estornar Lançada em duplicidade/ }),
		).toHaveCount(0);

		await page.getByRole("button", { name: "Exportar mês (CSV)" }).click();
		const exportDialog = page.getByRole("dialog", { name: "Exportar mês" });
		await expect(exportDialog.getByLabel("Mês")).toHaveValue("2026-11");
		const [download] = await Promise.all([
			page.waitForEvent("download"),
			exportDialog.getByRole("button", { name: "Baixar CSV" }).click(),
		]);
		expect(download.suggestedFilename()).toBe("marinho-caixa-2026-11.csv");
		const csv = await readFile(await download.path(), "utf8");
		expect(csv.charCodeAt(0)).toBe(0xfeff);
		const lines = csv.slice(1).trimEnd().split("\r\n");
		expect(lines[0]?.split(";").length).toBeGreaterThan(5);
		const ours = lines.filter((line) => line.includes(DESCRIPTION));
		expect(ours).toHaveLength(2);
		expect(ours.some((line) => line.split(";").includes("-85,00"))).toBe(true);
		expect(ours.some((line) => line.split(";").includes("85,00"))).toBe(true);
		expect(csv).not.toMatch(/Caução/);
	});

	test("clicar duas vezes em salvar pagamento gera um lançamento só", async ({
		page,
	}) => {
		await page.goto("/locacoes/LOC-0029");
		await expect(heading(page, "LOC-0029")).toBeVisible();
		await page.getByRole("button", { name: "Registrar pagamento" }).click();
		const dialog = page.getByRole("dialog", { name: "Registrar pagamento" });
		await dialog.getByLabel("Valor").fill("123,45");
		await dialog
			.getByRole("button", { name: "Salvar pagamento" })
			.evaluate((button: HTMLButtonElement) => {
				button.click();
				button.click();
			});
		await expect(dialog).toBeHidden();
		await expect(page.getByText("Saldo registrado.").first()).toBeVisible();

		await page.goto("/dinheiro");
		const entries = page.getByRole("region", { name: "Lançamentos" });
		await expect(entries).toContainText("LOC-0029");
		await expect(
			entries.getByRole("listitem").filter({ hasText: "R$ 123,45" }),
		).toHaveCount(1);
	});
});
