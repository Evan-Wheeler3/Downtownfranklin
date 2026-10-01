import * as THREE from 'three/webgpu';
import { float, fog, hash, length, mix, pass, saturation, screenUV, smoothstep, time, uniform, vec3 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import { createClouds, createHazeFog, createSky, skyUniforms } from './voxelMaterials';

export interface RenderContext {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  clouds: THREE.InstancedMesh;
  pipeline: THREE.RenderPipeline | null;
  /** Sun shafts are attached once the sun's shadow map exists (after the first frame). */
  raysPending: boolean;
  backend: 'webgpu' | 'webgl2';
}

/**
 * Art direction: a warm, saturated late afternoon — golden sunlight, cool lilac-blue shadows,
 * soft haze pooling in the streets, big cumulus on the horizon (painted-film look).
 */
export const LOOK = {
  sunAzimuthDeg: 210,
  sunElevationDeg: 33,
  sunColor: 0xffd29a,
  sunIntensity: 3.9,
  hemiSky: 0xa9c2ea, // cool sky fill => soft blue-violet shadows
  hemiGround: 0xdcb27a, // warm bounce from sunlit streets
  hemiIntensity: 1.35,
  zenith: 0x2470d6,
  horizon: 0xe2ecf0,
  haze: 0xd3dde6,
  fogDensity: 0.0017,
  exposure: 1.06,
  saturation: 1.32,
  bloom: { strength: 0.28, radius: 0.5, threshold: 1.05 },
  vignette: 0.32,
  grain: 0.018,
  rays: 0.16,
};

/**
 * WebGPU-first renderer with automatic WebGL2 fallback (three.js WebGPURenderer).
 * `?renderer=webgl` forces the WebGL2 backend (used by headless tests).
 */
export async function createRenderContext(
  container: HTMLElement,
  opts: { forceWebGL?: boolean; lowQuality?: boolean; post?: boolean; rays?: boolean } = {},
): Promise<RenderContext> {
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: opts.forceWebGL ?? false });
  renderer.setPixelRatio(opts.lowQuality ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = !opts.lowQuality;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = LOOK.exposure;
  await renderer.init();
  container.appendChild(renderer.domElement);

  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';

  const scene = new THREE.Scene();
  skyUniforms.zenith.value.setHex(LOOK.zenith);
  skyUniforms.horizon.value.setHex(LOOK.horizon);
  skyUniforms.haze.value.setHex(LOOK.haze);
  skyUniforms.sunColor.value.setHex(LOOK.sunColor);
  skyUniforms.fogDensity.value = LOOK.fogDensity;
  scene.background = new THREE.Color(LOOK.horizon);
  const haze = createHazeFog();
  scene.fogNode = fog(haze.color, haze.factor);

  const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 4000);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(LOOK.hemiSky, LOOK.hemiGround, LOOK.hemiIntensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(LOOK.sunColor, LOOK.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const s = 110;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.08;
  sun.shadow.radius = 3;
  sun.shadow.intensity = 0.8;
  scene.add(sun);
  scene.add(sun.target);

  const sky = createSky();
  scene.add(sky);
  const clouds = createClouds();
  scene.add(clouds);

  let pipeline: THREE.RenderPipeline | null = null;
  if (!opts.lowQuality && opts.post !== false) pipeline = new THREE.RenderPipeline(renderer);
  const ctx: RenderContext = {
    renderer, scene, camera, sun, hemi, sky, clouds, pipeline, backend,
    raysPending: !!pipeline && opts.rays !== false && renderer.shadowMap.enabled,
  };
  if (pipeline) buildPost(ctx, false);

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  return ctx;
}

/** Post chain: bloom (+ sun shafts) then grade — richer colour, warm highs/cool lows, vignette, grain. */
function buildPost(ctx: RenderContext, withRays: boolean): void {
  const pipeline = ctx.pipeline!;
  const scenePass = pass(ctx.scene, ctx.camera);
  const color = scenePass.getTextureNode('output');
  let c = color.add(bloom(color, LOOK.bloom.strength, LOOK.bloom.radius, LOOK.bloom.threshold));
  if (withRays) {
    // Volumetric sun shafts through the haze (raymarched against the sun's shadow map).
    const rays = godrays(scenePass.getTextureNode('depth'), ctx.camera, ctx.sun);
    c = c.add(vec3(rays.getTextureNode().r).mul(skyUniforms.sunColor).mul(uniform(LOOK.rays)));
  }
  const graded = saturation(c, LOOK.saturation);
  const lum = graded.dot(vec3(0.2126, 0.7152, 0.0722));
  const split = mix(vec3(0.97, 0.985, 1.03), vec3(1.04, 1.0, 0.94), smoothstep(0.05, 0.6, lum));
  const vig = mix(float(1.0), float(1.0 - LOOK.vignette), smoothstep(0.35, 0.95, length(screenUV.sub(0.5)).mul(1.35)));
  const grain = hash(screenUV.x.mul(1931.7).add(screenUV.y.mul(7121.3)).add(time.mul(97.0).fract().mul(1000.0))).sub(0.5).mul(LOOK.grain);
  pipeline.outputNode = graded.mul(split).mul(vig).add(grain);
  pipeline.needsUpdate = true;
}

/** Keep the shadow frustum (and sky dome) centred on the viewer; sun from azimuth/elevation. */
export function placeSun(ctx: RenderContext, focus: THREE.Vector3, azimuthDeg = LOOK.sunAzimuthDeg, elevationDeg = LOOK.sunElevationDeg): void {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  skyUniforms.sunDir.value.copy(dir);
  const fx = Math.round(focus.x);
  const fz = Math.round(focus.z);
  ctx.sun.target.position.set(fx, focus.y, fz);
  ctx.sun.position.set(fx + dir.x * 400, focus.y + dir.y * 400, fz + dir.z * 400);
  ctx.sky.position.copy(focus);
  ctx.clouds.position.set(focus.x, 0, focus.z);
}

export function renderFrame(ctx: RenderContext): void {
  if (ctx.raysPending && ctx.sun.shadow.map) {
    ctx.raysPending = false;
    try {
      buildPost(ctx, true);
    } catch (e) {
      console.warn('sun shafts unavailable', e);
      buildPost(ctx, false);
    }
  }
  if (ctx.pipeline) ctx.pipeline.render();
  else ctx.renderer.render(ctx.scene, ctx.camera);
}
