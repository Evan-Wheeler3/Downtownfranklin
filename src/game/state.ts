import { ITEMS } from '../content/items';

/** Mutable player-progress state. Pure logic (no DOM/three) so it is unit-testable and saveable. */
export interface PlayerState {
  money: number;
  energy: number; // 0..100
  mood: number; // 0..100
  inventory: Record<string, number>;
  jobsDone: number;
  earned: number;
  visited: string[]; // place ids
  flags: Record<string, boolean>;
}

export function newPlayerState(): PlayerState {
  return { money: 25, energy: 80, mood: 60, inventory: {}, jobsDone: 0, earned: 0, visited: [], flags: {} };
}

export type Result = { ok: true; msg: string } | { ok: false; msg: string };

export function addItem(s: PlayerState, id: string, n = 1): void {
  s.inventory[id] = (s.inventory[id] ?? 0) + n;
}

export function removeItem(s: PlayerState, id: string, n = 1): boolean {
  const have = s.inventory[id] ?? 0;
  if (have < n) return false;
  if (have === n) delete s.inventory[id];
  else s.inventory[id] = have - n;
  return true;
}

export function buy(s: PlayerState, id: string): Result {
  const it = ITEMS[id];
  if (!it) return { ok: false, msg: 'Unknown item.' };
  if (s.money < it.price) return { ok: false, msg: `You need $${it.price - s.money} more.` };
  s.money -= it.price;
  addItem(s, id);
  return { ok: true, msg: `Bought ${it.name} for $${it.price}.` };
}

/** Eat/drink/use an item from the inventory. */
export function use(s: PlayerState, id: string): Result {
  const it = ITEMS[id];
  if (!it) return { ok: false, msg: 'Unknown item.' };
  if (it.kind === 'parcel') return { ok: false, msg: 'That belongs to someone else.' };
  if (!removeItem(s, id)) return { ok: false, msg: `You don't have ${it.name}.` };
  s.energy = Math.min(100, s.energy + (it.energy ?? 0));
  s.mood = Math.min(100, s.mood + (it.mood ?? 0));
  const verb = it.kind === 'drink' ? 'drink' : it.kind === 'food' ? 'eat' : 'enjoy';
  return { ok: true, msg: `You ${verb} the ${it.name.toLowerCase()}.` };
}

/** Passive needs over game time; sprinting costs extra energy. */
export function tickNeeds(s: PlayerState, gameMinutes: number, sprintingRealSeconds: number): void {
  s.energy = Math.max(0, s.energy - gameMinutes * (2 / 60) - sprintingRealSeconds * 0.35);
  s.mood = Math.max(0, Math.min(100, s.mood - gameMinutes * (1 / 60) + (s.energy > 60 ? gameMinutes * (0.5 / 60) : 0)));
}

export function pay(s: PlayerState, amount: number): void {
  s.money += amount;
  s.earned += amount;
}
