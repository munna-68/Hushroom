// WebAudio soundscape: everything synthesized, no audio files. Music tracks
// come from /music/manifest.json (empty until the owner adds files).
import { load, save } from '../lib/storage';

export interface SoundPrefs { rain: boolean; room: boolean; music: boolean; volume: number }
export interface Track { title: string; artist?: string; src: string; license?: string }

const KEY = 'st.sound';
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const layers: Partial<Record<'rain' | 'room', GainNode>> = {};
let musicEl: HTMLAudioElement | null = null;
let tracks: Track[] = [];
let trackIdx = 0;
let crackleTimer = 0;

export const prefs: SoundPrefs = { rain: false, room: false, music: false, volume: 0.6, ...load<Partial<SoundPrefs>>(KEY, {}) };
const listeners = new Set<() => void>();
export function onPrefs(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
function changed() { save(KEY, prefs); listeners.forEach((l) => l()); }

function noiseBuffer(c: AudioContext, brown: boolean): AudioBuffer {
  const len = c.sampleRate * 3;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}

function loop(c: AudioContext, buf: AudioBuffer): AudioBufferSourceNode {
  const s = c.createBufferSource();
  s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2);
  return s;
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = prefs.volume;
  master.connect(ctx.destination);
  const white = noiseBuffer(ctx, false);
  const brown = noiseBuffer(ctx, true);

  // Rain: filtered hiss with slow gusts + low rumble.
  const rain = ctx.createGain(); rain.gain.value = 0; rain.connect(master);
  const hiss = loop(ctx, white);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
  const hissG = ctx.createGain(); hissG.gain.value = 0.16;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.05;
  lfo.connect(lfoG).connect(hissG.gain); lfo.start();
  hiss.connect(hp).connect(lp).connect(hissG).connect(rain);
  const rumble = loop(ctx, brown);
  const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 420;
  const rG = ctx.createGain(); rG.gain.value = 0.5;
  rumble.connect(rlp).connect(rG).connect(rain);
  layers.rain = rain;

  // Room: warm room tone + sparse vinyl crackle.
  const room = ctx.createGain(); room.gain.value = 0; room.connect(master);
  const tone = loop(ctx, brown);
  const tlp = ctx.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 200;
  const tG = ctx.createGain(); tG.gain.value = 0.35;
  tone.connect(tlp).connect(tG).connect(room);
  const crackleBus = ctx.createBiquadFilter(); crackleBus.type = 'bandpass'; crackleBus.frequency.value = 2400; crackleBus.Q.value = 0.7;
  crackleBus.connect(room);
  const click = ctx.createBuffer(1, 128, ctx.sampleRate);
  click.getChannelData(0).forEach((_, i, a) => { a[i] = (Math.random() * 2 - 1) * Math.exp(-i / 14); });
  crackleTimer = window.setInterval(() => {
    if (!ctx || !prefs.room || ctx.state !== 'running') return;
    const n = Math.random() < 0.3 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const s = ctx.createBufferSource(); s.buffer = click;
      const g = ctx.createGain(); g.gain.value = 0.08 + Math.random() * 0.25;
      s.connect(g).connect(crackleBus);
      s.start(ctx.currentTime + Math.random() * 0.12);
    }
  }, 140);
  layers.room = room;
  return ctx;
}

function fade(node: GainNode | undefined, to: number) {
  if (!node || !ctx) return;
  node.gain.cancelScheduledValues(ctx.currentTime);
  node.gain.setTargetAtTime(to, ctx.currentTime, 0.6);
}

/** Call from a user gesture (or after sticky activation) to (re)start audio. */
export function unlock() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  apply();
}

function apply() {
  if (!ctx) return;
  fade(layers.rain, prefs.rain ? 1 : 0);
  fade(layers.room, prefs.room ? 0.9 : 0);
  if (master) master.gain.setTargetAtTime(prefs.volume, ctx.currentTime, 0.1);
  if (musicEl) {
    musicEl.volume = Math.min(1, prefs.volume * 0.8);
    if (prefs.music && musicEl.paused) void musicEl.play().catch(() => {});
    if (!prefs.music && !musicEl.paused) musicEl.pause();
  } else if (prefs.music && tracks.length) startMusic();
}

function startMusic() {
  musicEl = new Audio();
  musicEl.preload = 'none';
  musicEl.addEventListener('ended', () => { trackIdx = (trackIdx + 1) % tracks.length; musicEl!.src = tracks[trackIdx].src; void musicEl!.play().catch(() => {}); });
  trackIdx = Math.floor(Math.random() * tracks.length);
  musicEl.src = tracks[trackIdx].src;
  apply();
}

export function setPref<K extends keyof SoundPrefs>(k: K, v: SoundPrefs[K]) {
  prefs[k] = v;
  changed();
  unlock();
}

export function chime() {
  if (!ctx || ctx.state !== 'running' || !master) return;
  const t = ctx.currentTime;
  [[659.25, 0.18], [987.77, 0.1], [1318.5, 0.05]].forEach(([f, a], i) => {
    const o = ctx!.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx!.createGain();
    g.gain.setValueAtTime(0, t + i * 0.12);
    g.gain.linearRampToValueAtTime(a, t + i * 0.12 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 2.2);
    o.connect(g).connect(master!);
    o.start(t + i * 0.12); o.stop(t + i * 0.12 + 2.3);
  });
}

let manifest: Promise<Track[]> | null = null;
export function loadManifest(): Promise<Track[]> {
  manifest ??= fetch('/music/manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { tracks: [] }))
    .then((j: { tracks?: Track[] }) => (tracks = Array.isArray(j.tracks) ? j.tracks.filter((t) => t && t.src) : []))
    .catch(() => (tracks = []));
  return manifest;
}

export function currentTrack(): Track | null { return musicEl && tracks.length ? tracks[trackIdx] : null; }

export function stopAll() {
  if (musicEl) { musicEl.pause(); musicEl = null; }
  if (ctx) { void ctx.close(); ctx = null; master = null; delete layers.rain; delete layers.room; }
  clearInterval(crackleTimer);
}
