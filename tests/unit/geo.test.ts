import { describe, expect, it } from 'vitest';
import { LocalProjection } from '../../src/core/geo';
import { loadManifest } from './helpers';

describe('LocalProjection (runtime) vs PROJ (pipeline)', () => {
  const m = loadManifest();
  const proj = new LocalProjection(m.origin);

  it('matches every pipeline control point to < 1 cm', () => {
    expect(m.controlPoints.length).toBeGreaterThanOrEqual(3);
    for (const cp of m.controlPoints) {
      const g = proj.toGame(cp.lon, cp.lat);
      expect(Math.abs(g.x - cp.x)).toBeLessThan(0.01);
      expect(Math.abs(g.z - cp.z)).toBeLessThan(0.01);
    }
  });

  it('inverts to < 1e-8 degrees across the world bounds', () => {
    const b = m.bounds;
    for (const [x, z] of [
      [b.minX, b.minZ],
      [b.maxX, b.maxZ],
      [0, 0],
      [b.minX, b.maxZ],
      [123.4, -567.8],
    ] as const) {
      const geo = proj.toGeo(x, z);
      const back = proj.toGame(geo.lon, geo.lat);
      expect(Math.abs(back.x - x)).toBeLessThan(1e-4);
      expect(Math.abs(back.z - z)).toBeLessThan(1e-4);
    }
  });

  it('uses x=east and z=south', () => {
    const east = proj.toGame(m.origin.lon + 0.001, m.origin.lat);
    const north = proj.toGame(m.origin.lon, m.origin.lat + 0.001);
    expect(east.x).toBeGreaterThan(80);
    expect(Math.abs(east.z)).toBeLessThan(0.5);
    expect(north.z).toBeLessThan(-100);
  });
});
