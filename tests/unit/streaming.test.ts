import { describe, expect, it } from 'vitest';
import { StreamingPolicy } from '../../src/world/streaming';
import type { ChunkIndexEntry } from '../../src/world/types';

function grid(n: number): ChunkIndexEntry[] {
  const out: ChunkIndexEntry[] = [];
  for (let cx = -n; cx < n; cx++)
    for (let cz = -n; cz < n; cz++)
      out.push({ id: `c_${cx}_${cz}`, cx, cz, file: '', minY: 0, maxY: 0, counts: { buildings: 0, roads: 0, areas: 0, places: 0, points: 0 } });
  return out;
}

describe('StreamingPolicy', () => {
  const radii = { render: 300, detail: 150, physics: 60, hysteresis: 20 };
  const p = new StreamingPolicy(grid(10), 100, radii);

  it('selects chunks within the render radius, nearest first', () => {
    const w = p.evaluate(50, 50, new Map());
    expect(w[0]!.id).toBe('c_0_0');
    expect(w[0]!.dist).toBe(0);
    for (let i = 1; i < w.length; i++) expect(w[i]!.dist).toBeGreaterThanOrEqual(w[i - 1]!.dist);
    expect(w.every((x) => x.dist <= 300)).toBe(true);
    const far = w.filter((x) => x.dist > 150);
    expect(far.every((x) => x.lod === 1 && !x.physics)).toBe(true);
    expect(w.filter((x) => x.physics).every((x) => x.dist <= 60)).toBe(true);
  });

  it('always gives the chunk under the viewer physics and LOD0', () => {
    const w = p.evaluate(-250, 330, new Map());
    const under = w.find((x) => x.id === 'c_-3_3')!;
    expect(under.physics).toBe(true);
    expect(under.lod).toBe(0);
  });

  it('applies hysteresis to resident chunks', () => {
    // chunk c_2_0 spans x in [200,300]; viewer at x=-110 -> distance 310 (> render 300, < 320)
    const none = p.evaluate(-110, 50, new Map());
    expect(none.find((x) => x.id === 'c_2_0')).toBeUndefined();
    const resident = new Map([['c_2_0', { lod: 1 as const, physics: false }]]);
    const kept = p.evaluate(-110, 50, resident);
    expect(kept.find((x) => x.id === 'c_2_0')).toBeDefined();
  });
});
