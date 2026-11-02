import { heading } from "../../support/app";
import { expect, test } from "../../support/test";

test("abre uma OS e marca como pronta com custo, que vira despesa", async ({
	page,
}) => {
	await page.goto("/manutencao");
	await expect(heading(page, "Manutenção")).toBeVisible();

	await page.getByRole("button", { name: "Abrir ordem de serviço" }).click();
	const opening = page.getByRole("dialog", { name: "Abrir ordem de serviço" });
	await opening.getByLabel("Unidade").selectOption("MAR-005");
	await opening.getByLabel("Motivo").fill("Troca do carvão do motor");
	await opening.getByRole("button", { name: "Abrir ordem" }).click();
	const opened = page.getByText(/^OS-\d+ aberta\. A unidade saiu da agenda\.$/);
	await expect(opened).toBeVisible();
	const number = (await opened.textContent())?.match(/OS-\d+/)?.[0] ?? "";

	const order = page.getByRole("article").filter({ hasText: number });
	await expect(order).toContainText("MAR-005");
	await expect(order).toContainText("Em conserto");

	await page.goto("/estoque/MAR-005");
	await expect(page.getByText("Em manutenção").first()).toBeVisible();

	await page.goto("/manutencao");
	await order.getByRole("button", { name: "Marcar como pronta" }).click();
	const completing = page.getByRole("dialog", { name: "Marcar como pronta" });
	await completing.getByLabel("Custo final").fill("45,00");
	await expect(completing).toContainText(
		"Vai lançar R$ 45 como despesa de manutenção no caixa.",
	);
	await completing.getByRole("radio", { name: "Disponível" }).check();
	await completing.getByRole("button", { name: "Concluir ordem" }).click();
	await expect(page.getByText(`${number} concluída.`)).toBeVisible();

	await page.goto("/dinheiro");
	const expense = page
		.getByRole("region", { name: "Lançamentos" })
		.getByRole("listitem")
		.filter({ hasText: /Manutenção/ })
		.filter({ hasText: "R$ 45" });
	await expect(expense).toHaveCount(1);
	await expect(expense).toContainText("MAR-005");

	await page.goto("/estoque/MAR-005");
	await expect(page.getByText("Disponível").first()).toBeVisible();
});
