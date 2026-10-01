import { expect, test, type Page } from '@playwright/test';

/** The core loop through the real UI: job board → pickup → delivery → paid → saved → continue. */
type F = {
  settled: boolean;
  ready: boolean;
  session(): { mode: string; state: { money: number; jobsDone: number; inventory: Record<string, number> }; job: { steps: { action: string; placeId: string }[]; step: number; reward: number } | null; board: { kind: string }[] };
  place(id: string): { stand: [number, number, number]; name: string } | null;
  teleport(x: number, z: number, yawDeg?: number): void;
  acceptJob(i?: number): boolean;
  click(id: string): boolean;
  state(): { pos: { x: number; z: number } };
};
const W = () => (window as unknown as { __franklin: F }).__franklin;
void W;

async function goTo(page: Page, placeId: string) {
  const { stand, name } = await page.evaluate((id) => (window as unknown as { __franklin: F }).__franklin.place(id)!, placeId);
  await page.evaluate((s) => (window as unknown as { __franklin: F }).__franklin.teleport(s[0], s[2]), stand);
  await page.waitForFunction((s) => {
    const p = (window as unknown as { __franklin: F }).__franklin.state().pos;
    return (window as unknown as { __franklin: F }).__franklin.ready && Math.hypot(p.x - s[0], p.z - s[2]) < 1.5;
  }, stand, { timeout: 120_000 });
  // prompt for *this* door appears when standing at it
  await expect(page.locator('.fr-prompt')).toContainText(name, { timeout: 60_000 });
}

async function interact(page: Page) {
  await page.keyboard.press('e');
  await expect(page.locator('.fr-card')).toBeVisible({ timeout: 60_000 });
}

test('complete a delivery job through the UI, then continue from the save', async ({ page }) => {
  await page.goto('/?renderer=webgl&quality=low&nohelp&play');
  await page.waitForFunction(() => (window as unknown as { __franklin: F }).__franklin?.settled, null, { timeout: 240_000 });
  const s0 = await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.session());
  expect(s0.mode).toBe('playing');
  expect(new Set(s0.board.map((j) => j.kind)).size).toBeGreaterThanOrEqual(3); // variety

  // accept the first parcel job on the board
  const idx = s0.board.findIndex((j) => j.kind === 'delivery' || j.kind === 'rush');
  expect(await page.evaluate((i) => (window as unknown as { __franklin: F }).__franklin.acceptJob(i), idx)).toBe(true);
  const job = (await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.session().job))!;
  await expect(page.locator('.fr-obj')).toContainText('Pick up the parcel');

  // pickup
  await goTo(page, job.steps[0]!.placeId);
  await interact(page);
  expect(await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.click('job-action'))).toBe(true);
  expect((await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.session().state.inventory)).parcel).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.fr-card')).toBeHidden({ timeout: 60_000 });
  await expect(page.locator('.fr-obj')).toContainText('Deliver the parcel', { timeout: 60_000 });

  // delivery
  await goTo(page, job.steps[1]!.placeId);
  await interact(page);
  expect(await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.click('job-action'))).toBe(true);
  const after = await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.session());
  expect(after.job).toBeNull();
  expect(after.state.jobsDone).toBe(1);
  expect(after.state.money).toBeGreaterThanOrEqual(s0.state.money + job.reward);
  await expect(page.locator('[data-ui="money"]')).toContainText(`$${after.state.money}`, { timeout: 60_000 });

  // reload: the title offers Continue, which restores progress
  await page.goto('/?renderer=webgl&quality=low&nohelp');
  await page.waitForFunction(() => (window as unknown as { __franklin: F }).__franklin?.ready, null, { timeout: 240_000 });
  await page.locator('[data-ui="continue"]').click();
  const restored = await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.session());
  expect(restored.mode).toBe('playing');
  expect(restored.state.money).toBe(after.state.money);
  expect(restored.state.jobsDone).toBe(1);
});

test('buying and eating restores energy', async ({ page }) => {
  await page.goto('/?renderer=webgl&quality=low&nohelp&play');
  await page.waitForFunction(() => (window as unknown as { __franklin: F }).__franklin?.ready, null, { timeout: 240_000 });
  // find an open café-like place via the debug API and buy from it
  const ok = await page.evaluate(() => {
    const f = (window as unknown as { __franklin: F }).__franklin as unknown as { setHour(h: number): void; openPlace(id: string): boolean };
    f.setHour(10);
    return true;
  });
  expect(ok).toBe(true);
  const placeId = await page.evaluate(async () => {
    const r = await (await fetch('/world/businesses.json')).json();
    const b = r.businesses.find((x: { inCore: boolean; door?: unknown; category?: string; confidence?: string }) =>
      x.inCore && x.door && x.confidence !== 'LOW' && /coffee|cafe/.test(x.category ?? ''));
    return b.id as string;
  });
  await page.evaluate((id) => ((window as unknown as { __franklin: F }).__franklin as unknown as { openPlace(id: string): boolean }).openPlace(id), placeId);
  await expect(page.locator('.fr-card')).toContainText('Open');
  const before = await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.session().state);
  expect(await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.click('buy-coffee'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.fr-card')).toBeHidden({ timeout: 60_000 });
  await page.keyboard.press('Tab');
  await expect(page.locator('.fr-card')).toContainText('Phone', { timeout: 60_000 });
  expect(await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.click('tab-bag'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.click('use-coffee'))).toBe(true);
  const st = await page.evaluate(() => (window as unknown as { __franklin: F }).__franklin.session().state as unknown as { money: number; energy: number });
  expect(st.money).toBe(before.money - 3);
  expect(st.energy).toBeGreaterThan((before as unknown as { energy: number }).energy);
});
