import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import {
	DEMO_PASSWORD,
	IS_MOCK,
	REFERENCE_NOW,
	storageStateOf,
	USERS,
	type Username,
	WEB_URL,
} from "./env";
import { resetServer } from "./server";

export default async function globalSetup(_config: FullConfig): Promise<void> {
	if (!IS_MOCK) await resetServer(REFERENCE_NOW);
	const browser = await chromium.launch();
	try {
		for (const username of Object.keys(USERS) as Username[]) {
			const context = await browser.newContext({
				baseURL: WEB_URL,
				locale: "pt-BR",
				timezoneId: "America/Maceio",
			});
			await context.clock.setFixedTime(new Date(REFERENCE_NOW));
			const page = await context.newPage();
			await page.goto("/entrar");
			await page.getByLabel("Usuário").fill(username);
			await page.getByLabel("Senha", { exact: true }).fill(DEMO_PASSWORD);
			await page.getByRole("button", { name: "Entrar", exact: true }).click();
			await page.waitForURL("**/painel");
			const path = storageStateOf(username);
			mkdirSync(dirname(path), { recursive: true });
			await context.storageState({ path });
			await context.close();
		}
	} finally {
		await browser.close();
	}
}
