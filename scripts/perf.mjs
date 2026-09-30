// Scripted perf capture against a running preview/dev server.
// Usage: node scripts/perf.mjs [--url http://127.0.0.1:4173] [--out artifacts/perf-<ts>.json]
// On SwiftShader (no GPU) FPS is not meaningful; cpu ms/frame, chunk build ms, draw calls and
// triangle counts are. Pass --gpu to launch without SwiftShader flags on a machine with a GPU.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const gpu = process.argv.includes('--gpu');
const base = arg('--url', 'http://127.0.0.1:4173');
const out = arg('--out', `artifacts/perf-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const query = gpu ? '?nohelp' : '?renderer=webgl&quality=low&nohelp';

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: gpu ? ['--enable-unsafe-webgpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const t0 = Date.now();
await page.goto(base + '/' + query);
await page.waitForFunction(() => window.__franklin?.settled || window.__franklinError, null, { timeout: 180000 });
const bootMs = Date.now() - t0;

const sample = async (label, fn, ms) => {
  await page.evaluate(() => window.__franklin.resetPerf());
  if (fn) await page.evaluate(fn);
  await page.waitForTimeout(ms);
  const s = await page.evaluate(() => window.__franklin.state());
  await page.evaluate(() => window.__franklin.move(null));
  return { label, perf: s.perf, render: s.render, world: s.world, pos: s.pos };
};

const results = [];
results.push(await sample('idle-spawn', null, 8000));
results.push(await sample('walk-main-street', () => { window.__franklin.look(-56); window.__franklin.move({ forward: 1, sprint: true }); }, 12000));
results.push(await sample('look-around', () => window.__franklin.look(90, 0), 6000));
results.push(await sample('aerial-60m', () => { window.__franklin.setFly(true); window.__franklin.setY(60); window.__franklin.look(200, -30); }, 8000));
const report = {
  when: new Date().toISOString(), url: base + '/' + query, gpu, bootToSettledMs: bootMs,
  userAgent: await page.evaluate(() => navigator.userAgent), results,
};
mkdirSync('artifacts', { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out, bootToSettledMs: bootMs, summary: results.map((r) => ({ label: r.label, cpuAvg: +r.perf.cpuAvg.toFixed(2), p50: +r.perf.p50.toFixed(1), draws: r.render.drawCalls, tris: r.render.triangles, chunks: r.world.resident, maxBuild: +r.world.maxChunkBuildMs.toFixed(1) })) }, null, 1));
await browser.close();
