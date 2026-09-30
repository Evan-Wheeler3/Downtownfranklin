import * as THREE from 'three/webgpu';

/**
 * Procedural facade textures (generated at runtime — no external imagery).
 * Texture colour is multiplied by per-vertex wall colour, so walls are drawn near-white.
 */
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 1): void {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
  }
  g.putImageData(img, 0, 0);
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** One bay (3 m) x one floor (3.5 m): wall with a sash window. */
export function upperFacadeTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 150;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#f2f0ec';
  g.fillRect(0, 0, W, H);
  // brick coursing hint
  g.strokeStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < H; y += 4) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  // canvas y is flipped relative to v (v=0 at bottom of floor)
  const wx = 40;
  const ww = 48;
  const top = 30;
  const wh = 80;
  g.fillStyle = '#d9d4ca'; // lintel + sill
  g.fillRect(wx - 5, top - 7, ww + 10, 7);
  g.fillRect(wx - 4, top + wh, ww + 8, 5);
  g.fillStyle = '#2a3440';
  g.fillRect(wx, top, ww, wh);
  const grd = g.createLinearGradient(wx, top, wx + ww, top + wh);
  grd.addColorStop(0, 'rgba(160,190,215,0.55)');
  grd.addColorStop(0.5, 'rgba(60,80,100,0.1)');
  grd.addColorStop(1, 'rgba(150,175,200,0.4)');
  g.fillStyle = grd;
  g.fillRect(wx, top, ww, wh);
  g.fillStyle = '#e8e4dc'; // sash frames
  g.fillRect(wx, top + wh / 2 - 2, ww, 4);
  g.fillRect(wx + ww / 2 - 1.5, top, 3, wh);
  g.strokeStyle = '#e8e4dc';
  g.lineWidth = 3;
  g.strokeRect(wx, top, ww, wh);
  noise(g, W, H, 14, 7);
  return finish(c);
}

/** One bay x storefront band (4.2 m): display glass, bulkhead, transom, sign band. */
export function storefrontTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 180;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#efece6';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#3c2f2a'; // sign band / cornice
  g.fillRect(0, 0, W, 22);
  g.fillStyle = '#d8d2c6';
  g.fillRect(0, 22, W, 4);
  // transom
  g.fillStyle = '#34414c';
  g.fillRect(8, 34, W - 16, 22);
  // display window
  g.fillStyle = '#56697a';
  g.fillRect(8, 60, W - 16, 88);
  const grd = g.createLinearGradient(0, 60, W, 148);
  grd.addColorStop(0, 'rgba(215,228,238,0.65)');
  grd.addColorStop(0.55, 'rgba(90,110,125,0.15)');
  grd.addColorStop(1, 'rgba(200,215,226,0.5)');
  g.fillStyle = grd;
  g.fillRect(8, 60, W - 16, 88);
  g.fillStyle = '#4a3a30'; // mullions + bulkhead
  g.fillRect(8, 56, W - 16, 4);
  g.fillRect(W / 2 - 2, 34, 4, 114);
  g.fillRect(4, 34, 4, 146);
  g.fillRect(W - 8, 34, 4, 146);
  g.fillStyle = '#5b4637';
  g.fillRect(8, 148, W - 16, 32);
  noise(g, W, H, 10, 3);
  return finish(c);
}

export function roofTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  noise(g, 64, 64, 40, 11);
  return finish(c);
}

export function groundTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  noise(g, S, S, 60, 5);
  // soft blotches
  for (let i = 0; i < 60; i++) {
    const x = (i * 97) % S;
    const y = (i * 57) % S;
    const r = 8 + ((i * 13) % 20);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, i % 2 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return finish(c);
}
