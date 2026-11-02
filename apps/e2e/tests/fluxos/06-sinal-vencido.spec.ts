import { heading } from "../../support/app";
import { createSentQuote, maceio } from "../../support/rental";
import { as, expect, needsServer, test } from "../../support/test";

test.use(as("atendimento"));

test("sinal vencido: a locação expira e a unidade volta a ficar livre", async ({
	page,
	clock,
}) => {
	needsServer("avança o relógio do servidor pela rota de teste");
	const start = maceio("2026-11-07", "08:00");
	const end = maceio("2026-11-10", "17:00");
	const number = await createSentQuote(page, {
		item: "MAR-004",
		start,
		end,
		customer: "Ana Paula",
	});

	await page.goto(`/locacoes/${number}`);
	await expect(heading(page, number)).toBeVisible();
	await expect(page.getByText("Aguardando sinal").first()).toBeVisible();

	const agenda = new URLSearchParams({
		q: "MAR-004",
		saida: start,
		devolucao: end,
	});
	await page.goto(`/agenda?${agenda}`);
	const results = page.getByRole("region", { name: "Resultado" });
	await expect(
		results.getByRole("listitem").filter({ hasText: "MAR-004" }),
	).not.toContainText("Livre no período");

	await clock.advanceHours(25);

	await page.goto(`/locacoes/${number}`);
	await expect(heading(page, number)).toBeVisible();
	await expect(page.getByText("Expirada").first()).toBeVisible();

	await page.goto(`/agenda?${agenda}`);
	await expect(
		results.getByRole("listitem").filter({ hasText: "MAR-004" }),
	).toContainText("Livre no período");
});
