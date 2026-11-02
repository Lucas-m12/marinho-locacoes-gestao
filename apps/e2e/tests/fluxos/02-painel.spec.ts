import { heading } from "../../support/app";
import { as, expect, test } from "../../support/test";

test.describe("Painel", () => {
	test("os blocos mostram os números do seed, o atraso e o sinal", async ({
		page,
	}) => {
		await page.goto("/painel");
		await expect(heading(page, "Bom dia, Lucas")).toBeVisible();

		const kpi = (name: string) => page.getByRole("region", { name });
		await expect(kpi("Entrou")).toContainText("R$ 2.340");
		await expect(kpi("Saiu")).toContainText("R$ 610");
		await expect(kpi("Resultado")).toContainText("R$ 1.730");
		await expect(kpi("Caução em mãos")).toContainText("R$ 900");

		const overdue = page
			.getByRole("paragraph")
			.filter({ hasText: "1 equipamento atrasado" });
		await expect(overdue).toContainText("MAR-008");
		await expect(overdue).toContainText("João Batista");

		const signal = page.getByRole("region", { name: "Aguardando sinal" });
		const carrocinha = signal.getByRole("link", { name: /LOC-0031/ });
		await expect(carrocinha).toContainText("Expira em 5 h");
	});

	test.describe("como equipamentos", () => {
		test.use(as("equipamentos"));

		test("não vê os blocos de dinheiro", async ({ page }) => {
			await page.goto("/painel");
			await expect(heading(page, "Bom dia, Equipamentos")).toBeVisible();
			await expect(
				page.getByRole("region", { name: "Saem hoje" }),
			).toBeVisible();
			await expect(
				page.getByRole("heading", { name: "Últimos 30 dias" }),
			).toHaveCount(0);
			await expect(page.getByRole("region", { name: "Entrou" })).toHaveCount(0);
			await expect(page.getByText("R$ 2.340")).toHaveCount(0);
			await expect(
				page.getByRole("region", { name: "Aguardando sinal" }),
			).toHaveCount(0);
		});
	});
});
