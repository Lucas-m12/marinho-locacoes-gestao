import { expect, type Page } from "@playwright/test";

export function maceio(day: string, time: string): string {
	return new Date(`${day}T${time}:00-03:00`).toISOString();
}

export type QuoteDraft = {
	item: string;
	start: string;
	end: string;
	customer: string;
	city?: string;
};

export function quoteForm(page: Page) {
	return page.getByRole("form", { name: "Orçamento" });
}

export function quoteSummary(page: Page) {
	return page.getByRole("complementary", { name: "Resumo" });
}

export async function openQuote(page: Page, draft: QuoteDraft): Promise<void> {
	const search = new URLSearchParams({
		item: draft.item,
		saida: draft.start,
		devolucao: draft.end,
	});
	await page.goto(`/locacoes/nova?${search}`);
	const form = quoteForm(page);
	await expect(form).toBeVisible();
	await form
		.getByLabel("Buscar por nome ou telefone")
		.fill(draft.customer.split(" ")[0] ?? draft.customer);
	await form
		.getByRole("button", { name: new RegExp(`^${draft.customer}`) })
		.click();
	await form.getByRole("radio", { name: "Cliente busca e devolve" }).check();
}

export async function submitQuote(page: Page): Promise<void> {
	await quoteSummary(page)
		.getByRole("button", { name: "Salvar e enviar orçamento" })
		.click();
}

export function sentDialog(page: Page) {
	return page.getByRole("dialog", { name: /^Orçamento LOC-\d+ enviado$/ });
}

export async function sentNumber(page: Page): Promise<string> {
	const dialog = sentDialog(page);
	await expect(dialog).toBeVisible();
	const title = await dialog.getByRole("heading").first().textContent();
	const number = title?.match(/LOC-\d+/)?.[0];
	if (!number) throw new Error(`Sem número no título: ${title}`);
	return number;
}

export async function createSentQuote(
	page: Page,
	draft: QuoteDraft,
): Promise<string> {
	await openQuote(page, draft);
	await submitQuote(page);
	return sentNumber(page);
}
