import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { createClouds, createSky, skyUniforms } from './voxelMaterials';

export interface RenderContext {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  clouds: THREE.InstancedMesh;
  pipeline: THREE.RenderPipeline | null;
  backend: 'webgpu' | 'webgl2';
}

/** Art direction for the town: warm late-afternoon light, soft blue sky, gentle haze. */
export const LOOK = {
  sunAzimuthDeg: 235,
  sunElevationDeg: 38,
  sunColor: 0xffe7c4,
  sunIntensity: 3.0,
  hemiSky: 0xd6e4f0,
  hemiGround: 0xa89070,
  hemiIntensity: 1.9,
  zenith: 0x5f9bd6,
  horizon: 0xe3ecef,
  fogNear: 140,
  fogFar: 560,
  exposure: 1.05,
};

/**
 * WebGPU-first renderer with automatic WebGL2 fallback (three.js WebGPURenderer).
 * `?renderer=webgl` forces the WebGL2 backend (used by headless tests).
 */
export async function createRenderContext(
  container: HTMLElement,
  opts: { forceWebGL?: boolean; lowQuality?: boolean; post?: boolean } = {},
): Promise<RenderContext> {
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: opts.forceWebGL ?? false });
  renderer.setPixelRatio(opts.lowQuality ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = !opts.lowQuality;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = LOOK.exposure;
  await renderer.init();
  container.appendChild(renderer.domElement);

  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';

  const scene = new THREE.Scene();
  skyUniforms.zenith.value.setHex(LOOK.zenith);
  skyUniforms.horizon.value.setHex(LOOK.horizon);
  skyUniforms.sunColor.value.setHex(LOOK.sunColor);
  scene.background = new THREE.Color(LOOK.horizon);
  scene.fog = new THREE.Fog(new THREE.Color(LOOK.horizon), LOOK.fogNear, LOOK.fogFar);

  const camera = new THREE.PerspectiveCamera(72, container.clientWidth / container.clientHeight, 0.1, 3000);
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
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.08;
  sun.shadow.radius = 3;
  sun.shadow.intensity = 0.72; // soft, airy shadows
  scene.add(sun);
  scene.add(sun.target);

  const sky = createSky();
  scene.add(sky);
  const clouds = createClouds();
  scene.add(clouds);

  let pipeline: THREE.RenderPipeline | null = null;
  if (!opts.lowQuality && opts.post !== false) {
    pipeline = new THREE.RenderPipeline(renderer);
    const scenePass = pass(scene, camera);
    const color = scenePass.getTextureNode('output');
    pipeline.outputNode = color.add(bloom(color, 0.35, 0.5, 0.82));
  }

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  return { renderer, scene, camera, sun, hemi, sky, clouds, pipeline, backend };
}

/** Keep the shadow frustum (and sky dome) centred on the viewer; sun from azimuth/elevation. */
export function placeSun(ctx: RenderContext, focus: THREE.Vector3, azimuthDeg = LOOK.sunAzimuthDeg, elevationDeg = LOOK.sunElevationDeg): void {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  skyUniforms.sunDir.value.copy(dir);
  // Snap to whole metres to reduce shadow shimmer while moving.
  const fx = Math.round(focus.x);
  const fz = Math.round(focus.z);
  ctx.sun.target.position.set(fx, focus.y, fz);
  ctx.sun.position.set(fx + dir.x * 350, focus.y + dir.y * 350, fz + dir.z * 350);
  ctx.sky.position.copy(focus);
}

export function renderFrame(ctx: RenderContext): void {
  if (ctx.pipeline) ctx.pipeline.render();
  else ctx.renderer.render(ctx.scene, ctx.camera);
}
