import type { Game } from './game';

/**
 * `window.__franklin`: a stable automation surface for Playwright runtime checks,
 * perf measurement and visual inspection. Not a gameplay API.
 */
export function installDebugApi(game: Game): void {
  const api = {
    get ready() {
      return game.ready;
    },
    get settled() {
      return game.ready && game.world.settled;
    },
    state() {
      const p = game.player.pos;
      return {
        backend: game.ctx.backend,
        pos: { ...p },
        yaw: game.player.yaw,
        pitch: game.player.pitch,
        grounded: game.player.grounded,
        geo: game.proj.toGeo(p.x, p.z),
        world: { ...game.world.stats },
        colliders: game.physics.colliderCount,
        perf: game.perf.summary(),
        render: { drawCalls: game.ctx.renderer.info.render.drawCalls, triangles: game.ctx.renderer.info.render.triangles },
        locate: game.locate(),
        probe: game.facadeProbe(),
      };
    },
    teleport(x: number, z: number, yawDeg?: number) {
      game.requestSpawn(x, z, yawDeg === undefined ? game.player.yaw : (yawDeg * Math.PI) / 180);
    },
    teleportGeo(lon: number, lat: number, yawDeg?: number) {
      const g = game.proj.toGame(lon, lat);
      api.teleport(g.x, g.z, yawDeg);
    },
    look(yawDeg: number, pitchDeg = 0) {
      game.player.yaw = (yawDeg * Math.PI) / 180;
      game.player.pitch = (pitchDeg * Math.PI) / 180;
    },
    /** Scripted movement intent, e.g. {forward: 1}; null to release. */
    move(intent: Record<string, number | boolean> | null) {
      game.input.scripted = intent;
    },
    setFly(on: boolean) {
      game.input.fly = on;
    },
    /** Set the camera free-fly altitude (only in fly mode). */
    setY(y: number) {
      game.player.pos.y = y;
    },
    resetPerf() {
      game.perf.reset();
    },
  };
  (window as unknown as { __franklin: typeof api }).__franklin = api;
}
