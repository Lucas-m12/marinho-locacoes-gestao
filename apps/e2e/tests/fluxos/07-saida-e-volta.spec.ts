import { fileURLToPath } from "node:url";
import { answerChecklist, checklistItems, heading } from "../../support/app";
import { S3 } from "../../support/env";
import {
	as,
	expect,
	needsServer,
	onlyProjects,
	test,
} from "../../support/test";

const PHOTO = fileURLToPath(
	new URL("../../fixtures/foto.jpg", import.meta.url),
);

onlyProjects("celular");
test.use(as("equipamentos"));

test("saída e volta de LOC-0029 com foto, ocorrência e retenção da caução", async ({
	page,
	openContext,
}) => {
	needsServer("envia a foto de verdade para o MinIO");

	await page.goto("/locacoes/LOC-0029/saida/MAR-002");
	await expect(heading(page, "Saída · MAR-002")).toBeVisible();
	await answerChecklist(page);
	await expect(page.getByText(/(\d+) de \1 itens conferidos/)).toBeVisible();

	let releaseUpload: () => void = () => undefined;
	const uploadHeld = new Promise<void>((resolve) => {
		releaseUpload = resolve;
	});
	await page.route(`**/${S3.bucket}/**`, async (route) => {
		if (route.request().method() === "PUT") await uploadHeld;
		await route.continue();
	});
	const front = page.getByRole("button", { name: "Enviar Frente" });
	await front.locator("input[type=file]").setInputFiles(PHOTO);
	const uploading = page.getByRole("button", { name: /Frente/ });
	await expect(uploading).toBeDisabled();
	await expect(uploading).toContainText(/\d+%/);
	releaseUpload();
	await expect(page.getByText("Frente salvo.")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Trocar Frente" }),
	).toBeVisible();
	await expect(page.getByRole("img", { name: "Frente" })).toBeVisible();

	const delivery = page.getByRole("region", { name: "Na entrega" });
	await delivery.getByRole("checkbox", { name: /Termo assinado/ }).check();
	await delivery.getByRole("checkbox", { name: /Caução .*recebida/ }).check();
	const depositValue = delivery.getByLabel("Valor");
	if ((await depositValue.count()) > 0) await depositValue.fill("300,00");
	await delivery.getByRole("button", { name: "Concluir saída" }).click();

	await expect(page.getByText("Saída concluída.")).toBeVisible();
	await expect(heading(page, "LOC-0029")).toBeVisible();
	await expect(page.getByText("Na obra").first()).toBeVisible();
	await page.goto("/estoque/MAR-002");
	await expect(heading(page, "MAR-002")).toBeVisible();
	await expect(page.getByText("Alugado").first()).toBeVisible();

	await page.goto("/locacoes/LOC-0029");
	await page.getByRole("link", { name: "Registrar devolução" }).click();
	await expect(heading(page, "Volta · MAR-002")).toBeVisible();
	const firstItem = await checklistItems(page)
		.first()
		.locator("legend")
		.textContent();
	await answerChecklist(page, { notOk: firstItem ?? "" });
	const back = page.getByRole("region", { name: "Na volta" });
	await expect(back).toContainText("1 ocorrência para decidir");
	await expect(back).toContainText(firstItem ?? "");
	await back.getByRole("radio", { name: /Em inspeção/ }).check();
	await back.getByRole("button", { name: "Concluir volta" }).click();

	await expect(page.getByText("Volta concluída.")).toBeVisible();
	await expect(heading(page, "LOC-0029")).toBeVisible();
	await expect(page.getByText("Devolvida").first()).toBeVisible();
	await expect(page.getByText(firstItem ?? "").first()).toBeVisible();

	const manager = await (await openContext(as("lucas").storageState)).newPage();
	await manager.goto("/locacoes/LOC-0029");
	const deposit = manager.getByRole("region", { name: "Caução" });
	await expect(deposit).toContainText("R$ 300");
	await deposit.getByRole("button", { name: "Reter" }).click();
	const retain = manager.getByRole("dialog", { name: "Reter caução" });
	await retain.getByLabel("Valor").fill("100,00");
	await retain.getByLabel("Motivo").fill("Cabo danificado na volta");
	await retain.getByRole("button", { name: "Salvar" }).click();
	await expect(manager.getByText("Caução atualizada.")).toBeVisible();
	await expect(deposit).toContainText("Retida: R$ 100");

	await manager.goto("/dinheiro?conta=caucao");
	const depositEntries = manager.getByRole("tabpanel");
	await expect(depositEntries).toContainText("LOC-0029");
	await expect(depositEntries).toContainText("R$ 100");
	await manager.goto("/dinheiro?conta=caixa");
	const cash = manager.getByRole("tabpanel");
	await expect(
		cash.getByText(/Cabo danificado na volta|Caução retida/).first(),
	).toBeVisible();

	await page.goto("/estoque/MAR-002");
	await expect(page.getByText("Em inspeção").first()).toBeVisible();
});
