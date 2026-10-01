/**
 * Cozy DOM UI: HUD, prompts, toasts, compass, and modal panels (shop, phone, menus).
 * Rendering only — game logic lives in src/game. Styled like warm paper cards.
 */
const CSS = `
.fr-ui{position:fixed;inset:0;pointer-events:none;font-family:Georgia,'Iowan Old Style','Palatino Linotype',serif;color:#3b2f25}
.fr-hud{position:absolute;top:14px;left:16px;right:16px;display:flex;justify-content:space-between;align-items:flex-start}
.fr-chip{background:rgba(255,248,232,.88);border:1px solid rgba(120,90,60,.25);border-radius:14px;padding:8px 14px;box-shadow:0 4px 14px rgba(60,40,20,.18);backdrop-filter:blur(4px)}
.fr-clock{font-size:18px;letter-spacing:.3px}
.fr-clock small{display:block;font-size:12px;opacity:.7}
.fr-stats{display:flex;gap:14px;align-items:center;font-size:16px}
.fr-bar{width:92px;height:9px;border-radius:6px;background:rgba(80,60,40,.18);overflow:hidden;display:inline-block;vertical-align:middle;margin-left:6px}
.fr-bar>i{display:block;height:100%;border-radius:6px;transition:width .4s}
.fr-obj{position:absolute;top:14px;left:50%;transform:translateX(-50%);text-align:center;min-width:240px;max-width:46vw}
.fr-obj b{display:block;font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.65}
.fr-obj .arrow{display:inline-block;font-size:20px;transition:transform .15s linear;color:#c0562f}
.fr-prompt{position:absolute;left:50%;bottom:16%;transform:translateX(-50%);font-size:17px;text-align:center}
.fr-prompt kbd{display:inline-block;font-family:inherit;background:#3b2f25;color:#fff6e6;border-radius:6px;padding:1px 8px;margin-right:6px}
.fr-toasts{position:absolute;right:16px;bottom:56px;display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.fr-toast{animation:frin .25s ease-out;max-width:380px;font-size:15px}
.fr-toast.bad{border-color:#c0562f}
@keyframes frin{from{opacity:0;transform:translateY(8px)}to{opacity:1}}
.fr-cross{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:rgba(255,250,240,.85);box-shadow:0 0 0 1px rgba(60,40,20,.35)}
.fr-modal{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(40,28,18,.28);pointer-events:auto}
.fr-card{width:min(560px,92vw);max-height:84vh;overflow:auto;background:#fff8ea;border-radius:18px;padding:22px 24px;box-shadow:0 20px 50px rgba(40,25,10,.35);border:1px solid rgba(120,90,60,.25)}
.fr-card h1{margin:0 0 2px;font-size:26px;font-weight:600}
.fr-card h2{margin:0 0 14px;font-size:14px;font-weight:400;opacity:.7}
.fr-card p.say{font-style:italic;margin:6px 0 16px}
.fr-row{display:flex;align-items:center;gap:12px;padding:10px 4px;border-top:1px dashed rgba(120,90,60,.25)}
.fr-row .ic{font-size:26px;width:34px;text-align:center}
.fr-row .tx{flex:1}
.fr-row .tx small{display:block;opacity:.65;font-size:13px}
.fr-btn{font-family:inherit;font-size:15px;border:0;border-radius:10px;padding:8px 14px;background:#c0562f;color:#fff8ee;cursor:pointer;box-shadow:0 2px 0 #8e3c1e}
.fr-btn:hover{filter:brightness(1.08)}.fr-btn:disabled{opacity:.45;cursor:default}
.fr-btn.alt{background:#e9dcc3;color:#3b2f25;box-shadow:0 2px 0 #c9b799}
.fr-tabs{display:flex;gap:6px;margin:8px 0 10px}
.fr-tabs .fr-btn{padding:6px 12px}
.fr-foot{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
.fr-title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto;background:radial-gradient(ellipse at center,rgba(255,240,215,.25),rgba(40,25,10,.45))}
.fr-title h1{font-size:64px;margin:0;color:#fff8ea;text-shadow:0 4px 24px rgba(60,30,10,.55);font-weight:600;letter-spacing:1px}
.fr-title p{color:#fff3df;margin:6px 0 26px;font-size:18px;text-shadow:0 2px 8px rgba(60,30,10,.6)}
.fr-title .fr-btn{font-size:18px;padding:10px 26px;margin:6px;min-width:200px}
.fr-help{margin-top:22px;color:#fff3df;font-size:14px;text-shadow:0 1px 4px rgba(0,0,0,.6);text-align:center;line-height:1.6}
.fr-attr{position:absolute;right:8px;bottom:6px;max-width:58%;text-align:right;font:10px/1.3 system-ui,sans-serif;color:#fff;opacity:.75;text-shadow:0 1px 2px #000}
`;

export type El = HTMLElement;

function h(tag: string, attrs: Record<string, string> = {}, ...kids: (El | string | null | undefined)[]): El {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}

export function button(label: string, onClick: () => void, opts: { alt?: boolean; disabled?: boolean; id?: string } = {}): El {
  const b = h('button', { class: `fr-btn${opts.alt ? ' alt' : ''}`, ...(opts.id ? { 'data-ui': opts.id } : {}) }, label) as HTMLButtonElement;
  b.disabled = !!opts.disabled;
  b.onclick = (e) => {
    e.stopPropagation();
    onClick();
  };
  return b;
}

