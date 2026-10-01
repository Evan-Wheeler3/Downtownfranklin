/**
 * Time-of-day art direction: keyframed sky/light/haze palettes interpolated by hour.
 * The directional light is the sun by day and a cool moon by night (kept above the horizon
 * so shadows stay sensible).
 */
export interface Atmosphere {
  lightAz: number;
  lightEl: number;
  lightColor: number;
  lightI: number;
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  zenith: number;
  horizon: number;
  haze: number;
  fog: number;
  exposure: number;
  /** 0 day … 1 full night: window glow, lamps, stars. */
  night: number;
}

type Key = [hour: number, a: Atmosphere];

const K = (h: number, a: Atmosphere): Key => [h, a];

const KEYS: Key[] = [
  K(0, { lightAz: 140, lightEl: 38, lightColor: 0x93a9dc, lightI: 0.45, hemiSky: 0x33467a, hemiGround: 0x1d1c2a, hemiI: 0.75, zenith: 0x0a1736, horizon: 0x24375c, haze: 0x1c2a48, fog: 0.0024, exposure: 1.0, night: 1 }),
  K(5.2, { lightAz: 150, lightEl: 30, lightColor: 0x93a9dc, lightI: 0.4, hemiSky: 0x3d4f84, hemiGround: 0x2a2430, hemiI: 0.8, zenith: 0x15244c, horizon: 0x5a5c84, haze: 0x3e4468, fog: 0.0026, exposure: 1.0, night: 0.9 }),
  K(6.3, { lightAz: 88, lightEl: 4, lightColor: 0xff9a6a, lightI: 1.2, hemiSky: 0x8a90c0, hemiGround: 0x8a6a5a, hemiI: 1.0, zenith: 0x3a5fa8, horizon: 0xffb48e, haze: 0xd8a89a, fog: 0.0032, exposure: 1.05, night: 0.35 }),
  K(8, { lightAz: 105, lightEl: 18, lightColor: 0xffcf96, lightI: 3.0, hemiSky: 0xa9c2ea, hemiGround: 0xd6b07e, hemiI: 1.25, zenith: 0x3a82d8, horizon: 0xf6dcc0, haze: 0xe6d6c8, fog: 0.0024, exposure: 1.05, night: 0 }),
  K(12, { lightAz: 170, lightEl: 55, lightColor: 0xfff1da, lightI: 3.6, hemiSky: 0xb4cbee, hemiGround: 0xd4b386, hemiI: 1.35, zenith: 0x2470d6, horizon: 0xe2ecf0, haze: 0xd3dde6, fog: 0.0015, exposure: 1.0, night: 0 }),
  K(16, { lightAz: 225, lightEl: 33, lightColor: 0xffd29a, lightI: 3.9, hemiSky: 0xa9c2ea, hemiGround: 0xdcb27a, hemiI: 1.35, zenith: 0x2470d6, horizon: 0xe2ecf0, haze: 0xd3dde6, fog: 0.0017, exposure: 1.06, night: 0 }),
  K(18.2, { lightAz: 252, lightEl: 12, lightColor: 0xffae62, lightI: 3.4, hemiSky: 0x9fb2e0, hemiGround: 0xe0a46a, hemiI: 1.2, zenith: 0x3a68c0, horizon: 0xffc58c, haze: 0xf0c4a0, fog: 0.0022, exposure: 1.08, night: 0.05 }),
  K(19.4, { lightAz: 262, lightEl: 3, lightColor: 0xff7446, lightI: 1.8, hemiSky: 0x8a7cb8, hemiGround: 0x9a6a5a, hemiI: 1.0, zenith: 0x2e3c7c, horizon: 0xff8a66, haze: 0xc0889a, fog: 0.0028, exposure: 1.08, night: 0.45 }),
  K(20.6, { lightAz: 120, lightEl: 30, lightColor: 0x9cb0e2, lightI: 0.5, hemiSky: 0x404c88, hemiGround: 0x2a2234, hemiI: 0.8, zenith: 0x142050, horizon: 0x4c4478, haze: 0x343a62, fog: 0.0026, exposure: 1.0, night: 0.9 }),
  K(24, { lightAz: 140, lightEl: 38, lightColor: 0x93a9dc, lightI: 0.45, hemiSky: 0x33467a, hemiGround: 0x1d1c2a, hemiI: 0.75, zenith: 0x0a1736, horizon: 0x24375c, haze: 0x1c2a48, fog: 0.0024, exposure: 1.0, night: 1 }),
];

function lerpColor(a: number, b: number, t: number): number {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const mix = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return mix(16) | mix(8) | mix(0);
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
}

export function atmosphereAt(hour: number): Atmosphere {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1]![0] <= h) i++;
  const [h0, a] = KEYS[i]!;
  const [h1, b] = KEYS[i + 1]!;
  const t0 = (h - h0) / (h1 - h0);
  const t = t0 * t0 * (3 - 2 * t0); // smoothstep between keys
  const num = (x: number, y: number) => x + (y - x) * t;
  return {
    lightAz: lerpAngle(a.lightAz, b.lightAz, t),
    lightEl: num(a.lightEl, b.lightEl),
    lightColor: lerpColor(a.lightColor, b.lightColor, t),
    lightI: num(a.lightI, b.lightI),
    hemiSky: lerpColor(a.hemiSky, b.hemiSky, t),
    hemiGround: lerpColor(a.hemiGround, b.hemiGround, t),
    hemiI: num(a.hemiI, b.hemiI),
    zenith: lerpColor(a.zenith, b.zenith, t),
    horizon: lerpColor(a.horizon, b.horizon, t),
    haze: lerpColor(a.haze, b.haze, t),
    fog: num(a.fog, b.fog),
    exposure: num(a.exposure, b.exposure),
    night: num(a.night, b.night),
  };
}
