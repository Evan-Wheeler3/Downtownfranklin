/** Minimal DOM HUD: debug readout, nearby-place label, controls help, data attribution. */
export class Hud {
  readonly root: HTMLDivElement;
  private debug: HTMLPreElement;
  private label: HTMLDivElement;
  private help: HTMLDivElement;
  private crosshair: HTMLDivElement;
  showDebug = new URLSearchParams(location.search).has('debug');

  constructor(parent: HTMLElement, attribution: string[]) {
    this.root = document.createElement('div');
    this.root.style.cssText = 'position:fixed;inset:0;pointer-events:none;color:#fff;font:12px/1.35 ui-monospace,monospace;';
    this.debug = document.createElement('pre');
    this.debug.style.cssText =
      'position:absolute;left:8px;top:8px;margin:0;padding:6px 8px;background:rgba(0,0,0,.45);border-radius:4px;white-space:pre;';
    this.label = document.createElement('div');
    this.label.style.cssText =
      'position:absolute;left:50%;bottom:64px;transform:translateX(-50%);font:600 15px system-ui,sans-serif;text-shadow:0 1px 3px #000;text-align:center;';
    this.help = document.createElement('div');
    this.help.style.cssText =
      'position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);padding:14px 18px;background:rgba(0,0,0,.55);border-radius:6px;font:14px/1.6 system-ui,sans-serif;text-align:center;';
    this.help.innerHTML =
      '<b>Downtown Franklin</b><br>Click to look around<br>WASD move · Shift run · Space jump<br>F fly (debug) · Q/E down/up · H toggle debug';
    this.crosshair = document.createElement('div');
    this.crosshair.style.cssText =
      'position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:rgba(255,255,255,.8);';
    const attr = document.createElement('div');
    attr.style.cssText =
      'position:absolute;right:6px;bottom:4px;max-width:60%;text-align:right;font:10px/1.3 system-ui,sans-serif;opacity:.8;text-shadow:0 1px 2px #000;';
    attr.textContent = attribution.join(' · ');
    this.root.append(this.debug, this.label, this.help, this.crosshair, attr);
    parent.appendChild(this.root);
  }

  hideHelp = false;

  setLocked(locked: boolean): void {
    this.help.style.display = locked || this.hideHelp ? 'none' : 'block';
  }

  setDebug(text: string): void {
    this.debug.style.display = this.showDebug ? 'block' : 'none';
    if (this.showDebug) this.debug.textContent = text;
  }

  setLabel(text: string): void {
    this.label.textContent = text;
  }
}
