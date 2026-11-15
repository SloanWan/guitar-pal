// Draws score.html (Greensleeves, notation over tab, with VexFlow from
// node_modules) and writes public/listing/sample-tab.png, the image the
// directories' import_tab test case attaches. From the repo root:
//   node docs/listing/sample-tab/render.mjs
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../../public/listing/sample-tab.png");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1240, height: 1400 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`file://${here}/score.html`);
await page.waitForFunction(() => window.scoreReady === true, null, { timeout: 15000 });
await page.locator("#page").screenshot({ path: out });
await browser.close();
if (errors.length > 0) {
	console.error(errors.join("\n"));
	process.exit(1);
}
console.log(out);
