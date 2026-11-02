import { expect, needsServer, test } from "../../support/test";
import {
	prepareScreen,
	settleForScreenshot,
	visualCases,
} from "../../support/visual";

for (const visual of visualCases()) {
	test.describe(visual.name, () => {
		test.use(visual.use);

		test("igual à linha de base", async ({ page }, testInfo) => {
			test.skip(
				testInfo.project.name !== visual.project,
				`só em ${visual.project}`,
			);
			needsServer("o estado das referências vem do seed do servidor");
			test.skip(
				process.platform !== "linux" &&
					process.env.E2E_VISUAL_REGRESSION !== "1",
				"As linhas de base são do Linux da imagem do Playwright: rode no CI ou com bun run e2e:update",
			);
			await prepareScreen(page, visual.screen);
			await settleForScreenshot(page, visual.project);
			await expect(page).toHaveScreenshot(`${visual.name}.png`, {
				mask: [page.getByText(/^Expira em \d+ h$/)],
				maxDiffPixelRatio: 0.01,
			});
		});
	});
}
