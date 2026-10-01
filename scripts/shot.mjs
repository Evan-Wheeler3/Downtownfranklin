// Ad-hoc runtime inspection: node scripts/shot.mjs [out.png] [js-to-eval-before-shot]
// Requires a running server at $URL (default preview :4173).
import { chromium } from '@playwright/test';
const url = process.env.URL ?? 'http://127.0.0.1:4173/?renderer=webgl&quality=low&nohelp&play';
const out = process.argv[2] ?? 'artifacts/shot.png';
const pre = process.argv[3] ?? '';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForFunction(() => window.__franklin?.settled || window.__franklinError, null, { timeout: 300000 });
if (pre) { await page.evaluate(pre); await page.waitForTimeout(500); await page.waitForFunction(() => window.__franklin.settled, null, { timeout: 300000 }); }
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
console.log(JSON.stringify(await page.evaluate(() => window.__franklin?.state?.() ?? window.__franklinError), null, 1));
console.log(logs.slice(0, 30).join('\n'));
await browser.close();
