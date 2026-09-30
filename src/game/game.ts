import { LocalProjection } from '../core/geo';
import { initRapier, PhysicsWorld } from '../physics/physics';
import { PLAYER, PlayerController } from '../player/controller';
import { InputState } from '../player/input';
import { createRenderContext, placeSun, type RenderContext } from '../render/renderer';
import { Hud } from '../ui/hud';
import { World } from '../world/world';
import { FrameStats } from './perf';

export interface GameOptions {
  container: HTMLElement;
  worldUrl: string;
  forceWebGL?: boolean;
  /** No shadows, 1x pixel ratio: for software-rendered (headless) runs. */
  lowQuality?: boolean;
}

/** Top-level orchestrator: owns renderer, physics, world streaming, player and HUD. */
export class Game {
  ctx!: RenderContext;
  physics!: PhysicsWorld;
  world!: World;
  player!: PlayerController;
  input!: InputState;
  hud!: Hud;
  proj!: LocalProjection;
  readonly perf = new FrameStats();
  private spawned = false;
  private pendingSpawn: { x: number; z: number; yaw: number } | null = null;
  private last = 0;
  private labelTimer = 0;
  private running = false;
  ready = false;

  constructor(private readonly opts: GameOptions) {}

  async start(): Promise<void> {
    this.ctx = await createRenderContext(this.opts.container, {
      forceWebGL: this.opts.forceWebGL,
      lowQuality: this.opts.lowQuality,
    });
    const R = await initRapier();
    this.physics = new PhysicsWorld(R);
    this.world = await World.load(this.opts.worldUrl, this.physics);
    this.proj = new LocalProjection(this.world.manifest.origin);
    this.ctx.scene.add(this.world.root);
    this.player = new PlayerController(this.physics);
    this.input = new InputState(this.ctx.renderer.domElement);
    this.hud = new Hud(this.opts.container, this.world.manifest.attribution);
    this.hud.hideHelp = new URLSearchParams(location.search).has('nohelp');

    const sp = this.world.manifest.spawn;
    this.requestSpawn(sp ? sp.pos[0] : 0, sp ? sp.pos[2] : 0, sp ? (sp.yawDeg * Math.PI) / 180 : 0);

    this.running = true;
    this.last = performance.now();
    this.ctx.renderer.setAnimationLoop(() => this.frame());
  }

  /** Move the player; actual placement waits until collision at the target is resident. */
  requestSpawn(x: number, z: number, yaw = this.player?.yaw ?? 0): void {
    this.pendingSpawn = { x, z, yaw };
    this.spawned = false;
    this.world.focus.x = x;
    this.world.focus.z = z;
  }

  private trySpawn(): void {
    const s = this.pendingSpawn;
    if (!s || !this.world.isPhysicsReadyAt(s.x, s.z)) return;
    const ground = this.physics.groundAt(s.x, s.z);
    const h = ground ?? this.world.heightAt(s.x, s.z);
    if (!Number.isFinite(h)) return;
    this.player.teleport(s.x, h + 0.05, s.z);
    this.player.yaw = s.yaw;
    this.player.pitch = 0;
    this.pendingSpawn = null;
    this.spawned = true;
    this.ready = true;
  }

  private frame(): void {
    if (!this.running) return;
    const now = performance.now();
    const rawMs = now - this.last;
    const dt = Math.min(0.05, rawMs / 1000);
    this.last = now;
    const cpu0 = performance.now();

    // Look
    const look = this.input.takeLook();
    this.player.yaw -= look.dx * 0.0022;
    this.player.pitch = Math.max(-1.5, Math.min(1.5, this.player.pitch - look.dy * 0.0022));
    if (this.input.consumePress('KeyH')) this.hud.showDebug = !this.hud.showDebug;
    this.hud.setLocked(this.input.locked || !!this.input.scripted);

    // Stream around the player (or the pending spawn point)
    if (this.spawned) {
      this.world.focus.x = this.player.pos.x;
      this.world.focus.z = this.player.pos.z;
    }
    this.world.update();
    if (!this.spawned) this.trySpawn();

    if (this.spawned) {
      const collisionReady = this.world.isPhysicsReadyAt(this.player.pos.x, this.player.pos.z);
      this.player.update(dt, this.input.intent(), collisionReady);
      this.physics.step(dt);
    }

    // Camera
    const cam = this.ctx.camera;
    cam.position.set(this.player.pos.x, this.player.pos.y + PLAYER.eye, this.player.pos.z);
    cam.rotation.set(this.player.pitch, this.player.yaw, 0);
    placeSun(this.ctx, cam.position, 215, 48);

    const cpuMs = performance.now() - cpu0;
    this.ctx.renderer.render(this.ctx.scene, cam);
    this.perf.push(rawMs, cpuMs);

    this.labelTimer -= dt;
    if (this.labelTimer <= 0) {
      this.labelTimer = 0.25;
      this.updateHud();
    }
  }

