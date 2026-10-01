import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isOpen, PROFILES, profileFor } from '../../src/content/shops';
import { acceptJob, currentStep, generateJobs, interactJob, updateJob } from '../../src/game/jobs';
import { PlaceDirectory } from '../../src/game/places';
import { migrate, readSave, SAVE_VERSION, writeSave, type Storage } from '../../src/game/save';
import { buy, newPlayerState, tickNeeds, use } from '../../src/game/state';
import { GameClock } from '../../src/sim/clock';

const businesses = JSON.parse(readFileSync(resolve(__dirname, '../../public/world/businesses.json'), 'utf8')).businesses;
const dir = new PlaceDirectory(businesses);

describe('places & shops', () => {
  it('builds a directory of visitable downtown places with doors and profiles', () => {
    expect(dir.all.length).toBeGreaterThan(300);
    expect(dir.withStock().length).toBeGreaterThan(50);
    const theatre = dir.all.find((p) => p.hero === 'franklin_theatre');
    expect(theatre?.profile.key).toBe('theatre');
  });

  it('maps categories to profiles and handles hours past midnight', () => {
    expect(profileFor('coffee_shop', []).key).toBe('cafe');
    expect(profileFor('southern_american_restaurant', []).key).toBe('restaurant');
    expect(profileFor('bookstore', []).key).toBe('books');
    expect(isOpen(PROFILES.bar!, 23)).toBe(true);
    expect(isOpen(PROFILES.bar!, 1)).toBe(true);
    expect(isOpen(PROFILES.bar!, 3)).toBe(false);
    expect(isOpen(PROFILES.cafe!, 5)).toBe(false);
  });
});

describe('economy & needs', () => {
  it('buys, refuses without money, and consumes food for energy', () => {
    const s = newPlayerState();
    s.money = 5;
    s.energy = 50;
    expect(buy(s, 'coffee').ok).toBe(true);
    expect(s.money).toBe(2);
    expect(buy(s, 'meal').ok).toBe(false);
    expect(use(s, 'coffee').ok).toBe(true);
    expect(s.energy).toBe(68);
    expect(use(s, 'coffee').ok).toBe(false);
  });

  it('energy decays over game time and faster when sprinting', () => {
    const a = newPlayerState(), b = newPlayerState();
    tickNeeds(a, 60, 0);
    tickNeeds(b, 60, 20);
    expect(a.energy).toBeLessThan(80);
    expect(b.energy).toBeLessThan(a.energy);
  });
});

describe('jobs', () => {
  it('generates the same board for the same day, different boards for different days', () => {
    const d1 = generateJobs(dir, 3);
    expect(d1.length).toBe(4);
    expect(generateJobs(dir, 3)).toEqual(d1);
    expect(generateJobs(dir, 4)).not.toEqual(d1);
  });

  it('completes a parcel delivery and pays', () => {
    const job = generateJobs(dir, 1, 1234, 30).find((j) => j.kind === 'delivery')!;
    const s = newPlayerState();
    const j = acceptJob(job, 600);
    const from = dir.get(j.steps[0]!.placeId)!;
    const to = dir.get(j.steps[1]!.placeId)!;
    expect(interactJob(j, to, s, 600)?.ok ?? false).toBe(false); // wrong place first: nothing / refused
    expect(interactJob(j, from, s, 600)!.ok).toBe(true);
    expect(s.inventory.parcel).toBe(1);
    const r = interactJob(j, to, s, 620)!;
    expect(r.done).toBe(true);
    expect(s.money).toBe(25 + job.reward);
    expect(s.inventory.parcel).toBeUndefined();
    expect(currentStep(j)).toBeNull();
  });

  it('errands auto-advance when the item is bought, rush bonus only on time', () => {
    const errand = acceptJob(generateJobs(dir, 2, 1234, 30).find((j) => j.kind === 'errand')!, 0);
    const s = newPlayerState();
    s.money = 100;
    const item = errand.steps[0]!.item!;
    updateJob(errand, s);
    expect(errand.step).toBe(0);
    buy(s, item);
    updateJob(errand, s);
    expect(errand.step).toBe(1);

    const rushT = generateJobs(dir, 5, 1234, 40).find((j) => j.kind === 'rush')!;
    const late = acceptJob(rushT, 0);
    const s2 = newPlayerState();
    interactJob(late, dir.get(late.steps[0]!.placeId)!, s2, 0);
    interactJob(late, dir.get(late.steps[1]!.placeId)!, s2, 100);
    expect(s2.money).toBe(25 + rushT.reward); // no bonus after 45 min
  });
});

describe('save system', () => {
  const mem = (): Storage => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };

  it('round-trips the current version', () => {
    const st = mem();
    const player = newPlayerState();
    player.money = 77;
    writeSave(st, { clockMinutes: 1234, player, pos: [1, 2, 3], yaw: 0.5, job: null, takenJobs: ['d0-1'] });
    const s = readSave(st)!;
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.player.money).toBe(77);
    expect(s.takenJobs).toEqual(['d0-1']);
  });

  it('migrates a version-0 prototype save and fills missing player fields', () => {
    const s = migrate({ clockMinutes: 10, player: { money: 3 }, pos: [0, 0, 0], yaw: 0 });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.player.money).toBe(3);
    expect(s.player.energy).toBe(80);
    expect(s.takenJobs).toEqual([]);
  });

  it('rejects saves from the future and survives corrupt data', () => {
    expect(() => migrate({ version: SAVE_VERSION + 1 })).toThrow();
    const st = mem();
    st.setItem('franklin.save', '{not json');
    expect(readSave(st)).toBeNull();
  });
});

describe('clock', () => {
  it('formats time and advances', () => {
    const c = new GameClock(8 * 60 + 5);
    expect(c.format()).toBe('Mon 8:05 AM');
    c.advance(60 * 10); // 10 real minutes = 600 game minutes
    expect(c.format()).toBe('Mon 6:05 PM');
    c.skip(12 * 60);
    expect(c.weekday).toBe('Tuesday');
  });
});
