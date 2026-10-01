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
      if (game.pendingSpawn) game.pendingSpawn.yaw = game.player.yaw;
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
    // ---- gameplay automation
    session() {
      const ss = game.session;
      return { mode: ss.mode, time: ss.clock.format(), hour: ss.clock.hour, state: JSON.parse(JSON.stringify(ss.state)), job: ss.job, board: ss.board.map((j) => ({ id: j.id, kind: j.kind, title: j.title, reward: j.reward, steps: j.steps })) };
    },
    newGame() {
      game.session.newGame();
    },
    setHour(h: number) {
      const c = game.session.clock;
      c.minutes = c.day * 1440 + h * 60;
    },
    place(id: string) {
      const p = game.places.get(id);
      return p ? { id: p.id, name: p.name, stand: p.stand, profile: p.profile.key } : null;
    },
    /** Accept a board job by index. */
    acceptJob(i = 0) {
      const j = game.session.board[i];
      if (!j) return false;
      (document.querySelector(`[data-ui="accept-${j.id}"]`) as HTMLButtonElement | null)?.click();
      if (!game.session.job) {
        game.session.openPhone('jobs');
        (document.querySelector(`[data-ui="accept-${j.id}"]`) as HTMLButtonElement | null)?.click();
      }
      return !!game.session.job;
    },
    /** Open a place's card as if the player pressed E at its door. */
    openPlace(id: string) {
      const p = game.places.get(id);
      if (p) game.session.openPlace(p);
      return !!p;
    },
    click(uiId: string) {
      const b = document.querySelector(`[data-ui="${uiId}"]`) as HTMLButtonElement | null;
      if (!b || b.disabled) return false;
      b.click();
      return true;
    },
    resetPerf() {
      game.perf.reset();
    },
  };
  (window as unknown as { __franklin: typeof api }).__franklin = api;
}
