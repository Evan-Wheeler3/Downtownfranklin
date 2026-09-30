import * as THREE from 'three/webgpu';

export interface RenderContext {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  backend: 'webgpu' | 'webgl2';
}

/**
 * WebGPU-first renderer with automatic WebGL2 fallback (three.js WebGPURenderer).
 * `?renderer=webgl` forces the WebGL2 backend (used by headless tests).
 */
export async function createRenderContext(
  container: HTMLElement,
  opts: { forceWebGL?: boolean; lowQuality?: boolean } = {},
): Promise<RenderContext> {
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: opts.forceWebGL ?? false });
  renderer.setPixelRatio(opts.lowQuality ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = !opts.lowQuality;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  await renderer.init();
  container.appendChild(renderer.domElement);

  const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';

  const scene = new THREE.Scene();
  const skyColor = new THREE.Color(0xa9c4dc);
  scene.background = skyColor;
  scene.fog = new THREE.Fog(skyColor, 250, 1100);

  const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 2500);
  camera.rotation.order = 'YXZ';

  const hemi = new THREE.HemisphereLight(0xdfeaf5, 0x7a6a55, 1.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 90;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  return { renderer, scene, camera, sun, hemi, backend };
}

/** Keep the shadow frustum centred on the viewer; direction from a sun azimuth/elevation. */
export function placeSun(ctx: RenderContext, focus: THREE.Vector3, azimuthDeg: number, elevationDeg: number): void {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  // azimuth measured clockwise from north; game z = south
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  // Snap to texel grid to reduce shadow shimmering while moving.
  const snap = 1;
  const fx = Math.round(focus.x / snap) * snap;
  const fz = Math.round(focus.z / snap) * snap;
  ctx.sun.target.position.set(fx, focus.y, fz);
  ctx.sun.position.set(fx + dir.x * 300, focus.y + dir.y * 300, fz + dir.z * 300);
}
