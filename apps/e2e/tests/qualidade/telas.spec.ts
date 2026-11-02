import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { mainNav, projectOf } from "../../support/app";
import { openScreen, SCREENS } from "../../support/screens";
import { as, expect, signedOut, test } from "../../support/test";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const AXE_IGNORED: Record<string, string> = {};

const TOUCH_MIN = 44;

const NAV_WIDTH = { desktop: 248, tablet: 88 } as const;

async function smallTargets(page: Page) {
	return page.evaluate((min) => {
		const selector = "button, a[href], input, [role=tab]";
		const nameOf = (element: Element) =>
			(
				element.getAttribute("aria-label") ||
				element.textContent ||
				element.getAttribute("name") ||
				element.id ||
				element.tagName
			)
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, 60);
		const isVisuallyHidden = (element: Element, rect: DOMRect) =>
			rect.width <= 1 ||
			rect.height <= 1 ||
			element.closest("[aria-hidden=true], [hidden], [inert]") !== null;
		const isInlineTextLink = (element: Element) =>
			element.tagName === "A" && element.closest("p") !== null;
		const targetRect = (element: Element) => {
			const wrappingLabel =
				element.tagName === "INPUT" ? element.closest("label") : null;
			return (wrappingLabel ?? element).getBoundingClientRect();
		};
		return [...document.querySelectorAll(selector)].flatMap((element) => {
			const style = getComputedStyle(element);
			const rect = element.getBoundingClientRect();
			if (style.display === "none" || style.visibility === "hidden") return [];
			if (isVisuallyHidden(element, rect) || isInlineTextLink(element)) {
				return [];
			}
			const target = targetRect(element);
			const width = Math.round(target.width);
			const height = Math.round(target.height);
			return width < min || height < min
				? [
						`${element.tagName.toLowerCase()} "${nameOf(element)}": ${width}×${height}`,
					]
				: [];
		});
	}, TOUCH_MIN);
}

for (const screen of SCREENS) {
	test.describe(`${screen.id}`, () => {
		test.use(screen.user ? as(screen.user) : signedOut);

		// biome-ignore lint/correctness/noEmptyPattern: o Playwright exige o objeto de fixtures
		test.beforeEach(({}, testInfo) => {
			test.skip(
				!screen.projects.includes(projectOf(testInfo)),
				`${screen.id} não existe em ${testInfo.project.name}`,
			);
		});

		test("acessibilidade sem violações sérias ou críticas", async ({
			page,
		}) => {
			await openScreen(page, screen);
			const results = await new AxeBuilder({ page })
				.withTags(AXE_TAGS)
				.disableRules(Object.keys(AXE_IGNORED))
				.analyze();
			const serious = results.violations
				.filter((violation) =>
					["serious", "critical"].includes(violation.impact ?? ""),
				)
				.map(
					(violation) =>
						`${violation.id} (${violation.impact}): ${violation.help}\n    ${violation.nodes
							.slice(0, 5)
							.map((node) => node.target.join(" "))
							.join("\n    ")}`,
				);
			expect(serious, serious.join("\n")).toEqual([]);
		});

		test("sem rolagem horizontal", async ({ page }) => {
			await openScreen(page, screen);
			const overflow = await page.evaluate(() => ({
				scroll: document.documentElement.scrollWidth,
				client: document.documentElement.clientWidth,
			}));
			expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
		});

		test("alvos de toque com pelo menos 44 × 44 px", async ({
			page,
		}, testInfo) => {
			test.skip(
				projectOf(testInfo) === "desktop",
				"Alvos de toque só no tablet e no celular",
			);
			await openScreen(page, screen);
			const small = await smallTargets(page);
			expect(small, `Alvos pequenos:\n${small.join("\n")}`).toEqual([]);
		});

		test("navegação certa para o tamanho", async ({ page }, testInfo) => {
			const project = projectOf(testInfo);
			test.skip(screen.user === null, "Tela sem menu");
			await openScreen(page, screen);
			const nav = mainNav(page);
			await expect(nav).toHaveCount(1);
			const box = await nav.boundingBox();
			const viewport = page.viewportSize();
			if (!box || !viewport) throw new Error("menu sem posição");
			if (project === "celular") {
				expect(Math.round(box.width)).toBe(viewport.width);
				expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
			} else {
				expect(Math.round(box.x)).toBe(0);
				expect(Math.round(box.width)).toBe(NAV_WIDTH[project]);
			}
			const expected = screen.nav[project];
			const menuItems = await nav
				.locator('[aria-current="page"]')
				.evaluateAll((links) =>
					links
						.filter(
							(link) =>
								!link.getAttribute("href")?.endsWith("/locacoes/nova") &&
								(link.textContent ?? "").trim() !== "",
						)
						.map((link) => (link.textContent ?? "").trim()),
				)
				.then((names) =>
					names.map((name) =>
						expected &&
						(name.startsWith(expected) ||
							expected.startsWith(name.replace(/\.$/, "")))
							? expected
							: name,
					),
				);
			expect(menuItems).toEqual(expected ? [expected] : []);
		});

		if (screen.states?.empty) {
			const empty = screen.states.empty;
			test("estado vazio", async ({ page }) => {
				await openScreen(page, screen);
				await empty.act(page);
				await expect(page.getByText(empty.text, { exact: true })).toBeVisible();
			});
		}

		if (screen.states) {
			const pattern = `**/rpc/${screen.states.procedure}`;

			test("estado carregando", async ({ page }) => {
				let release: () => void = () => undefined;
				const held = new Promise<void>((resolve) => {
					release = resolve;
				});
				await page.route(pattern, async (route: Route) => {
					await held;
					await route.continue();
				});
				await screen.open(page).catch(() => undefined);
				await expect(
					page.getByRole("status", { name: "Carregando" }).first(),
				).toBeVisible();
				release();
				await openScreen(page, screen);
			});

			test("estado de erro com Tentar de novo", async ({ page, guards }) => {
				guards.allow(/resposta 500/);
				guards.allow(/status of 500/);
				let failing = true;
				await page.route(pattern, async (route: Route) => {
					if (failing) {
						await route.fulfill({
							status: 500,
							contentType: "application/json",
							body: JSON.stringify({
								json: {
									defined: false,
									code: "INTERNAL_SERVER_ERROR",
									status: 500,
									message: "Erro forçado pelo teste",
								},
							}),
						});
						return;
					}
					await route.continue();
				});
				await screen.open(page).catch(() => undefined);
				const retry = page.getByRole("button", { name: "Tentar de novo" });
				await expect(retry.first()).toBeVisible({ timeout: 20_000 });
				failing = false;
				await retry.first().click();
				await openScreen(page, screen);
				await expect(retry).toHaveCount(0);
			});
		}
	});
}
