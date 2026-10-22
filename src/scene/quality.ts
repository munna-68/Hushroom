// Quality tiers: one settings table, a persisted user choice, and an auto mode that
// probes at startup and then watches frame times (95th percentile) with hysteresis.
// Hardware hints only pick the starting point.

export type Tier = 'high' | 'medium' | 'low';
export type TierChoice = 'auto' | Tier;
export const TIERS: Tier[] = ['high', 'medium', 'low'];

export interface TierSettings {
  /** Device pixel ratio cap. */
  dpr: number;
  /** Sun/moon shadow map size (0 = off) and soft filtering. */
  shadowMap: number;
  shadowSoft: boolean;
  /** Additive window haze; glow sprite size multiplier. */
  haze: boolean;
  glow: number;
  motes: number;
  steamPerMug: number;
  /** Rain on the glass as a scrolling texture instead of procedural drops. */
  simpleRain: boolean;
  /** 0..1 how often seated micro-behaviours run. */
  micro: number;
  /** Update the far half of the characters' poses at half rate. */
  halfRateFar: boolean;
  /** Frame cap in fps (0 = display rate). */
  fps: number;
}

export const TIER_SETTINGS: Record<Tier, TierSettings> = {
  high: { dpr: 2, shadowMap: 2048, shadowSoft: true, haze: true, glow: 1, motes: 90, steamPerMug: 6, simpleRain: false, micro: 1, halfRateFar: false, fps: 60 },
  medium: { dpr: 1.5, shadowMap: 0, shadowSoft: false, haze: true, glow: 1, motes: 45, steamPerMug: 4, simpleRain: false, micro: 0.6, halfRateFar: false, fps: 60 },
  low: { dpr: 1, shadowMap: 0, shadowSoft: false, haze: false, glow: 0.85, motes: 0, steamPerMug: 2, simpleRain: true, micro: 0.25, halfRateFar: true, fps: 30 },
};

const KEY = 'st.quality';
const STEP_DOWN_MS = 20; // p95 above this for 3 s → step down
const BAD_FOR = 3;
const GOOD_FOR = 30;

function readChoice(): TierChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'auto' || v === 'high' || v === 'medium' || v === 'low') return v;
  } catch { /* storage unavailable */ }
  return 'auto';
}

function writeChoice(c: TierChoice) {
  try { localStorage.setItem(KEY, c); } catch { /* storage unavailable */ }
}

/** Starting tier from hardware hints (tie-breakers only; the probe decides). */
export function hintTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 4;
  let gpu = '';
  try {
    const c = document.createElement('canvas').getContext('webgl');
    const ext = c?.getExtension('WEBGL_debug_renderer_info');
    if (c && ext) gpu = String(c.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();
    c?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* no info */ }
  const weakGpu = /mali-[gt]?[4-7]\d|adreno \(tm\) [3-5]\d\d|powervr|intel.*hd graphics [2-5]/.test(gpu);
  if (!coarse) return weakGpu ? 'medium' : cores >= 8 ? 'high' : 'medium';
  if (weakGpu || mem < 4 || cores < 6) return 'low';
  return cores >= 8 && mem >= 6 ? 'high' : 'medium';
}

export interface QualityStats { fps: number; p95: number; tier: Tier; choice: TierChoice }

export interface QualityManager {
  /** The tier in effect. */
  getTier(): Tier;
  /** What the user picked ('auto' unless they chose a tier). */
  getChoice(): TierChoice;
  setTier(choice: TierChoice): void;
  subscribe(cb: (tier: Tier) => void): () => void;
  settings(): TierSettings;
  /** Feed one rendered frame: interval since the previous rendered frame, ms. */
  frame(intervalMs: number, nowS: number): void;
  stats(): QualityStats;
}

export function createQuality(override?: Tier | null): QualityManager {
  let choice: TierChoice = override ?? readChoice();
  let tier: Tier = choice === 'auto' ? hintTier() : choice;
  const subs = new Set<(t: Tier) => void>();
  // Ring buffer of recent frame intervals.
  const N = 120;
  const buf = new Float32Array(N);
  const sorted = new Float32Array(N);
  let n = 0, head = 0;
  let badSince = -1, goodSince = -1, lastChange = 0, steppedUp = false, lockedUp = false;
  let probeUntil = -1, lastEval = 0;
  let p95 = 0, fps = 0;

  const set = (t: Tier, now: number) => {
    if (t === tier) return;
    tier = t;
    lastChange = now;
    badSince = goodSince = -1;
    n = head = 0;
    subs.forEach((cb) => cb(tier));
  };

  return {
    getTier: () => tier,
    getChoice: () => choice,
    setTier(c) {
      choice = c;
      writeChoice(c);
      steppedUp = lockedUp = false;
      probeUntil = -1;
      set(c === 'auto' ? hintTier() : c, lastEval);
      subs.forEach((cb) => cb(tier));
    },
    subscribe(cb) { subs.add(cb); return () => subs.delete(cb); },
    settings: () => TIER_SETTINGS[tier],
    frame(ms, now) {
      if (ms <= 0 || ms > 250) return; // hidden tab or a stall: not a rendering signal
      buf[head] = ms; head = (head + 1) % N; n = Math.min(N, n + 1);
      if (now - lastEval < 0.5) return;
      lastEval = now;
      // p95 over the buffer (insertion sort of ≤120 floats, twice a second).
      for (let i = 0; i < n; i++) {
        const v = buf[i];
        let j = i - 1;
        while (j >= 0 && sorted[j] > v) { sorted[j + 1] = sorted[j]; j--; }
        sorted[j + 1] = v;
      }
      let sum = 0;
      for (let i = 0; i < n; i++) sum += buf[i];
      fps = n ? 1000 / (sum / n) : 0;
      p95 = n ? sorted[Math.min(n - 1, Math.floor(n * 0.95))] : 0;
      if (choice !== 'auto' || n < 30) return;
      if (probeUntil < 0) probeUntil = now + 2.5;
      const target = 1000 / TIER_SETTINGS[tier].fps;
      const limit = Math.max(STEP_DOWN_MS, target * 1.25);
      const idx = TIERS.indexOf(tier);
      if (p95 > limit) {
        goodSince = -1;
        if (badSince < 0) badSince = now;
        // During the startup probe one bad window is enough.
        if ((now < probeUntil || now - badSince >= BAD_FOR) && idx < TIERS.length - 1) {
          if (steppedUp) lockedUp = true;
          set(TIERS[idx + 1], now);
        }
      } else {
        badSince = -1;
        // Holding the tier's own cap steadily is the only headroom signal a browser gives;
        // the one step up is undone (and locked) if it doesn't hold.
        const headroom = p95 < target * 1.08;
        if (!headroom) { goodSince = -1; return; }
        if (goodSince < 0) goodSince = now;
        if (!steppedUp && !lockedUp && idx > 0 && now - goodSince >= GOOD_FOR && now - lastChange >= GOOD_FOR) {
          steppedUp = true;
          set(TIERS[idx - 1], now);
        }
      }
    },
    stats: () => ({ fps, p95, tier, choice }),
  };
}
