/**
 * Art-directed materials for the voxel town (TSL node materials; compile to WGSL or GLSL).
 * Block look: vertex colour (palette × baked AO) × subtle per-block tint × soft bevelled
 * block edges computed from world position — so greedy-merged quads still read as blocks.
 */
import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraPosition, dot, float, floor, fract, hash, max, min, mix, normalize, normalWorld,
  positionWorld, pow, sin, smoothstep, time, uniform,
} from 'three/tsl';

export const skyUniforms = {
  zenith: uniform(new THREE.Color(0x6fa6d8)),
  horizon: uniform(new THREE.Color(0xd8e6ee)),
  sunDir: uniform(new THREE.Vector3(0.4, 0.6, -0.5).normalize()),
  sunColor: uniform(new THREE.Color(0xfff1d6)),
};

function blockCell() {
  // Cell containing the surface point (step slightly inside along the normal).
  return floor(positionWorld.sub(normalWorld.mul(0.01)));
}

function blockTint(amount: number) {
  const c = blockCell();
  const seed = c.x.mul(73.13).add(c.y.mul(157.31)).add(c.z.mul(311.71)).add(100000.0);
  return hash(seed).sub(0.5).mul(amount).add(1.0);
}

/** 1 at block centres, darker toward edges (bevel/grout). Ignores the normal axis. */
function blockEdge(width: number, depth: number) {
  const f = fract(positionWorld);
  const d3 = min(f, f.oneMinus()).add(abs(normalWorld));
  const e = min(d3.x, min(d3.y, d3.z));
  return mix(float(1.0 - depth), float(1.0), smoothstep(0.0, width, e));
}

export function createVoxelMaterials(): Record<'opaque' | 'glass' | 'water' | 'emissive', THREE.Material> {
  const vcol = attribute('color', 'vec3');

  const opaque = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  opaque.colorNode = vcol.mul(blockTint(0.07)).mul(blockEdge(0.06, 0.1));

  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const fres = pow(float(1.0).sub(max(dot(normalWorld, viewDir), 0.0)), 3.0);

  const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.1 });
  // Fake sky reflection: tint toward the horizon colour at grazing angles; frames via edge term.
  glass.colorNode = mix(vcol.mul(0.55), skyUniforms.horizon, fres.mul(0.75).add(0.15)).mul(blockEdge(0.1, 0.45));
  glass.emissiveNode = vcol.mul(0.06);

  const water = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.82 });
  const ripple = sin(positionWorld.x.mul(1.7).add(time.mul(1.3))).mul(sin(positionWorld.z.mul(1.3).sub(time.mul(1.1)))).mul(0.06);
  water.colorNode = mix(vcol, skyUniforms.horizon, fres.mul(0.8)).add(ripple);
  water.depthWrite = false;

  const emissive = new THREE.MeshBasicNodeMaterial();
  emissive.colorNode = vcol.mul(2.2);

  return { opaque, glass, water, emissive };
}

/** Gradient sky dome with a soft sun glow; follows the camera. */
export function createSky(): THREE.Mesh {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  const dir = normalize(positionWorld.sub(cameraPosition));
  const up = max(dir.y, 0.0);
  const base = mix(skyUniforms.horizon, skyUniforms.zenith, pow(up, 0.55));
  const sunDot = max(dot(dir, skyUniforms.sunDir), 0.0);
  const glow = pow(sunDot, 12.0).mul(0.35).add(pow(sunDot, 900.0).mul(4.0));
  const below = smoothstep(0.0, -0.25, dir.y);
  mat.colorNode = mix(base.add(skyUniforms.sunColor.mul(glow)), skyUniforms.horizon.mul(0.92), below);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/** Drifting blocky clouds (one instanced mesh). */
export function createClouds(seed = 7): THREE.InstancedMesh {
  const boxes: [number, number, number, number, number][] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let c = 0; c < 36; c++) {
    const cx = (rnd() - 0.5) * 2600, cz = (rnd() - 0.5) * 2600;
    const parts = 3 + Math.floor(rnd() * 5);
    for (let k = 0; k < parts; k++) {
      boxes.push([cx + (rnd() - 0.5) * 50, 150 + rnd() * 8, cz + (rnd() - 0.5) * 40, 16 + rnd() * 30, 12 + rnd() * 24]);
    }
  }
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 1, color: 0xffffff, emissive: 0xd8e2ea, emissiveIntensity: 0.55 });
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, boxes.length);
  const m = new THREE.Matrix4();
  boxes.forEach(([x, y, z, w, d], i) => {
    m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, 6, d));
    mesh.setMatrixAt(i, m);
  });
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  return mesh;
}