export interface RowSpec {
  icon: string;
  title: string;
  sub?: string;
  action?: El;
}

export function row(r: RowSpec): El {
  return h('div', { class: 'fr-row' }, h('div', { class: 'ic' }, r.icon), h('div', { class: 'tx' }, r.title, r.sub ? h('small', {}, r.sub) : null), r.action ?? null);
}

export class UI {
  readonly root: El;
  private clock: El;
  private stats: El;
  private obj: El;
  private prompt: El;
  private toasts: El;
  private modal: El | null = null;
  private title: El | null = null;
  onModalClose: (() => void) | null = null;

  constructor(parent: El, attribution: string[]) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = h('div', { class: 'fr-ui' });
    this.clock = h('div', { class: 'fr-chip fr-clock' });
    this.stats = h('div', { class: 'fr-chip fr-stats' });
    this.obj = h('div', { class: 'fr-chip fr-obj' });
    this.obj.style.display = 'none';
    const hud = h('div', { class: 'fr-hud' }, this.clock, this.stats);
    this.prompt = h('div', { class: 'fr-chip fr-prompt' });
    this.prompt.style.display = 'none';
    this.toasts = h('div', { class: 'fr-toasts' });
    this.root.append(hud, this.obj, this.prompt, this.toasts, h('div', { class: 'fr-cross' }), h('div', { class: 'fr-attr' }, attribution.join(' · ')));
    parent.appendChild(this.root);
  }

  get modalOpen(): boolean {
    return this.modal !== null || this.title !== null;
  }

  setClock(time: string, sub: string): void {
    this.clock.innerHTML = '';
    this.clock.append(time, h('small', {}, sub));
  }

  setStats(money: number, energy: number, mood: number): void {
    const bar = (v: number, c: string) => {
      const b = h('span', { class: 'fr-bar' });
      const i = h('i');
      i.style.width = `${Math.max(0, Math.min(100, v))}%`;
      i.style.background = c;
      b.append(i);
      return b;
    };
    this.stats.innerHTML = '';
    this.stats.append(
      h('span', { 'data-ui': 'money' }, `💰 $${money}`),
      h('span', {}, '⚡', bar(energy, energy < 20 ? '#c0562f' : '#e2a93b')),
      h('span', {}, '☺', bar(mood, '#6aa05a')),
    );
  }

  setObjective(text: string | null, distance?: number, arrowDeg?: number): void {
    if (!text) {
      this.obj.style.display = 'none';
      return;
    }
    this.obj.style.display = 'block';
    this.obj.innerHTML = '';
    const arrow = h('span', { class: 'arrow' }, '▲');
    arrow.style.transform = `rotate(${arrowDeg ?? 0}deg)`;
    this.obj.append(h('b', {}, 'Current task'), text);
    if (distance !== undefined) this.obj.append(h('div', {}, arrow, ` ${Math.round(distance)} m`));
  }

  setPrompt(text: string | null, key = 'E'): void {
    if (!text) {
      this.prompt.style.display = 'none';
      return;
    }
    this.prompt.style.display = 'block';
    this.prompt.innerHTML = '';
    this.prompt.append(h('kbd', {}, key), text);
  }

  toast(msg: string, bad = false): void {
    const t = h('div', { class: `fr-chip fr-toast${bad ? ' bad' : ''}` }, msg);
    this.toasts.append(t);
    setTimeout(() => t.remove(), 4200);
    while (this.toasts.children.length > 4) this.toasts.firstChild!.remove();
  }

  /** Show a modal card. Content builder is re-invoked by `refresh()`. */
  openModal(build: (card: El) => void, onClose?: () => void): void {
    this.closeModal(false);
    const card = h('div', { class: 'fr-card' });
    build(card);
    this.modal = h('div', { class: 'fr-modal' }, card);
    this.modal.onclick = (e) => {
      if (e.target === this.modal) this.closeModal();
    };
    this.root.append(this.modal);
    this.onModalClose = onClose ?? null;
    this.modalBuild = build;
    this.modalCard = card;
  }

  private modalBuild: ((card: El) => void) | null = null;
  private modalCard: El | null = null;

  refresh(): void {
    if (!this.modalCard || !this.modalBuild) return;
    this.modalCard.innerHTML = '';
    this.modalBuild(this.modalCard);
  }

  closeModal(notify = true): void {
    if (!this.modal) return;
    this.modal.remove();
    this.modal = null;
    this.modalCard = null;
    this.modalBuild = null;
    const cb = this.onModalClose;
    this.onModalClose = null;
    if (notify) cb?.();
  }

  showTitle(hasSave: boolean, onContinue: () => void, onNew: () => void): void {
    this.hideTitle();
    this.title = h(
      'div',
      { class: 'fr-title' },
      h('h1', {}, 'Franklin'),
      h('p', {}, 'a small town, a long afternoon'),
      hasSave ? button('Continue', onContinue, { id: 'continue' }) : null,
      button(hasSave ? 'New Game' : 'Begin', onNew, { alt: hasSave, id: 'new-game' }),
      h('div', { class: 'fr-help' }, 'Click to look around · WASD walk · Shift run · Space jump', h('br'), 'E interact · Tab phone (jobs, bag, you) · Esc pause'),
    );
    this.root.append(this.title);
  }

  hideTitle(): void {
    this.title?.remove();
    this.title = null;
  }
}

export { h };
