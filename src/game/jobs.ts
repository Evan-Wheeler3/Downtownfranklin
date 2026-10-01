import { mulberry32 } from '../core/hash';
import { ITEMS } from '../content/items';
import type { Place, PlaceDirectory } from './places';
import { addItem, pay, removeItem, type PlayerState, type Result } from './state';

/**
 * Odd jobs: data-driven, multi-step tasks between real downtown places (FICTIONAL gameplay).
 * Offers are deterministic per game day, so a save/reload sees the same board.
 */
export type StepAction = 'pickup' | 'deliver' | 'acquire' | 'bring';

export interface JobStep {
  action: StepAction;
  /** Target place (for 'acquire', a suggested shop that stocks the item). */
  placeId: string;
  item?: string;
}

export interface Job {
  id: string;
  kind: 'delivery' | 'errand' | 'rush';
  title: string;
  client: string;
  desc: string;
  reward: number;
  bonus?: number;
  /** Game-minute deadline for the bonus (rush jobs). */
  deadline?: number;
  steps: JobStep[];
  step: number;
}

function dist(a: Place, b: Place): number {
  return Math.hypot(a.stand[0] - b.stand[0], a.stand[2] - b.stand[2]);
}

const ERRAND_ITEMS = ['coffee', 'latte', 'pastry', 'flowers', 'novel', 'fudge', 'sandwich', 'icecream', 'candle'];

export function generateJobs(dir: PlaceDirectory, day: number, seed = 1234, count = 4): Job[] {
  const rnd = mulberry32(seed * 7919 + day * 104729);
  const places = dir.all;
  const shops = dir.withStock();
  const jobs: Job[] = [];
  let guard = 0;
  while (jobs.length < count && guard++ < 200 && places.length > 2) {
    const a = places[Math.floor(rnd() * places.length)]!;
    const b = places[Math.floor(rnd() * places.length)]!;
    const d = dist(a, b);
    if (a.id === b.id || d < 90 || d > 650) continue;
    // The first three offers cover each kind once (variety); later ones are random.
    const forced = [0.2, 0.6, 0.9];
    const offset = day % 3;
    const roll = jobs.length < 3 ? forced[(jobs.length + offset) % 3]! : rnd();
    const id = `d${day}-${jobs.length}`;
    if (roll < 0.45) {
      jobs.push({
        id, kind: 'delivery', title: 'Parcel run', client: b.name, step: 0,
        desc: `Pick up a parcel at ${a.name} and deliver it to ${b.name}.`,
        reward: Math.round(6 + d / 22),
        steps: [{ action: 'pickup', placeId: a.id, item: 'parcel' }, { action: 'deliver', placeId: b.id, item: 'parcel' }],
      });
    } else if (roll < 0.8) {
      const item = ERRAND_ITEMS[Math.floor(rnd() * ERRAND_ITEMS.length)]!;
      const sellers = shops.filter((p) => p.profile.stock.includes(item));
      if (!sellers.length) continue;
      const seller = sellers.reduce((best, p) => (dist(p, b) < dist(best, b) ? p : best), sellers[0]!);
      const it = ITEMS[item]!;
      jobs.push({
        id, kind: 'errand', title: `${it.name} for ${b.name}`, client: b.name, step: 0,
        desc: `Someone at ${b.name} is craving a ${it.name.toLowerCase()}. ${seller.name} sells them.`,
        reward: it.price + Math.round(5 + d / 30),
        steps: [{ action: 'acquire', placeId: seller.id, item }, { action: 'bring', placeId: b.id, item }],
      });
    } else {
      jobs.push({
        id, kind: 'rush', title: 'Rush delivery', client: b.name, step: 0,
        desc: `Urgent! Take a parcel from ${a.name} to ${b.name}. Bonus if delivered within 45 minutes.`,
        reward: Math.round(8 + d / 20), bonus: 10,
        steps: [{ action: 'pickup', placeId: a.id, item: 'parcel' }, { action: 'deliver', placeId: b.id, item: 'parcel' }],
      });
    }
  }
  return jobs;
}

export function acceptJob(job: Job, nowMinutes: number): Job {
  const j: Job = { ...job, step: 0, steps: job.steps.map((s) => ({ ...s })) };
  if (j.kind === 'rush') j.deadline = nowMinutes + 45;
  return j;
}

export function currentStep(job: Job | null): JobStep | null {
  return job && job.step < job.steps.length ? job.steps[job.step]! : null;
}

/** Auto-advance 'acquire' steps once the item is in the inventory. */
export function updateJob(job: Job | null, s: PlayerState): void {
  const st = currentStep(job);
  if (st?.action === 'acquire' && (s.inventory[st.item!] ?? 0) > 0) job!.step++;
}

/**
 * Interact with a place while on a job. Returns a result (or null when this place has
 * nothing to do with the current step). `done` is true when the job completed.
 */
export function interactJob(job: Job | null, place: Place, s: PlayerState, nowMinutes: number): (Result & { done: boolean }) | null {
  const st = currentStep(job);
  if (!job || !st || st.placeId !== place.id) return null;
  if (st.action === 'pickup') {
    addItem(s, st.item ?? 'parcel');
    job.step++;
    return { ok: true, done: false, msg: `Picked up a parcel. Deliver it to ${job.client}.` };
  }
  if (st.action === 'deliver' || st.action === 'bring') {
    const item = st.item ?? 'parcel';
    if (!removeItem(s, item)) {
      const name = ITEMS[item]?.name ?? item;
      return { ok: false, done: false, msg: `You need a ${name.toLowerCase()} to hand over.` };
    }
    const onTime = job.deadline === undefined || nowMinutes <= job.deadline;
    const total = job.reward + (onTime && job.bonus ? job.bonus : 0);
    pay(s, total);
    s.jobsDone++;
    s.mood = Math.min(100, s.mood + 6);
    job.step = job.steps.length;
    return { ok: true, done: true, msg: `Thank you! You earned $${total}${onTime && job.bonus ? ' (on-time bonus!)' : ''}.` };
  }
  return null;
}
