/**
 * Art-directed materials for the voxel town (TSL node materials; compile to WGSL or GLSL).
 *
 * Target look: warm, saturated, hand-painted ("Ghibli-like") blocks. Every block face gets
 *  - its palette colour × baked vertex AO (from the mesher),
 *  - a procedural surface pattern chosen by texture class (brick coursing, lap siding,
 *    shingles, pavers, grass speckle with dirt sides, asphalt grain, leaf clumps, bark),
 *  - a soft low-frequency "painterly" mottle and per-block hue jitter,
 *  - gentle bevels at block edges so greedy-merged quads still read as blocks.
 * Patterns fade with distance to avoid shimmer.
 */
import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraPosition, clamp, dot, exp, float, floor, fract, hash, max, min, mix,
  mx_noise_float, normalize, normalWorld, positionLocal, positionWorld, pow, sin, smoothstep, step, time, uniform,
  vec2, vec3,
} from 'three/tsl';
import { TEX } from '../voxel/blocks';

export const skyUniforms = {
  zenith: uniform(new THREE.Color(0x3d8de0)),
  horizon: uniform(new THREE.Color(0xf4e6cd)),
  haze: uniform(new THREE.Color(0xb9d2e6)),
  sunDir: uniform(new THREE.Vector3(0.4, 0.6, -0.5).normalize()),
  sunColor: uniform(new THREE.Color(0xffd9a0)),
  fogDensity: uniform(0.0042),
};

// TSL's generated typings are stricter than its runtime; nodes are passed loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

const h3 = (v: N) => hash(v.x.mul(73.13).add(v.y.mul(157.31)).add(v.z.mul(311.71)).add(100000.0));
const h2 = (v: N) => hash(v.x.mul(91.7).add(v.y.mul(271.3)).add(50000.0));

/** Face-projected planar coordinates in metres (u along the face, v up for walls). */
function faceUV() {
  const an = abs(normalWorld);
  const p = positionWorld;
  // walls: (horizontal, y); tops: (x, z)
  return vec2(p.z, p.y).mul(an.x).add(vec2(p.x, p.z).mul(an.y)).add(vec2(p.x, p.y).mul(an.z));
}

function blockCell() {
  return floor(positionWorld.sub(normalWorld.mul(0.01)));
}

/** 1 at block centres, darker toward edges (bevel). Ignores the normal axis. */
function blockEdge(width: number, depth: number): N {
  const f = fract(positionWorld);
  const d3 = min(f, f.oneMinus()).add(abs(normalWorld));
  const e = min(d3.x, min(d3.y, d3.z));
  return mix(float(1.0 - depth), float(1.0), smoothstep(0.0, width, e));
}

