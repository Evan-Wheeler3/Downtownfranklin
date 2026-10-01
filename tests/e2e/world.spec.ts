import { expect, test, type Page } from '@playwright/test';

/**
 * Runtime acceptance for the geographic world slice (see docs/ACCEPTANCE.md, M2).
 * Runs against the production build (vite preview) using the WebGL2 backend on
 * SwiftShader, so frame-rate numbers here are NOT representative of real GPUs.
 */
type Api = {
  ready: boolean;
  settled: boolean;
  state(): {
    backend: string;
    pos: { x: number; y: number; z: number };
    grounded: boolean;
    geo: { lon: number; lat: number };
    world: { resident: number; physicsChunks: number; buildingsResident: number; maxChunkBuildMs: number };
    colliders: number;
    perf: { p50: number; p95: number; cpuAvg: number };
    render: { drawCalls: number; triangles: number };
    locate: { street?: string; place?: string };
    probe: { inside: boolean; facadeDist: number };
  };
  teleport(x: number, z: number, yawDeg?: number): void;
  look(yawDeg: number, pitchDeg?: number): void;
  move(intent: Record<string, number | boolean> | null): void;
};

declare global {
  interface Window {
    __franklin: Api;
    __franklinError?: string;
  }
}

async function boot(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text());
  });
  await page.goto('/?renderer=webgl&quality=low&nohelp');
  await page.waitForFunction(() => window.__franklin?.settled || window.__franklinError, null, { timeout: 150_000 });
  expect(await page.evaluate(() => window.__franklinError ?? null)).toBeNull();
  return errors;
}

const state = (page: Page) => page.evaluate(() => window.__franklin.state());

test('boots into downtown on Main Street, grounded, with streaming and collision', async ({ page }) => {
  const errors = await boot(page);
  const s = await state(page);
  expect(['webgl2', 'webgpu']).toContain(s.backend);
  expect(s.grounded).toBe(true);
  expect(s.locate.street).toBe('Main Street');
  // Spawn is within ~40 m of the Franklin Theatre (Overture/NAD: 419 Main St).
  expect(Math.abs(s.geo.lat - 35.9242)).toBeLessThan(0.0005);
  expect(Math.abs(s.geo.lon + 86.8709)).toBeLessThan(0.0005);
  expect(s.world.resident).toBeGreaterThan(50);
  expect(s.world.physicsChunks).toBeGreaterThan(0);
  expect(s.colliders).toBeGreaterThan(0);
  expect(s.world.buildingsResident).toBeGreaterThan(500);
  await page.screenshot({ path: 'test-results/spawn.png' });
  expect(errors).toEqual([]);
});

test('walking moves the player along the street and stays grounded', async ({ page }) => {
  await boot(page);
  const a = await state(page);
  // Main Street runs roughly SW-NE here; walk NE along it (toward the Public Square).
  await page.evaluate(() => {
    window.__franklin.look(-56);
    window.__franklin.move({ forward: 1, sprint: true });
  });
  await page.waitForFunction(
    (p0) => {
      const p = window.__franklin.state().pos;
      return Math.hypot(p.x - p0.x, p.z - p0.z) > 15;
    },
    a.pos,
    { timeout: 120_000 },
  );
  await page.evaluate(() => window.__franklin.move(null));
  const b = await state(page);
  expect(Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z)).toBeGreaterThan(15);
  expect(Math.abs(b.pos.y - a.pos.y)).toBeLessThan(5);
  expect(b.grounded).toBe(true);
});

test('buildings block movement', async ({ page }) => {
  await boot(page);
  const s0 = await state(page);
  expect(s0.probe.inside).toBe(false);
  // Sprint from the spawn toward the theatre frontage until we stop getting closer.
  await page.evaluate(() => window.__franklin.move({ forward: 1, sprint: true }));
  // Stop once the player has stopped moving (blocked) for several consecutive samples.
  let prev = s0.pos;
  let stalls = 0;
  for (let i = 0; i < 90 && stalls < 4; i++) {
    await page.waitForTimeout(2000);
    const p = (await state(page)).pos;
    stalls = Math.hypot(p.x - prev.x, p.z - prev.z) < 0.02 ? stalls + 1 : 0;
    prev = p;
  }
  await page.evaluate(() => window.__franklin.move(null));
  const s1 = await state(page);
  // Something solid (a facade, or street furniture in front of it) stopped us before we could
  // enter the building, and we never ended up inside a footprint.
  expect(stalls).toBeGreaterThanOrEqual(4);
  expect(s1.probe.inside).toBe(false);
  expect(s1.probe.facadeDist).toBeLessThan(4);
  expect(Math.hypot(s1.pos.x - s0.pos.x, s1.pos.z - s0.pos.z)).toBeGreaterThan(3);
});

test('teleporting far away streams new chunks in and old ones out', async ({ page }) => {
  await boot(page);
  const before = await state(page);
  // A target ~well inside the far corner of the world bounds.
  const target = await page.evaluate(async () => {
    const m = await (await fetch('/world/manifest.json')).json();
    return { x: m.bounds.maxX - 200, z: m.bounds.maxZ - 200 };
  });
  await page.evaluate((t) => window.__franklin.teleport(t.x, t.z), target);
  await page.waitForFunction(() => window.__franklin.settled && window.__franklin.ready, null, { timeout: 150_000 });
  const after = await state(page);
  expect(Math.hypot(after.pos.x - target.x, after.pos.z - target.z)).toBeLessThan(2);
  await page.waitForFunction(() => window.__franklin.state().grounded, null, { timeout: 60_000 });
  expect(after.world.resident).toBeGreaterThan(10);
  // physics only near the player
  expect(after.world.physicsChunks).toBeLessThanOrEqual(16);
  expect(before.world.resident).toBeGreaterThan(0);
});
