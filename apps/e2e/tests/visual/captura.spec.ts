import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { E2E_ROOT } from "../../support/env";
import { expect, test } from "../../support/test";
import {
	prepareScreen,
	settleForScreenshot,
	visualCases,
} from "../../support/visual";

const OUTPUT = join(E2E_ROOT, "visual-output/app");
mkdirSync(OUTPUT, { recursive: true });

for (const visual of visualCases()) {
	test.describe(visual.name, () => {
		test.use(visual.use);

		test("captura no estado da referência", async ({ page }, testInfo) => {
			test.skip(
				testInfo.project.name !== visual.project,
				`só em ${visual.project}`,
			);
			await prepareScreen(page, visual.screen);
			const viewport = await settleForScreenshot(page, visual.project);
			expect(viewport.width).toBeGreaterThan(0);
			await page.screenshot({ path: join(OUTPUT, `${visual.name}.png`) });
		});
	});
}