function patterns(vcol: N): N {
  const uv = faceUV();
  const up = smoothstep(0.5, 0.9, normalWorld.y); // 1 on top faces
  const side = float(1.0).sub(abs(normalWorld.y)).clamp(0, 1);

  // brick: 0.5 m × 0.25 m running bond, light mortar
  const row = floor(uv.y.mul(4.0));
  const bx = uv.x.mul(2.0).add(row.mod(2.0).mul(0.5));
  const fx = fract(bx), fy = fract(uv.y.mul(4.0));
  const dm = min(min(fx, fx.oneMinus()).mul(0.5), min(fy, fy.oneMinus()).mul(0.25));
  const brickTone = h2(vec2(floor(bx), row)).mul(0.22).add(0.88);
  const brick = mix(float(1.28), brickTone, smoothstep(0.012, 0.026, dm));

  // lap siding: 0.25 m boards, shadow line under each board
  const sy = fract(uv.y.mul(4.0));
  const siding = mix(float(0.72), float(1.0), smoothstep(0.0, 0.22, sy)).mul(h2(vec2(floor(uv.y.mul(4.0)), 3.0)).mul(0.08).add(0.96));

  // shingles: staggered tabs, darker lower edge of each course
  const srow = floor(uv.y.mul(4.0));
  const tab = floor(uv.x.mul(3.0).add(srow.mod(2.0).mul(0.5)));
  const sf = fract(uv.y.mul(4.0));
  const shingle = mix(float(0.7), float(1.04), smoothstep(0.0, 0.4, sf)).mul(h2(vec2(tab, srow)).mul(0.18).add(0.91));

  // pavers: 0.5 m tiles with soft grout
  const pt = uv.mul(2.0);
  const pf = fract(pt);
  const pd = min(min(pf.x, pf.x.oneMinus()), min(pf.y, pf.y.oneMinus()));
  const paver = mix(float(0.8), h2(floor(pt)).mul(0.12).add(0.94), smoothstep(0.02, 0.07, pd));

  // grain: fine speckle (asphalt, dirt, gravel)
  const grain = h3(floor(positionWorld.mul(12.0))).mul(0.16).add(0.92);

  // grass: speckled blades on top; sides show a green fringe over warm soil
  const speck = h3(floor(positionWorld.mul(8.0))).mul(0.24).add(0.88);
  const fringe = fract(positionWorld.y.sub(0.001)).sub(h3(floor(positionWorld.mul(vec3(6.0, 1.0, 6.0)))).mul(0.18)).greaterThan(0.72);
  const soil = vec3(0.36, 0.2, 0.1);

  // leaves: clumpy light/dark dapples
  const clump = h3(floor(positionWorld.mul(3.0))).mul(0.3).add(0.84).mul(h3(floor(positionWorld.mul(9.0))).mul(0.14).add(0.93));

  // bark: vertical streaks
  const bark = h2(vec2(floor(uv.x.mul(7.0)), 9.0)).mul(0.28).add(0.82);

  const tex = attribute('tex', 'float');
  const is = (k: number) => step(abs(tex.sub(k)), 0.5);
  const mult = float(1.0)
    .add(is(TEX.brick).mul(brick.sub(1.0)))
    .add(is(TEX.siding).mul(siding.sub(1.0)))
    .add(is(TEX.shingle).mul(shingle.sub(1.0)))
    .add(is(TEX.paver).mul(paver.sub(1.0)))
    .add(is(TEX.grain).mul(grain.sub(1.0)))
    .add(is(TEX.grass).mul(speck.sub(1.0)))
    .add(is(TEX.leaves).mul(clump.sub(1.0)))
    .add(is(TEX.bark).mul(bark.sub(1.0)));

  // distance fade of high-frequency detail
  const dist = positionWorld.sub(cameraPosition).length();
  const detail = smoothstep(140.0, 30.0, dist);
  const m = mix(float(1.0), mult, detail);

  // grass block sides: soil below the fringe
  const grassSide = is(TEX.grass).mul(side).mul(fringe.select(float(0.0), float(1.0))).mul(float(1.0).sub(up));
  const base = mix(vcol, soil.mul(vcol.length().mul(0.9).add(0.35)), grassSide);
  return base.mul(m);
}

/** Painterly low-frequency mottle + per-block jitter. */
function painterly(): N {
  const p = positionWorld;
  const n1 = mx_noise_float(p.mul(0.18)).mul(0.09);
  const n2 = mx_noise_float(p.mul(0.9).add(13.0)).mul(0.04);
  return float(1.0).add(n1).add(n2).mul(h3(blockCell()).sub(0.5).mul(0.06).add(1.0));
}

/** `low`: no procedural patterns / noise (cheap fragment shader for weak GPUs and software rendering). */
export function createVoxelMaterials(low = false): Record<'opaque' | 'foliage' | 'glass' | 'water' | 'emissive', THREE.Material> {
  const vcol: N = attribute('color', 'vec3');
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const fres = pow(float(1.0).sub(max(dot(normalWorld, viewDir), 0.0)), 3.0);

  const opaque = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  opaque.colorNode = low ? vcol.mul(blockEdge(0.05, 0.12)) : patterns(vcol).mul(painterly()).mul(blockEdge(0.05, 0.12));

  // Foliage: gentle wind sway and warm translucency when backlit by the sun.
  const foliage = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  const wp = positionLocal;
  const sway = sin(time.mul(1.4).add(wp.x.mul(0.35)).add(wp.z.mul(0.27))).mul(0.045)
    .add(sin(time.mul(2.3).add(wp.x.mul(1.1))).mul(0.015));
  foliage.positionNode = wp.add(vec3(sway, 0.0, sway.mul(0.6)));
  foliage.colorNode = low ? vcol.mul(blockEdge(0.06, 0.1)) : patterns(vcol).mul(painterly()).mul(blockEdge(0.06, 0.1));
  const backlit = pow(max(dot(viewDir.negate(), skyUniforms.sunDir), 0.0), 4.0);
  foliage.emissiveNode = vcol.mul(skyUniforms.sunColor).mul(backlit.mul(0.55).add(0.06));

  const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.15 });
  glass.colorNode = mix(vcol.mul(0.45), mix(skyUniforms.haze, skyUniforms.horizon, 0.5), fres.mul(0.7).add(0.2)).mul(blockEdge(0.1, 0.45));
  // warm interior glow, a little stronger on shop windows
  glass.emissiveNode = vec3(1.0, 0.78, 0.48).mul(h3(blockCell()).mul(0.08).add(0.03));

  const water = new THREE.MeshStandardNodeMaterial({ roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.85 });
  const ripple = sin(positionWorld.x.mul(1.7).add(time.mul(1.3))).mul(sin(positionWorld.z.mul(1.3).sub(time.mul(1.1)))).mul(0.07);
  const glint = pow(max(dot(viewDir.negate().reflect(normalWorld).negate(), skyUniforms.sunDir), 0.0), 60.0);
  water.colorNode = mix(vcol, skyUniforms.horizon, fres.mul(0.75)).add(ripple);
  water.emissiveNode = skyUniforms.sunColor.mul(glint.mul(1.5));
  water.depthWrite = false;

  const emissive = new THREE.MeshBasicNodeMaterial();
  emissive.colorNode = vcol.mul(3.0);

  return { opaque, foliage, glass, water, emissive };
}

