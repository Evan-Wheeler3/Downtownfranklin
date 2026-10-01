import * as THREE from 'three/webgpu';
import { color, float, mix, positionLocal, smoothstep, sin, time } from 'three/tsl';
import { ITEMS } from '../content/items';
import { isOpen } from '../content/shops';
import { fnv1a } from '../core/hash';
import { GameClock } from '../sim/clock';
import { button, h, row, type El, UI } from '../ui/ui';
import { acceptJob, currentStep, generateJobs, interactJob, updateJob, type Job } from './jobs';
import { PlaceDirectory, type Place } from './places';
import { readSave, safeStorage, SAVE_KEY, writeSave, type Storage } from './save';
import { buy, newPlayerState, tickNeeds, use, type PlayerState } from './state';

/** What the session needs from the engine (kept narrow so the session stays testable-ish). */
export interface EngineHooks {
  scene: THREE.Scene;
  playerPos(): { x: number; y: number; z: number };
  playerYaw(): number;
  spawnAt(x: number, z: number, yawRad: number): void;
  defaultSpawn(): { x: number; z: number; yaw: number };
  lockPointer(): void;
  unlockPointer(): void;
  pointerLocked(): boolean;
  applyAtmosphere(hour: number): void;
}

const fmtHour = (h: number) => {
  const hh = Math.floor(h % 24);
  return `${((hh + 11) % 12) + 1}${hh < 12 ? 'am' : 'pm'}`;
};

export type Mode = 'title' | 'playing' | 'paused' | 'menu';

/**
 * Game session: owns progress state, clock, job board and UI flow on top of the engine.
 */
export class Session {
  mode: Mode = 'title';
  readonly clock = new GameClock();
  state: PlayerState = newPlayerState();
  job: Job | null = null;
  board: Job[] = [];
  private boardDay = -1;
  takenJobs: string[] = [];
  private store: Storage = safeStorage();
  private autosaveT = 0;
  private hudT = 0;
  private beacon: THREE.Group;
  private nearPlace: Place | null = null;

  constructor(
    readonly engine: EngineHooks,
    readonly places: PlaceDirectory,
    readonly ui: UI,
  ) {
    this.beacon = this.makeBeacon();
    engine.scene.add(this.beacon);
    this.beacon.visible = false;
  }

  // ---------------------------------------------------------------- lifecycle

  showTitle(): void {
    this.mode = 'title';
    this.engine.unlockPointer();
    const save = readSave(this.store);
    this.ui.showTitle(!!save, () => this.continueGame(), () => this.newGame());
  }

  newGame(): void {
    this.state = newPlayerState();
    this.clock.minutes = 8 * 60 + 30;
    this.job = null;
    this.takenJobs = [];
    this.boardDay = -1;
    const sp = this.engine.defaultSpawn();
    this.engine.spawnAt(sp.x, sp.z, sp.yaw);
    this.begin();
    this.ui.toast('Welcome to Franklin! You have $25 and a free afternoon.');
    this.ui.toast('Press Tab to open your phone and find odd jobs.');
    this.save();
  }

  continueGame(): void {
    const s = readSave(this.store);
    if (!s) return this.newGame();
    this.state = s.player;
    this.clock.minutes = s.clockMinutes;
    this.job = s.job;
    this.takenJobs = s.takenJobs;
    this.boardDay = -1;
    this.engine.spawnAt(s.pos[0], s.pos[2], s.yaw);
    this.begin();
    this.ui.toast(`Welcome back. ${this.clock.format()}.`);
  }

  private begin(): void {
    this.ui.hideTitle();
    this.ui.closeModal(false);
    this.mode = 'playing';
    this.refreshBoard();
    this.engine.lockPointer();
  }

  save(): void {
    const p = this.engine.playerPos();
    writeSave(this.store, {
      clockMinutes: this.clock.minutes, player: this.state, pos: [p.x, p.y, p.z], yaw: this.engine.playerYaw(),
      job: this.job, takenJobs: this.takenJobs,
    });
  }

  resetSave(): void {
    this.store.removeItem(SAVE_KEY);
  }

  // ---------------------------------------------------------------- per frame

