// Time of day × weather → one set of lighting parameters. The four looks are the
// corners of a 2×2 table (day/night × clear/rain); in-between values come from
// the same numbers, so a change crossfades over ~2.5 s with nothing new loaded.
import * as THREE from 'three';

export type TimeOfDay = 'day' | 'night';
export type Weather = 'clear' | 'rain';

export interface Atmo {
  sun: THREE.Color; sunI: number; sunDir: THREE.Vector3; sunSoft: number;
  fill: THREE.Color; fillI: number;
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemiI: number;
  skyTop: THREE.Color; skyBot: THREE.Color; sunGlow: THREE.Color; sunGlowAmt: number;
  city: THREE.Color; cityHaze: number; cityLights: number; stars: number;
  tree: THREE.Color; treeLit: THREE.Color; glass: THREE.Color;
  rain: number;
  /** Seat lamp pools / glow sprites / shade emission multipliers. */
  lampLight: number; lampGlow: number; lampEmit: number;
  pendant: number;
  spill: THREE.Color; spillI: number;
  beam: number; motes: number;
  bg: THREE.Color;
}

type Raw = { [K in keyof Atmo]: Atmo[K] extends THREE.Color ? string : Atmo[K] extends THREE.Vector3 ? [number, number, number] : number };

const dir = (az: number, el: number): [number, number, number] => {
  // az: angle of the light's travel in the floor plane from +x toward −z; returns the direction toward the light.
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  return [-Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
};

const DAY_CLEAR: Raw = {
  sun: '#ffb764', sunI: 5.2, sunDir: dir(36, 19), sunSoft: 0.022,
  fill: '#ffcf9c', fillI: 0.55,
  hemiSky: '#ffe2b9', hemiGround: '#b5764a', hemiI: 2.35,
  skyTop: '#f3d2a2', skyBot: '#fff0cf', sunGlow: '#fff2cf', sunGlowAmt: 1.2,
  city: '#d8b994', cityHaze: 0.55, cityLights: 0, stars: 0,
  tree: '#5d7a3a', treeLit: '#c9c060', glass: '#fff2d8',
  rain: 0,
  lampLight: 0.55, lampGlow: 0.45, lampEmit: 0.7,
  pendant: 0.45,
  spill: '#ffd9a6', spillI: 2.2,
  beam: 1, motes: 1,
  bg: '#3a2418',
};

const DAY_RAIN: Raw = {
  sun: '#dfe6ef', sunI: 1.6, sunDir: dir(30, 34), sunSoft: 0.12,
  fill: '#c9d2df', fillI: 0.45,
  hemiSky: '#c9d4e2', hemiGround: '#7d5e4d', hemiI: 2.05,
  skyTop: '#9fb0c4', skyBot: '#c4cdd8', sunGlow: '#e9eef4', sunGlowAmt: 0.25,
  city: '#8d98a6', cityHaze: 0.6, cityLights: 0.15, stars: 0,
  tree: '#4a5d48', treeLit: '#73866a', glass: '#dfe7f0',
  rain: 1,
  lampLight: 1.0, lampGlow: 0.75, lampEmit: 0.9,
  pendant: 0.8,
  spill: '#cfdcec', spillI: 1.7,
  beam: 0.12, motes: 0.15,
  bg: '#262a30',
};

const NIGHT_CLEAR: Raw = {
  sun: '#9ab8f0', sunI: 1.15, sunDir: dir(28, 38), sunSoft: 0.03,
  fill: '#8296c4', fillI: 0.28,
  hemiSky: '#5873a6', hemiGround: '#3a2731', hemiI: 1.25,
  skyTop: '#0b1834', skyBot: '#25406e', sunGlow: '#c9d8ff', sunGlowAmt: 0.35,
  city: '#1b2740', cityHaze: 0.35, cityLights: 1, stars: 1,
  tree: '#141d26', treeLit: '#22303a', glass: '#9cb4d8',
  rain: 0,
  lampLight: 1.35, lampGlow: 1, lampEmit: 1,
  pendant: 1,
  spill: '#6d8cc4', spillI: 1.2,
  beam: 0, motes: 0,
  bg: '#0b1322',
};

const NIGHT_RAIN: Raw = {
  sun: '#86a4d6', sunI: 0.55, sunDir: dir(28, 42), sunSoft: 0.1,
  fill: '#6f81a8', fillI: 0.24,
  hemiSky: '#4d6c96', hemiGround: '#3b2830', hemiI: 1.3,
  skyTop: '#2d4566', skyBot: '#55769c', sunGlow: '#9fb4d6', sunGlowAmt: 0.12,
  city: '#2a3a52', cityHaze: 0.5, cityLights: 0.85, stars: 0,
  tree: '#253440', treeLit: '#344654', glass: '#8fa9cc',
  rain: 1,
  lampLight: 1.4, lampGlow: 1, lampEmit: 1,
  pendant: 1,
  spill: '#5f80b4', spillI: 1.25,
  beam: 0, motes: 0,
  bg: '#0b1322',
};

const KEYS = Object.keys(DAY_CLEAR) as (keyof Atmo)[];

function make(): Atmo {
  const o = {} as Record<string, unknown>;
  for (const k of KEYS) {
    const v = DAY_CLEAR[k];
    o[k] = typeof v === 'string' ? new THREE.Color() : Array.isArray(v) ? new THREE.Vector3() : 0;
  }
  return o as unknown as Atmo;
}

const corners = [DAY_CLEAR, DAY_RAIN, NIGHT_CLEAR, NIGHT_RAIN].map((raw) => {
  const a = make();
  for (const k of KEYS) {
    const v = raw[k] as unknown;
    const t = a[k] as unknown;
    if (t instanceof THREE.Color) t.set(v as string);
    else if (t instanceof THREE.Vector3) t.set(...(v as [number, number, number])).normalize();
    else (a as unknown as Record<string, number>)[k] = v as number;
  }
  return a;
});

const _c = new THREE.Color();
const _v = new THREE.Vector3();

const _w = [0, 0, 0, 0];

/** Bilinear blend of the four looks: night 0 = day, rain 0 = clear. Allocation-free. */
export function blendAtmo(out: Atmo, night: number, rain: number) {
  _w[0] = (1 - night) * (1 - rain); _w[1] = (1 - night) * rain; _w[2] = night * (1 - rain); _w[3] = night * rain;
  for (let j = 0; j < KEYS.length; j++) {
    const k = KEYS[j];
    const t = out[k] as unknown;
    if (t instanceof THREE.Color) {
      t.setRGB(0, 0, 0);
      for (let i = 0; i < 4; i++) t.add(_c.copy(corners[i][k] as THREE.Color).multiplyScalar(_w[i]));
    } else if (t instanceof THREE.Vector3) {
      t.set(0, 0, 0);
      for (let i = 0; i < 4; i++) t.add(_v.copy(corners[i][k] as THREE.Vector3).multiplyScalar(_w[i]));
      t.normalize();
    } else {
      let s = 0;
      for (let i = 0; i < 4; i++) s += (corners[i][k] as number) * _w[i];
      (out as unknown as Record<string, number>)[k] = s;
    }
  }
  return out;
}

export function createAtmo(): Atmo { return make(); }
