import type { Page } from "@playwright/test";
import { answerChecklist, heading } from "../../support/app";
import { as, expect, needsServer, test } from "../../support/test";

test.use(as("atendimento"));

async function searchAgenda(page: Page, query: string) {
	const form = page.getByRole("form", { name: "Consultar disponibilidade" });
	await form.getByLabel("Equipamento").fill(query);
	await form.getByRole("button", { name: "Ver disponibilidade" }).click();
	return page.getByRole("region", { name: "Resultado" });
}

let number = "";

test.describe
	.serial("Reserva completa", () => {
		test("da busca na agenda até a reserva confirmada", async ({
			page,
			context,
		}) => {
			await context.grantPermissions(["clipboard-read", "clipboard-write"]);
			await page.goto("/agenda");
			await expect(heading(page, "Agenda")).toBeVisible();

			const byNickname = await searchAgenda(page, "maquita");
			await expect(
				byNickname.getByRole("listitem").filter({ hasText: "MAR-008" }),
			).toBeVisible();

			const form = page.getByRole("form", {
				name: "Consultar disponibilidade",
			});
			await form.getByLabel("Saída").fill("2026-11-07T08:00");
			await form.getByLabel("Devolução").fill("2026-11-10T17:00");
			const results = await searchAgenda(page, "martelete");
			await expect(results).toContainText("07/11 a 10/11");
			const mar001 = results
				.getByRole("listitem")
				.filter({ hasText: "MAR-001 · Martelete" });
			await expect(mar001).toContainText("Livre no período");
			await expect(mar001).toContainText(/= R\$\s320/);

			await mar001.getByRole("link", { name: "Reservar MAR-001" }).click();
			await expect(heading(page, "Nova locação")).toBeVisible();
			const quote = page.getByRole("form", { name: "Orçamento" });
			await expect(quote.getByLabel("Saída")).toHaveValue("2026-11-07T08:00");
			await expect(quote.getByLabel("Devolução")).toHaveValue(
				"2026-11-10T17:00",
			);
			await expect(quote).toContainText("MAR-001 · Martelete Bosch GBH 2-28 D");

			await quote.getByLabel("Buscar por nome ou telefone").fill("Cícero");
			await quote.getByRole("button", { name: /^Cícero Santos/ }).click();
			await expect(quote).toContainText("Pintor · Viçosa");

			await quote
				.getByRole("radio", { name: "Entrega e coleta na obra" })
				.check();
			await quote.getByLabel("Endereço da obra").fill("Rua da Matriz, 120");
			await quote.getByLabel("Município").selectOption("Viçosa");

			const summary = page.getByRole("complementary", { name: "Resumo" });
			await expect(summary).toContainText("R$ 320");
			await summary
				.getByRole("button", { name: "Salvar e enviar orçamento" })
				.click();

			const sent = page.getByRole("dialog", {
				name: /^Orçamento LOC-\d+ enviado$/,
			});
			await expect(sent).toBeVisible();
			number =
				(await sent.getByRole("heading").textContent())?.match(
					/LOC-\d+/,
				)?.[0] ?? "";
			expect(number).toBeTruthy();

			await sent
				.getByRole("button", { name: "Copiar texto do orçamento" })
				.click();
			await expect(
				page.getByText("Texto copiado. É só colar no WhatsApp."),
			).toBeVisible();
			const copied = await page.evaluate(() => navigator.clipboard.readText());
			expect(copied).toContain("Martelete");
			expect(copied).toContain("Cícero");
			expect(copied).toMatch(/R\$\s?320/);

			await sent.getByRole("button", { name: "Ver locação" }).click();
			await expect(heading(page, number)).toBeVisible();
			await expect(page.getByText("Aguardando sinal").first()).toBeVisible();

			await page.getByRole("button", { name: "Registrar sinal" }).click();
			const payment = page.getByRole("dialog", { name: "Registrar pagamento" });
			await expect(payment.getByLabel("O que foi pago")).toHaveValue("SIGNAL");
			const amount = payment.getByLabel("Valor");
			if ((await amount.inputValue()) === "") await amount.fill("100,00");
			await payment.getByLabel("Forma").selectOption({ label: "Pix" });
			await payment.getByRole("button", { name: "Salvar pagamento" }).click();
			await expect(payment).toBeHidden();
			await expect(page.getByText("Sinal registrado.")).toBeVisible();

			await page.getByRole("button", { name: "Confirmar reserva" }).click();
			await expect(page.getByText("Reserva confirmada.")).toBeVisible();
			await expect(page.getByText("Confirmada").first()).toBeVisible();
		});

		test("equipamentos separa depois que a unidade volta", async ({
			page,
			openContext,
		}) => {
			needsServer("outro usuário precisa ver a reserva feita pelo atendimento");
			const equipment = await openContext(as("equipamentos").storageState);
			const separator = await equipment.newPage();
			await separator.goto(`/locacoes/${number}`);
			await separator.getByRole("button", { name: "Marcar separada" }).click();
			await expect(
				separator.getByText(
					"A unidade está Alugado: não dá para passar para Separado agora.",
				),
			).toBeVisible();

			await separator.goto("/locacoes/LOC-0027/volta/MAR-001");
			await answerChecklist(separator);
			await separator.getByRole("button", { name: "Concluir volta" }).click();
			await expect(heading(separator, "LOC-0027")).toBeVisible();

			await separator.goto(`/locacoes/${number}`);
			await separator.getByRole("button", { name: "Marcar separada" }).click();
			await expect(separator.getByText("Locação separada.")).toBeVisible();

			await page.goto(`/locacoes/${number}`);
			await expect(heading(page, number)).toBeVisible();
			await expect(page.getByText("Separada").first()).toBeVisible();
		});
	});
