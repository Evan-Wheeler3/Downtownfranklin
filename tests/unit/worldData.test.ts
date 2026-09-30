import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeTerrain, sampleTerrain } from '../../src/world/terrain';
import { WORLD_SCHEMA_VERSION } from '../../src/world/types';
import { chunkAt, loadChunk, loadJson, loadManifest, signedAreaEN, WORLD_DIR } from './helpers';

/** Data contract between the pipeline output and the runtime. */
describe('world data contract', () => {
  const m = loadManifest();

  it('manifest is current schema with attribution and spawn', () => {
    expect(m.schemaVersion).toBe(WORLD_SCHEMA_VERSION);
    expect(m.attribution.join(' ')).toMatch(/OpenStreetMap/);
    expect(m.attribution.join(' ')).toMatch(/USGS/);
    expect(m.spawn).toBeDefined();
    const [x, , z] = m.spawn!.pos;
    expect(x).toBeGreaterThan(m.bounds.minX);
    expect(x).toBeLessThan(m.bounds.maxX);
    expect(z).toBeGreaterThan(m.bounds.minZ);
    expect(z).toBeLessThan(m.bounds.maxZ);
  });

  it('every indexed chunk file exists', () => {
    expect(m.chunks.length).toBeGreaterThan(100);
    for (const c of m.chunks) expect(existsSync(resolve(WORLD_DIR, c.file))).toBe(true);
  });

  it('chunks near the core have buildings with CCW (east,north) footprints and sane heights', () => {
    let checked = 0;
    for (const e of m.chunks.filter((c) => Math.abs(c.cx) <= 3 && Math.abs(c.cz) <= 3)) {
      const c = loadChunk(e.file);
      expect(c.schemaVersion).toBe(WORLD_SCHEMA_VERSION);
      for (const b of c.buildings) {
        expect(b.footprint.length).toBeGreaterThanOrEqual(3);
        expect(signedAreaEN(b.footprint)).toBeGreaterThan(0);
        expect(b.height).toBeGreaterThan(2);
        expect(b.height).toBeLessThanOrEqual(80);
        expect(b.base).toBeLessThanOrEqual(b.ground + 1e-6);
        // footprint centroid lies inside this chunk (assignment rule)
        const cx = b.footprint.reduce((s, p) => s + p[0], 0) / b.footprint.length;
        expect(Math.floor(cx / m.chunkSize)).toBeGreaterThanOrEqual(c.cx - 1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it('terrain decodes and agrees with building ground samples', () => {
    const c = chunkAt(m, m.spawn!.pos[0], m.spawn!.pos[2]);
    const t = decodeTerrain(c.terrain);
    expect(t.heights.length).toBe(t.n * t.n);
    for (const b of c.buildings.slice(0, 20)) {
      const [x, z] = b.footprint[0]!;
      const h = sampleTerrain(t, x, z);
      if (Number.isFinite(h)) expect(Math.abs(h - b.ground)).toBeLessThan(4);
    }
    // Downtown Franklin sits roughly 185-225 m above sea level (USGS DEM range).
    const elev = t.heights[0]! + m.origin.elevationDatum;
    expect(elev).toBeGreaterThan(180);
    expect(elev).toBeLessThan(230);
  });

  it('hero locations are present and tagged', () => {
    let heroes = 0;
    for (const e of m.chunks.filter((c) => Math.abs(c.cx) <= 5 && Math.abs(c.cz) <= 5)) {
      heroes += loadChunk(e.file).buildings.filter((b) => b.tier === 'HERO' && b.hero).length;
    }
    expect(heroes).toBeGreaterThanOrEqual(6);
  });

  it('road graph edges reference existing nodes and carry lengths', () => {
    const g = loadJson<{ nodes: Record<string, number[]>; edges: { from: string; to: string; len: number; pts: number[][] }[] }>(
      'roads/graph.json',
    );
    expect(g.edges.length).toBeGreaterThan(1000);
    for (const e of g.edges) {
      expect(g.nodes[e.from]).toBeDefined();
      expect(g.nodes[e.to]).toBeDefined();
      expect(e.len).toBeGreaterThan(0);
      expect(e.pts.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('business records carry provenance and never invent hours', () => {
    const { businesses } = loadJson<{ businesses: Record<string, unknown>[] }>('businesses.json');
    expect(businesses.length).toBeGreaterThan(500);
    for (const b of businesses) {
      expect(b.source).toBeTruthy();
      expect(b.confidence).toMatch(/^(LOW|MEDIUM|HIGH)$/);
      expect(b.hours ?? null).toBeNull();
    }
    const theatre = businesses.find((b) => b.hero === 'franklin_theatre');
    expect(theatre?.address).toBe('419 Main St');
    expect(theatre?.addressCheck).toBe('CONSISTENT');
  });
});