  /** Returns whether gameplay input should drive the player this frame. */
  tick(dt: number, sprinting: boolean): boolean {
    const playing = this.mode === 'playing';
    if (playing) {
      const before = this.clock.minutes;
      this.clock.advance(dt);
      tickNeeds(this.state, this.clock.minutes - before, sprinting ? dt : 0);
      updateJob(this.job, this.state);
      if (this.clock.day !== this.boardDay) this.refreshBoard();
      this.autosaveT += dt;
      if (this.autosaveT > 30) {
        this.autosaveT = 0;
        this.save();
      }
    }
    this.engine.applyAtmosphere(this.clock.hour);

    // proximity + prompt
    const p = this.engine.playerPos();
    this.nearPlace = playing ? this.places.nearestDoor(p.x, p.z) : null;
    this.updateBeacon(p);
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.2;
      this.updateHud(p);
    }
    // Pointer lock lost while playing (Esc) -> pause.
    if (playing && !this.ui.modalOpen && !this.engine.pointerLocked() && this.lockArmed) this.pause();
    if (playing && this.engine.pointerLocked()) this.lockArmed = true;
    return playing && !this.ui.modalOpen;
  }

  private lockArmed = false;

  get canSprint(): boolean {
    return this.state.energy > 2;
  }

  // ---------------------------------------------------------------- input

  onKey(code: string): void {
    if (this.mode === 'title') return;
    if (code === 'Escape') {
      if (this.ui.modalOpen) this.ui.closeModal();
      else if (this.mode === 'playing') this.pause();
      return;
    }
    if (this.mode !== 'playing') return;
    if ((code === 'Tab' || code === 'KeyJ') && !this.ui.modalOpen) this.openPhone('jobs');
    else if (code === 'Tab' && this.ui.modalOpen) this.ui.closeModal();
    else if (code === 'KeyE' && !this.ui.modalOpen && this.nearPlace) this.openPlace(this.nearPlace);
  }

  private openUI(build: (c: El) => void): void {
    this.lockArmed = false;
    this.engine.unlockPointer();
    this.ui.openModal(build, () => {
      if (this.mode === 'playing') this.engine.lockPointer();
    });
  }

  pause(): void {
    this.mode = 'paused';
    this.lockArmed = false;
    this.engine.unlockPointer();
    this.save();
    this.ui.openModal((c) => {
      c.append(
        h('h1', {}, 'Paused'),
        h('h2', {}, `${this.clock.format()} · $${this.state.money} · ${this.state.jobsDone} jobs done`),
        h('div', { class: 'fr-foot' },
          button('Resume', () => this.ui.closeModal(), { id: 'resume' }),
          button('Save', () => { this.save(); this.ui.toast('Game saved.'); }, { alt: true }),
          button('Quit to title', () => { this.save(); this.ui.closeModal(false); this.showTitle(); }, { alt: true })),
      );
    }, () => {
      this.mode = 'playing';
      this.engine.lockPointer();
    });
  }

  // ---------------------------------------------------------------- places

  openPlace(place: Place): void {
    if (!this.state.visited.includes(place.id)) {
      this.state.visited.push(place.id);
      this.state.mood = Math.min(100, this.state.mood + 1);
    }
    this.openUI((c) => this.buildPlaceCard(c, place));
  }

  private buildPlaceCard(c: El, place: Place): void {
    const prof = place.profile;
    const hour = this.clock.hour;
    const open = isOpen(prof, hour);
    const greet = prof.greetings[fnv1a(place.id + this.clock.day) % prof.greetings.length]!;
    c.append(
      h('h1', {}, place.name),
      h('h2', {}, `${prof.title}${place.address ? ' · ' + place.address : ''} · ${open ? 'Open' : 'Closed'} ${fmtHour(prof.open)}–${fmtHour(prof.close)}`),
      h('p', { class: 'say' }, open ? `“${greet}”` : 'The door is locked. A little sign says to come back later.'),
    );
    // job interaction here?
    const st = currentStep(this.job);
    if (st && st.placeId === place.id && st.action !== 'acquire') {
      const label = st.action === 'pickup' ? 'Pick up the parcel' : st.action === 'deliver' ? 'Deliver the parcel' : `Hand over the ${ITEMS[st.item!]!.name.toLowerCase()}`;
      c.append(row({
        icon: '📋', title: this.job!.title, sub: label,
        action: button(label.split(' ')[0]!, () => {
          const r = interactJob(this.job, place, this.state, this.clock.minutes);
          if (r) {
            this.ui.toast(r.msg, !r.ok);
            if (r.done) this.job = null;
            this.save();
          }
          this.ui.refresh();
        }, { id: 'job-action' }),
      }));
    }
    for (const id of prof.stock) {
      const it = ITEMS[id]!;
      c.append(row({
        icon: it.icon, title: `${it.name} — $${it.price}`, sub: it.desc,
        action: button('Buy', () => {
          const r = buy(this.state, id);
          this.ui.toast(r.msg, !r.ok);
          updateJob(this.job, this.state);
          this.ui.refresh();
        }, { disabled: !open || this.state.money < it.price, id: `buy-${id}` }),
      }));
    }
    if (!prof.stock.length) c.append(h('p', {}, 'Nothing for sale here, but it is nice to say hello.'));
    c.append(h('div', { class: 'fr-foot' }, h('span', {}, `💰 $${this.state.money}`), button('Leave', () => this.ui.closeModal(), { alt: true, id: 'leave' })));
  }

  // ---------------------------------------------------------------- phone

  private refreshBoard(): void {
    this.boardDay = this.clock.day;
    this.board = generateJobs(this.places, this.clock.day).filter((j) => !this.takenJobs.includes(j.id));
  }

  openPhone(tab: 'jobs' | 'bag' | 'me'): void {
    this.openUI((c) => this.buildPhone(c, tab));
  }

  private buildPhone(c: El, tab: 'jobs' | 'bag' | 'me'): void {
    const go = (t: 'jobs' | 'bag' | 'me') => () => {
      this.ui.openModal((cc) => this.buildPhone(cc, t), () => this.mode === 'playing' && this.engine.lockPointer());
    };
    c.append(
      h('h1', {}, '📱 Phone'),
      h('div', { class: 'fr-tabs' },
        button('Odd Jobs', go('jobs'), { alt: tab !== 'jobs', id: 'tab-jobs' }),
        button('Bag', go('bag'), { alt: tab !== 'bag', id: 'tab-bag' }),
        button('Me', go('me'), { alt: tab !== 'me', id: 'tab-me' })),
    );
    if (tab === 'jobs') {
      if (this.job) {
        const st = currentStep(this.job);
        const tgt = st ? this.places.get(st.placeId) : undefined;
        c.append(row({
          icon: '⭐', title: `Active: ${this.job.title} — $${this.job.reward}${this.job.bonus ? ` (+$${this.job.bonus} if quick)` : ''}`,
          sub: `${this.job.desc} Next: ${this.stepText()}${tgt ? ` (${tgt.name})` : ''}`,
          action: button('Abandon', () => { this.job = null; this.ui.toast('Job abandoned.'); this.ui.refresh(); }, { alt: true }),
        }));
      }
      if (!this.board.length) c.append(h('p', {}, 'No more jobs today. Check back tomorrow!'));
      for (const j of this.board) {
        c.append(row({
          icon: j.kind === 'errand' ? '🛍️' : j.kind === 'rush' ? '⏱️' : '📦',
          title: `${j.title} — $${j.reward}${j.bonus ? ` +$${j.bonus}` : ''}`,
          sub: j.desc,
          action: button('Accept', () => {
            this.job = acceptJob(j, this.clock.minutes);
            this.takenJobs.push(j.id);
            this.board = this.board.filter((b) => b.id !== j.id);
            this.ui.toast(`Accepted: ${j.title}. Follow the golden beacon.`);
            this.save();
            this.ui.closeModal();
          }, { disabled: !!this.job, id: `accept-${j.id}` }),
        }));
      }
    } else if (tab === 'bag') {
      const items = Object.entries(this.state.inventory);
      if (!items.length) c.append(h('p', {}, 'Your bag is empty.'));
      for (const [id, n] of items) {
        const it = ITEMS[id];
        if (!it) continue;
        const usable = it.kind !== 'parcel';
        c.append(row({
          icon: it.icon, title: `${it.name} ×${n}`, sub: it.desc,
          action: usable ? button(it.kind === 'drink' ? 'Drink' : it.kind === 'food' ? 'Eat' : 'Use', () => {
            const r = use(this.state, id);
            this.ui.toast(r.msg, !r.ok);
            this.ui.refresh();
          }, { id: `use-${id}` }) : undefined,
        }));
      }
    } else {
      c.append(
        row({ icon: '💰', title: `$${this.state.money}`, sub: `Earned so far: $${this.state.earned}` }),
        row({ icon: '⚡', title: `Energy ${Math.round(this.state.energy)} / 100`, sub: 'Eat and drink to keep your energy up. Running tires you out.' }),
        row({ icon: '☺', title: `Mood ${Math.round(this.state.mood)} / 100`, sub: 'Treats, visits and good work lift your mood.' }),
        row({ icon: '📦', title: `${this.state.jobsDone} jobs done`, sub: `${this.state.visited.length} places visited` }),
        row({
          icon: '😴', title: 'Rest on a bench for an hour', sub: '+12 energy. Time passes.',
          action: button('Rest', () => { this.clock.skip(60); this.state.energy = Math.min(100, this.state.energy + 12); this.ui.toast('You rest a while and watch the town go by.'); this.ui.refresh(); }, { alt: true, id: 'rest' }),
        }),
      );
    }
    c.append(h('div', { class: 'fr-foot' }, h('span', {}, this.clock.format()), button('Close', () => this.ui.closeModal(), { alt: true, id: 'close' })));
  }

  // ---------------------------------------------------------------- HUD & beacon

  private stepText(): string {
    const st = currentStep(this.job);
    if (!st) return '';
    const place = this.places.get(st.placeId);
    const name = place?.name ?? 'somewhere';
    switch (st.action) {
      case 'pickup': return `Pick up the parcel at ${name}`;
      case 'deliver': return `Deliver the parcel to ${name}`;
      case 'acquire': return `Buy a ${ITEMS[st.item!]!.name.toLowerCase()} (try ${name})`;
      case 'bring': return `Bring the ${ITEMS[st.item!]!.name.toLowerCase()} to ${name}`;
    }
  }

  private target(): Place | null {
    const st = currentStep(this.job);
    return st ? this.places.get(st.placeId) ?? null : null;
  }

  private updateHud(p: { x: number; z: number }): void {
    this.ui.setClock(this.clock.format(), `Day ${this.clock.day + 1}`);
    this.ui.setStats(this.state.money, this.state.energy, this.state.mood);
    const t = this.target();
    if (t && this.mode === 'playing') {
      const dx = t.stand[0] - p.x, dz = t.stand[2] - p.z;
      // bearing relative to view: yaw 0 looks toward -z
      const ang = Math.atan2(-dx, -dz) - this.engine.playerYaw();
      this.ui.setObjective(this.stepText(), Math.hypot(dx, dz), (-ang * 180) / Math.PI);
    } else this.ui.setObjective(this.mode === 'playing' && !this.job ? 'Open your phone (Tab) to find an odd job' : null);
    if (this.nearPlace && !this.ui.modalOpen) {
      const open = isOpen(this.nearPlace.profile, this.clock.hour);
      this.ui.setPrompt(`${this.nearPlace.name} · ${this.nearPlace.profile.title}${open ? '' : ' (closed)'}`);
    } else this.ui.setPrompt(null);
  }

  private makeBeacon(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const yN = positionLocal.y.div(60.0);
    const pulse = sin(time.mul(2.5)).mul(0.15).add(0.85);
    mat.colorNode = color(0xffc46b).mul(2.2);
    mat.opacityNode = mix(float(0.55), float(0.0), smoothstep(0.0, 1.0, yN)).mul(pulse);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 60, 12, 1, true), mat);
    beam.position.y = 30;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshBasicNodeMaterial({ fog: false }));
    (gem.material as THREE.MeshBasicNodeMaterial).colorNode = color(0xffe0a0).mul(1.6);
    gem.position.y = 2.6;
    gem.name = 'beacon-gem';
    g.add(beam, gem);
    g.name = 'beacon';
    return g;
  }

  private updateBeacon(p: { x: number; z: number }): void {
    const t = this.mode !== 'title' ? this.target() : null;
    this.beacon.visible = !!t;
    if (!t) return;
    this.beacon.position.set(t.stand[0], t.stand[1], t.stand[2]);
    const gem = this.beacon.getObjectByName('beacon-gem')!;
    gem.rotation.y += 0.03;
    gem.position.y = 2.6 + Math.sin(performance.now() / 400) * 0.15;
    void p;
  }
}
