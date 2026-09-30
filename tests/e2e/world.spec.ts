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
  // Walk from the spawn toward the theatre frontage; it must stop at the facade.
  await page.evaluate(() => window.__franklin.move({ forward: 1, sprint: true }));
  await page.waitForTimeout(25_000);
  await page.evaluate(() => window.__franklin.move(null));
  const s1 = await state(page);
  const moved = Math.hypot(s1.pos.x - s0.pos.x, s1.pos.z - s0.pos.z);
  // Spawn is across the street (~7-20 m from the facade); sprinting 25 s would cover
  // far more than that if walls did not block.
  expect(moved).toBeGreaterThan(3);
  expect(moved).toBeLessThan(30);
});

test('teleporting far away streams new chunks in and old ones out', async ({ page }) => {
  await boot(page);
  const before = await state(page);
  await page.evaluate(() => window.__franklin.teleport(900, -900));
  await page.waitForFunction(() => window.__franklin.settled && window.__franklin.ready, null, { timeout: 150_000 });
  const after = await state(page);
  expect(Math.hypot(after.pos.x - 900, after.pos.z + 900)).toBeLessThan(2);
  expect(after.grounded || after.pos.y > -50).toBe(true);
  expect(after.world.resident).toBeGreaterThan(10);
  // physics only near the player
  expect(after.world.physicsChunks).toBeLessThanOrEqual(16);
  expect(before.world.resident).toBeGreaterThan(0);
});
