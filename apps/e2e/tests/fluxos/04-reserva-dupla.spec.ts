import {
	maceio,
	openQuote,
	quoteForm,
	quoteSummary,
	sentDialog,
	sentNumber,
	submitQuote,
} from "../../support/rental";
import { as, expect, needsServer, test } from "../../support/test";

test.use(as("atendimento"));

test.describe("Reserva dupla", () => {
	test("a segunda reserva da mesma unidade mostra o conflito e oferece alternativas", async ({
		page,
		context,
	}) => {
		needsServer("a segunda aba precisa ver a reserva feita na primeira");
		const later = await context.newPage();
		await openQuote(later, {
			item: "MAR-003",
			start: maceio("2026-11-08", "08:00"),
			end: maceio("2026-11-11", "17:00"),
			customer: "Pedro Henrique",
		});

		await openQuote(page, {
			item: "MAR-003",
			start: maceio("2026-11-07", "08:00"),
			end: maceio("2026-11-10", "17:00"),
			customer: "Ana Paula",
		});
		await submitQuote(page);
		const first = await sentNumber(page);

		await submitQuote(later);
		const refused = quoteSummary(later).getByRole("status").filter({
			hasText: "Não deu para salvar",
		});
		await expect(refused).toContainText(
			"MAR-003 ocupado no período escolhido.",
		);
		await expect(sentDialog(later)).toBeHidden();
		const swap = quoteForm(later).getByRole("button", {
			name: "Trocar por MAR-004",
		});
		await expect(swap).toBeVisible();

		await swap.click();
		await expect(quoteForm(later)).toContainText("MAR-004 · ");
		await submitQuote(later);
		const second = await sentNumber(later);
		expect(second).not.toBe(first);
	});

	test("duas abas ao mesmo tempo: só uma reserva passa", async ({
		page,
		context,
	}) => {
		needsServer("a corrida entre duas abas precisa do banco compartilhado");
		const other = await context.newPage();
		const draft = {
			item: "MAR-004",
			start: maceio("2026-11-14", "08:00"),
			end: maceio("2026-11-16", "17:00"),
		};
		await openQuote(page, { ...draft, customer: "Ana Paula" });
		await openQuote(other, { ...draft, customer: "Maria do Carmo" });

		await Promise.all([submitQuote(page), submitQuote(other)]);

		const outcome = async (tab: typeof page) => {
			const sent = sentDialog(tab);
			const refused = quoteSummary(tab).getByRole("status").filter({
				hasText: "Não deu para salvar",
			});
			await expect(sent.or(refused)).toBeVisible();
			return (await sent.isVisible()) ? "enviado" : "recusado";
		};
		const results = [await outcome(page), await outcome(other)].sort();
		expect(results).toEqual(["enviado", "recusado"]);
	});
});
