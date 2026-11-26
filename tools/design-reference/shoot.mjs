// Gera as imagens de referência do design a partir de docs/design/telas/*.dc.html.
// Uso, na raiz do repositório:  bun tools/design-reference/shoot.mjs [filtro]
// Exemplo: bun tools/design-reference/shoot.mjs painel   (só a tela 02)
// Saída: docs/design/referencias/<nn>-<tela>--<desktop|tablet|celular>.png
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const repo = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const outDir = join(repo, "docs/design/referencias");
mkdirSync(outDir, { recursive: true });

const types = { ".html": "text/html; charset=utf-8", ".woff2": "font/woff2" };
const server = createServer(async (req, res) => {
	try {
		const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
		const full = resolve(join(repo, path));
		if (!full.startsWith(repo)) throw new Error("fora do repositório");
		res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream" });
		res.end(await readFile(full));
	} catch {
		res.writeHead(404);
		res.end();
	}
});
await new Promise((ok) => server.listen(4789, ok));

const telas = [
	["TelaEntrar", "01-entrar"], ["TelaPainel", "02-painel"], ["TelaAgenda", "03-agenda"],
	["TelaNovaLocacao", "04-nova-locacao"], ["TelaLocacoes", "05-locacoes"], ["TelaLocacao", "06-locacao"],
	["TelaEstoque", "07-estoque"], ["TelaUnidade", "08-unidade"], ["TelaClientes", "09-clientes"],
	["TelaCliente", "10-cliente"], ["TelaDinheiro", "11-dinheiro"], ["TelaChecklist", "12-saida-e-volta"],
	["TelaManutencao", "13-manutencao"],
];
const sizes = [["desktop", 1440, 900], ["tablet", 834, 1194], ["phone", 390, 844]];
const only = process.argv[2];
const base = "http://localhost:4789/tools/design-reference/render.html";
const browser = await chromium.launch();
const errors = [];

for (const [file, slug] of telas) {
	if (only && !slug.includes(only)) continue;
	for (const [bp, w, h] of sizes) {
		const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
		await page.goto(`${base}?file=${file}&bp=${bp}&h=${h}`);
		await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error, null, { timeout: 15000 });
		const err = await page.evaluate(() => document.body.dataset.error);
		if (err) errors.push(`${slug} ${bp}: ${err}`);
		// Viewport do tamanho do conteúdo, para a barra inferior "sticky" do celular ficar no fim da página.
		const full = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, window.innerHeight));
		await page.setViewportSize({ width: w, height: full });
		await page.waitForTimeout(100);
		await page.screenshot({ path: join(outDir, `${slug}--${bp === "phone" ? "celular" : bp}.png`) });
		await page.close();
	}
}
if (!only || "14-mais".includes(only)) {
	const page = await browser.newPage({ viewport: { width: 600, height: 1100 }, deviceScaleFactor: 1 });
	await page.goto(`${base}?file=Mais`);
	await page.waitForFunction(() => document.body.dataset.ready || document.body.dataset.error);
	await page.locator('div[style*="height: 844px"]').first().screenshot({ path: join(outDir, "14-mais--celular.png") });
	await page.close();
}
await browser.close();
server.close();
if (errors.length) {
	console.error(errors.join("\n"));
	process.exit(1);
}
console.log(`Referências geradas em ${outDir}`);