/**
 * Aerial-perspective haze: denser near the ground, warm toward the sun, cool blue away from it.
 * Assign to `scene.fogNode`.
 */
export function createHazeFog() {
  const toFrag = positionWorld.sub(cameraPosition);
  const dist = toFrag.length();
  const dir = toFrag.div(max(dist, 0.001));
  const sunAmt = pow(max(dot(dir, skyUniforms.sunDir), 0.0), 5.0);
  const color = mix(skyUniforms.haze, mix(skyUniforms.horizon, skyUniforms.sunColor, 0.35), sunAmt.mul(0.85).add(0.15));
  // height falloff: haze pools in the lower air
  const heightK = exp(max(positionWorld.y, 0.0).mul(-0.012));
  const factor = float(1.0).sub(exp(dist.mul(skyUniforms.fogDensity).mul(heightK.mul(0.7).add(0.3)).negate()));
  return { color, factor: clamp(factor, 0.0, 0.8) };
}

/** Gradient sky dome with a soft sun glow; follows the camera. */
export function createSky(): THREE.Mesh {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const dir = normalize(positionWorld.sub(cameraPosition));
  const up = max(dir.y, 0.0);
  const base = mix(skyUniforms.horizon, skyUniforms.zenith, pow(up, 0.38));
  const sunDot = max(dot(dir, skyUniforms.sunDir), 0.0);
  const glow = pow(sunDot, 10.0).mul(0.25).add(pow(sunDot, 90.0).mul(0.4)).add(pow(sunDot, 1500.0).mul(5.0));
  const below = smoothstep(0.0, -0.2, dir.y);
  mat.colorNode = mix(base.add(skyUniforms.sunColor.mul(glow)), skyUniforms.horizon, below);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 24), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * Towering voxel cumulus: stacked boxes that narrow upward, lit warm from the sun side
 * and cool underneath. Placed in a ring so they frame the horizon.
 */
export function createClouds(seed = 11): THREE.InstancedMesh {
  const boxes: [number, number, number, number, number, number][] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let c = 0; c < 26; c++) {
    const a = rnd() * Math.PI * 2;
    const r = 900 + rnd() * 900;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const baseY = 140 + rnd() * 60;
    const tiers = 3 + Math.floor(rnd() * 4);
    let w = 90 + rnd() * 120;
    let y = baseY;
    for (let t = 0; t < tiers; t++) {
      const puffs = 3 + Math.floor(rnd() * 4);
      for (let k = 0; k < puffs; k++) {
        const pw = w * (0.45 + rnd() * 0.4);
        const ph = 18 + rnd() * 22;
        boxes.push([cx + (rnd() - 0.5) * w * 0.8, y + ph / 2, cz + (rnd() - 0.5) * w * 0.8, pw, ph, pw * (0.7 + rnd() * 0.5)]);
      }
      y += 16 + rnd() * 18;
      w *= 0.68;
    }
  }
  const mat = new THREE.MeshBasicNodeMaterial({ fog: false });
  const n = normalWorld;
  const lit = max(dot(n, skyUniforms.sunDir), 0.0);
  const underside = smoothstep(0.0, -1.0, n.y);
  const warm = mix(vec3(1.12, 1.12, 1.1), skyUniforms.sunColor.mul(1.2), lit.mul(0.35));
  const cool = vec3(0.74, 0.8, 0.93);
  // fade into the horizon haze with distance
  const dist = positionWorld.sub(cameraPosition).length();
  const c = mix(mix(warm, cool, underside.mul(0.8).add(float(1.0).sub(lit).mul(0.25))), skyUniforms.horizon, smoothstep(1100.0, 2400.0, dist).mul(0.45));
  mat.colorNode = c;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, boxes.length);
  const m = new THREE.Matrix4();
  boxes.forEach(([x, y, z, w, h, d], i) => {
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    mesh.setMatrixAt(i, m);
  });
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  return mesh;
}
