import type { Job } from './jobs';
import { newPlayerState, type PlayerState } from './state';

/**
 * Versioned save data. Bump SAVE_VERSION and add a migration whenever the shape changes;
 * old saves are upgraded step by step (never discarded silently).
 */
export const SAVE_VERSION = 1;
export const SAVE_KEY = 'franklin.save';

export interface SaveData {
  version: number;
  savedAt: string;
  clockMinutes: number;
  player: PlayerState;
  pos: [number, number, number];
  yaw: number;
  job: Job | null;
  /** Job ids from today's board already accepted/finished (so they don't reappear). */
  takenJobs: string[];
}

type AnySave = Record<string, unknown> & { version?: number };

/** Ordered migrations: index i upgrades version i -> i+1. Version 0 = pre-versioned prototype. */
const MIGRATIONS: ((s: AnySave) => AnySave)[] = [
  (s) => ({ ...s, version: 1, takenJobs: (s.takenJobs as string[]) ?? [], job: s.job ?? null }),
];

export function migrate(raw: AnySave): SaveData {
  let s: AnySave = { ...raw };
  let v = typeof s.version === 'number' ? s.version : 0;
  if (v > SAVE_VERSION) throw new Error(`save version ${v} is newer than this game (${SAVE_VERSION})`);
  while (v < SAVE_VERSION) {
    s = MIGRATIONS[v]!(s);
    v = s.version as number;
  }
  const player = { ...newPlayerState(), ...(s.player as Partial<PlayerState>) };
  return { ...(s as unknown as SaveData), player };
}

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function writeSave(store: Storage, data: Omit<SaveData, 'version' | 'savedAt'>): void {
  const full: SaveData = { ...data, version: SAVE_VERSION, savedAt: new Date().toISOString() };
  store.setItem(SAVE_KEY, JSON.stringify(full));
}

export function readSave(store: Storage): SaveData | null {
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw) as AnySave);
  } catch (e) {
    console.warn('save unreadable', e);
    return null;
  }
}

export function safeStorage(): Storage {
  try {
    const k = '__probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
}