  /** Nearest named street (and place) to the player from resident chunk data. */
  locate(): { street?: string; streetDist?: number; place?: string; placeDist?: number } {
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    let best = { d: 25, name: undefined as string | undefined };
    let bestPlace = { d: 20, name: undefined as string | undefined };
    for (const c of this.world.residentChunks()) {
      const s = this.world.manifest.chunkSize;
      if (Math.abs((c.data.cx + 0.5) * s - px) > s * 1.5 || Math.abs((c.data.cz + 0.5) * s - pz) > s * 1.5) continue;
      for (const r of c.data.roads) {
        if (!r.name || r.kind !== 'road') continue;
        for (let i = 1; i < r.pts.length; i++) {
          const a = r.pts[i - 1]!;
          const b = r.pts[i]!;
          const d = segDist(px, pz, a[0], a[2], b[0], b[2]);
          if (d < best.d) best = { d, name: r.name };
        }
      }
      for (const p of c.data.places) {
        const d = Math.hypot(p.pos[0] - px, p.pos[2] - pz);
        if (d < bestPlace.d) bestPlace = { d, name: p.name };
      }
    }
    return { street: best.name, streetDist: best.name ? best.d : undefined, place: bestPlace.name, placeDist: bestPlace.name ? bestPlace.d : undefined };
  }

  /** Is the player inside any building footprint, and how far is the nearest facade? */
  facadeProbe(): { inside: boolean; facadeDist: number } {
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    let inside = false;
    let best = Infinity;
    const s = this.world.manifest.chunkSize;
    for (const c of this.world.residentChunks()) {
      if (Math.abs((c.data.cx + 0.5) * s - px) > s * 1.5 || Math.abs((c.data.cz + 0.5) * s - pz) > s * 1.5) continue;
      for (const b of c.data.buildings) {
        const r = b.footprint;
        let wn = false;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const [xi, zi] = r[i]!;
          const [xj, zj] = r[j]!;
          if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) wn = !wn;
          best = Math.min(best, segDist(px, pz, xi, zi, xj, zj));
        }
        if (wn) inside = true;
      }
    }
    return { inside, facadeDist: best };
  }

  private updateHud(): void {
    const p = this.player.pos;
    const geo = this.proj.toGeo(p.x, p.z);
    const info = this.ctx.renderer.info;
    const loc = this.locate();
    const ws = this.world.stats;
    const ps = this.perf.summary();
    const heading = ((((-this.player.yaw * 180) / Math.PI) % 360) + 360) % 360;
    this.hud.setDebug(
      [
        `backend ${this.ctx.backend}  fps ${ps.fps.toFixed(0)}  frame p50 ${ps.p50.toFixed(1)} p95 ${ps.p95.toFixed(1)} ms  cpu ${ps.cpuAvg.toFixed(1)} ms`,
        `draws ${info.render.drawCalls}  tris ${(info.render.triangles / 1000).toFixed(0)}k`,
        `chunks ${ws.resident} (+${ws.loading} pending, ${ws.physicsChunks} phys)  bldgs ${ws.buildingsResident}  build max ${ws.maxChunkBuildMs.toFixed(1)} ms`,
        `pos ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  hdg ${heading.toFixed(0)}°  ${this.player.grounded ? 'grounded' : 'air'}${this.input.fly ? ' FLY' : ''}`,
        `lat ${geo.lat.toFixed(6)} lon ${geo.lon.toFixed(6)}  elev ${(p.y + this.world.manifest.origin.elevationDatum).toFixed(1)} m`,
        `street ${loc.street ?? '—'}`,
      ].join('\n'),
    );
    this.hud.setLabel([loc.place, loc.street].filter(Boolean).join(' — '));
  }
}

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}


