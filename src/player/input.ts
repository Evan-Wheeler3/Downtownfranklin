import type { MoveIntent } from './controller';

/** Keyboard + pointer-lock mouse input -> MoveIntent and look deltas. */
export class InputState {
  private keys = new Set<string>();
  private lookDX = 0;
  private lookDY = 0;
  private pressed = new Set<string>();
  fly = false;
  /** Scripted override (automation/tests); takes precedence over keyboard when set. */
  scripted: Partial<MoveIntent> | null = null;

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'KeyF') this.fly = !this.fly;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('click', () => {
      if (document.pointerLockElement !== el) el.requestPointerLock?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== el) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.el;
  }

  /** Returns true once per key press. */
  consumePress(code: string): boolean {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  takeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  intent(): MoveIntent {
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    const base: MoveIntent = {
      forward: k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'),
      right: k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft'),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      jump: this.keys.has('Space'),
      fly: this.fly,
      up: k('KeyE') + (this.fly ? k('Space') : 0) - k('KeyQ') - k('ControlLeft'),
    };
    return this.scripted ? { ...base, ...this.scripted } : base;
  }
}
