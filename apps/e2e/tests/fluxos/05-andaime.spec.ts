import {
	maceio,
	openQuote,
	quoteForm,
	quoteSummary,
	sentDialog,
	submitQuote,
} from "../../support/rental";
import { as, expect, test } from "../../support/test";

test.use(as("atendimento"));

test("andaime: 13 peças num período com 12 livres é recusado", async ({
	page,
}) => {
	await openQuote(page, {
		item: "ANDAIME",
		start: maceio("2026-11-03", "08:00"),
		end: maceio("2026-11-04", "17:00"),
		customer: "Antônio Ferreira",
	});
	const form = quoteForm(page);
	await expect(form).toContainText("Livres no período: 12 das 20 peças");

	await form.getByLabel("Peças", { exact: true }).fill("13");
	await expect(form).toContainText("Andaime · 13 peças");

	await submitQuote(page);
	const refused = quoteSummary(page).getByRole("status").filter({
		hasText: "Não deu para salvar",
	});
	await expect(refused).toContainText(
		"Andaime: só 12 peças livres no período (pediu 13).",
	);
	await expect(sentDialog(page)).toBeHidden();

	await form.getByLabel("Peças", { exact: true }).fill("12");
	await submitQuote(page);
	await expect(sentDialog(page)).toBeVisible();
});
