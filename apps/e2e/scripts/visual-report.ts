import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { E2E_ROOT, REPO_ROOT } from "../support/env";

const REFERENCES = join(REPO_ROOT, "docs/design/referencias");
const OUTPUT = join(E2E_ROOT, "visual-output");
const APP = join(OUTPUT, "app");
const DESIGN = join(OUTPUT, "design");
const DIFF = join(OUTPUT, "diff");
const FILL = [255, 0, 255, 255] as const;

type Row = {
	name: string;
	percent: number | null;
	designHeight: number;
	appHeight: number | null;
};

function padTo(image: PNG, width: number, height: number): PNG {
	const padded = new PNG({ width, height });
	for (let index = 0; index < padded.data.length; index += 4) {
		padded.data.set(FILL, index);
	}
	PNG.bitblt(image, padded, 0, 0, Math.min(image.width, width), Math.min(image.height, height), 0, 0);
	return padded;
}

function compare(name: string): Row {
	const design = PNG.sync.read(readFileSync(join(REFERENCES, name)));
	copyFileSync(join(REFERENCES, name), join(DESIGN, name));
	const appPath = join(APP, name);
	if (!existsSync(appPath)) {
		return { name, percent: null, designHeight: design.height, appHeight: null };
	}
	const app = PNG.sync.read(readFileSync(appPath));
	const width = Math.max(design.width, app.width);
	const height = Math.max(design.height, app.height);
	const left = padTo(design, width, height);
	const right = padTo(app, width, height);
	const diff = new PNG({ width, height });
	const changed = pixelmatch(left.data, right.data, diff.data, width, height, {
		threshold: 0.1,
		alpha: 0.25,
	});
	writeFileSync(join(DIFF, name), PNG.sync.write(diff));
	return {
		name,
		percent: (changed / (width * height)) * 100,
		designHeight: design.height,
		appHeight: app.height,
	};
}

function html(rows: Row[], generatedAt: string): string {
	const cards = rows
		.map((row) => {
			const percent =
				row.percent === null ? "sem captura" : `${row.percent.toFixed(1)}%`;
			const height =
				row.appHeight === null
					? ""
					: `altura: design ${row.designHeight}px, app ${row.appHeight}px (${row.appHeight - row.designHeight >= 0 ? "+" : ""}${row.appHeight - row.designHeight})`;
			const app =
				row.appHeight === null
					? "<p>Rode <code>bun run e2e:visual</code>.</p>"
					: `<a href="app/${row.name}"><img loading="lazy" src="app/${row.name}" alt="App"></a>`;
			const diff =
				row.appHeight === null
					? ""
					: `<a href="diff/${row.name}"><img loading="lazy" src="diff/${row.name}" alt="Diferença"></a>`;
			return `<section id="${row.name}">
<h2>${row.name.replace(".png", "")} <span class="pct">${percent}</span></h2>
<p class="meta">${height}</p>
<div class="grid">
<figure><figcaption>Design</figcaption><a href="design/${row.name}"><img loading="lazy" src="design/${row.name}" alt="Design"></a></figure>
<figure><figcaption>App</figcaption>${app}</figure>
<figure><figcaption>Diferença</figcaption>${diff}</figure>
</div>
</section>`;
		})
		.join("\n");
	const index = rows
		.map(
			(row) =>
				`<tr><td><a href="#${row.name}">${row.name.replace(".png", "")}</a></td><td>${row.percent === null ? "—" : `${row.percent.toFixed(1)}%`}</td><td>${row.appHeight === null ? "—" : row.appHeight - row.designHeight}</td></tr>`,
		)
		.join("\n");
	return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design × App</title>
<style>
:root { color-scheme: light; --bg: #F2E8D7; --card: #FBF6EC; --ink: #13294B; --muted: #5E544C; }
body { margin: 0; padding: 24px; background: var(--bg); color: var(--ink); font: 15px/1.4 system-ui, sans-serif; }
h1 { margin: 0 0 4px; }
table { border-collapse: collapse; background: var(--card); margin: 16px 0 32px; }
td, th { padding: 6px 12px; border-bottom: 1px solid #E6DAC6; text-align: left; }
section { background: var(--card); border-radius: 12px; padding: 16px; margin-bottom: 24px; }
section h2 { margin: 0; font-size: 18px; }
.pct { color: #8A3A1A; }
.meta { color: var(--muted); margin: 4px 0 12px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
figure { margin: 0; }
figcaption { font-weight: 700; margin-bottom: 6px; }
img { width: 100%; height: auto; border: 1px solid #E6DAC6; background: #fff; }
</style>
</head>
<body>
<h1>Design × App</h1>
<p>Gerado em ${generatedAt}. Pixelmatch com limiar 0,1; quando as alturas diferem, as imagens ficam alinhadas pelo topo e o resto é preenchido de magenta. Ordem: da maior diferença para a menor.</p>
<table><thead><tr><th>Tela</th><th>Diferença</th><th>Altura (app − design)</th></tr></thead><tbody>
${index}
</tbody></table>
${cards}
</body>
</html>
`;
}

for (const dir of [OUTPUT, DESIGN, DIFF, APP]) mkdirSync(dir, { recursive: true });
const rows = readdirSync(REFERENCES)
	.filter((name) => name.endsWith(".png"))
	.map(compare)
	.sort((a, b) => (b.percent ?? 101) - (a.percent ?? 101));
const generatedAt = new Date().toISOString();
writeFileSync(join(OUTPUT, "index.html"), html(rows, generatedAt));
writeFileSync(
	join(OUTPUT, "summary.json"),
	`${JSON.stringify({ generatedAt, rows }, null, "\t")}\n`,
);
for (const row of rows) {
	console.log(
		`${row.name.padEnd(34)} ${row.percent === null ? "   —  " : `${row.percent.toFixed(1).padStart(5)}%`}  altura ${row.appHeight === null ? "—" : row.appHeight - row.designHeight}`,
	);
}
console.log(`\nRelatório: ${join(OUTPUT, "index.html")}`);
