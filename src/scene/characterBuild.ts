// buildCharacter(spec): procedural clay-toy chibi matching docs/character-sheet.png.
// Every rigid part is baked (vertex colours) into ONE skinned geometry with rigid
// per-bone weights, so a character is one body draw + one outline draw + one face
// decal. Geometry is cached per spec and shared; each instance only owns its bones.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HAIR, OUTFIT, PANTS, SKIN, type CharacterSpec, type Expression, type HairStyle } from '../lib/avatars';
import { HEAD_R, HEAD_S, disposeFaceKit, faceKit } from './faceAtlas';
import { GeoBuilder, capsule, cyl, roundedBox, sphere, torus, type V3 } from './toon';

export const L1 = 0.25, L2 = 0.25;
export const TORSO_Y = 0.2;
export const HEAD_Y = 0.75;
export const SHOULDER: V3 = [0.19, 0.42, 0];
const HIP: V3 = [0.1, 0.17, 0.03];
const THIGH = 0.24;
/** Root height that puts the soles on the floor when standing. */
export const STAND_ROOT_Y = THIGH + 0.333 - HIP[1];

export const BONES = ['hips', 'torso', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR', 'hipL', 'kneeL', 'hipR', 'kneeR', 'bag'] as const;
export type BoneName = (typeof BONES)[number];
const PARENT: Record<BoneName, BoneName | null> = {
  hips: null, torso: 'hips', head: 'torso',
  shoulderL: 'torso', elbowL: 'shoulderL', handL: 'elbowL',
  shoulderR: 'torso', elbowR: 'shoulderR', handR: 'elbowR',
  hipL: 'hips', kneeL: 'hipL', hipR: 'hips', kneeR: 'hipR', bag: 'hips',
};
const BAG_STAND: V3 = [0, 0.44, -0.22];
const BAG_SEAT: V3 = [0, 0.25, -0.31]; // hung on the back of the wooden chair
const REST: Record<BoneName, V3> = {
  hips: [0, 0, 0], torso: [0, TORSO_Y, 0.03], head: [0, HEAD_Y, 0],
  shoulderL: [-SHOULDER[0], SHOULDER[1], SHOULDER[2]], elbowL: [0, -L1, 0], handL: [0, -L2, 0],
  shoulderR: [...SHOULDER], elbowR: [0, -L1, 0], handR: [0, -L2, 0],
  hipL: [-HIP[0], HIP[1], HIP[2]], kneeL: [0, -THIGH, 0], hipR: [...HIP], kneeR: [0, -THIGH, 0],
  bag: BAG_STAND,
};

// Fixed accessory colours sampled from the sheet.
const ACC = { glasses: '#523e30', phones: '#4c5448', beanie: '#ab5537', clipA: '#dda063', clipB: '#6f7a70', scarf: '#3c5350', bag: '#646f62', strap: '#7a5236' };
const SHOE = '#efe7da', SOLE = '#d6c9b4', STRING = '#f2ead8';

// ---- materials -------------------------------------------------------------

interface CharMats { toon: THREE.MeshToonMaterial; outline: THREE.ShaderMaterial; gradient: THREE.DataTexture }
let mats: CharMats | null = null;

/** Softer ramp than the room's toon steps: reads as matte clay. */
export function charMaterials(): CharMats {
  if (mats) return mats;
  const steps = [104, 150, 200, 236, 252];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const gradient = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradient.magFilter = gradient.minFilter = THREE.LinearFilter;
  gradient.needsUpdate = true;
  const toon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  // Outline tinted by each vertex's own colour (darker shade), skinned like the body.
  const outline = new THREE.ShaderMaterial({
    uniforms: { thickness: { value: 0.0085 } },
    vertexColors: true,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <color_pars_vertex>
      #include <skinning_pars_vertex>
      attribute float outline;
      uniform float thickness;
      varying vec3 vTint;
      void main() {
        if (outline < 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        #include <color_vertex>
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed + normalize(objectNormal) * thickness, 1.0);
        vTint = vColor * 0.42;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vTint;
      void main() {
        gl_FragColor = vec4(vTint, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  mats = { toon, outline, gradient };
  return mats;
}

// ---- small math ------------------------------------------------------------

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ss = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const shade = (hex: string, k: number) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const SOFT = 0.04;

/** Hairline height: front fringe → sides → nape, blended by |azimuth| (0 = face). */
function hairline(az: number, yF: number, yS: number, yB: number, f0 = 0.55, f1 = 1.5) {
  const a = Math.abs(az);
  return mix(mix(yF, yS, ss(f0, f1, a)), yB, ss(1.9, 2.8, a));
}
const roll = (s: number) => 0.035 * (1 - ss(0, 0.16, s)); // rounded lip at the hair edge

/** Hair shells as [signed distance above hairline, thickness] on the unit head sphere. */
type ShellFn = (x: number, y: number, z: number, az: number) => [number, number];
const HAIR_FN: Record<HairStyle, ShellFn> = {
  crop: (_x, y, _z, az) => {
    const s = y - hairline(az, 0.42 - 0.08 * Math.pow(Math.abs(Math.cos(az * 5.2)), 4), 0.2, -0.32);
    return [s, 0.075 + 0.05 * Math.max(0, y) + roll(s)];
  },
  swept: (_x, y, _z, az) => {
    const s = y - hairline(az, 0.22 + 0.34 * ss(-0.65, 0.7, az), az < 0 ? -0.18 : 0.18, -0.36);
    return [s, 0.085 + 0.06 * Math.max(0, y) + roll(s) + 0.03 * ss(0.4, -0.6, az) * ss(-0.1, 0.5, y)];
  },
  bob: (_x, y, _z, az) => {
    const s = y - hairline(az, 0.3 - 0.03 * Math.cos(az * 3), -0.74, -0.8, 0.74, 0.88);
    return [s, 0.085 + 0.16 * ss(0.15, -0.7, y) + roll(s)];
  },
  ponytail: (_x, y, _z, az) => {
    const s = y - hairline(az, 0.3 + 0.1 * Math.exp((-az * az) / 0.03), 0.02, -0.5);
    return [s, 0.07 + 0.045 * Math.max(0, y) + roll(s)];
  },
  bun: (_x, y, _z, az) => {
    const s = y - hairline(az, 0.36 + 0.06 * Math.exp((-az * az) / 0.03), 0.08, -0.42);
    return [s, 0.075 + 0.04 * Math.max(0, y) + roll(s)];
  },
  curly: (_x, y, _z, az) => {
    const s = y - hairline(az, 0.4 - 0.07 * Math.pow(Math.abs(Math.cos(az * 4.5)), 2), 0.05, -0.45);
    return [s, 0.12 + 0.03 * Math.max(0, y) + roll(s)];
  },
};
const beanieFn: ShellFn = (_x, y, _z, az) => {
  const s = y - hairline(az, 0.3, 0.12, -0.12);
  return [s, 0.2 + 0.05 * Math.max(0, y) + (s < 0.17 ? 0.035 : 0) + 0.006 * Math.cos(az * 28)];
};
const shellR = (fn: ShellFn, x: number, y: number, z: number) => {
  const [s, t] = fn(x, y, z, Math.atan2(x, z));
  return 0.965 + (t + 0.035) * ss(-SOFT, SOFT, s);
};
/** Head-local point on direction d at unit radius r. */
function hp(d: V3, r: number): V3 {
  const n = Math.hypot(...d);
  return [(d[0] / n) * r * HEAD_R * HEAD_S[0], (d[1] / n) * r * HEAD_R * HEAD_S[1], (d[2] / n) * r * HEAD_R * HEAD_S[2]];
}

/** Closed, smooth shell around the head; uncovered directions tuck inside the skull. */
function shellGeo(fn: ShellFn, color: (y: number, s: number) => string, ws: number, hs: number, thetaLen: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, ws, hs, Math.PI * 1.5, Math.PI * 2, 0, thetaLen);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g); // weld the seam so normals stay smooth at the back
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [s] = fn(x, y, z, Math.atan2(x, z));
    const r = shellR(fn, x, y, z) * HEAD_R;
    pos.setXYZ(i, x * r * HEAD_S[0], y * r * HEAD_S[1], z * r * HEAD_S[2]);
    c.set(color(y, s)).toArray(col, i * 3);
  }
  g.computeVertexNormals();
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('outline', new THREE.BufferAttribute(new Float32Array(pos.count).fill(1), 1));
  return g;
}

/** Torso radius at height y (lathe profile, before the z squash). */
const PROF: [number, number][] = [[0.0, 0], [0.205, 0], [0.232, 0.05], [0.236, 0.16], [0.218, 0.3], [0.185, 0.4], [0.13, 0.48], [0.06, 0.515], [0.0, 0.52]];
const TORSO_Z = 0.8;
function torsoR(y: number) {
  for (let i = 2; i < PROF.length; i++) {
    const [r0, y0] = PROF[i - 1], [r1, y1] = PROF[i];
    if (y <= y1) return mix(r0, r1, clamp01((y - y0) / (y1 - y0)));
  }
  return 0;
}
const front = (y: number, k = TORSO_Z) => torsoR(y) * k;

// ---- geometry --------------------------------------------------------------

const cache = new Map<string, THREE.BufferGeometry>();
let itemGeo: { pen: THREE.BufferGeometry; phone: THREE.BufferGeometry } | null = null;

function specKey(s: CharacterSpec, standing: boolean) {
  return [s.hair, s.hairColor, s.skin, s.outfit, s.outfitColor, s.pants, [...s.accessories].sort().join('+'), standing ? 's' : 'c'].join('|');
}

function bodyGeometry(spec: CharacterSpec, standing: boolean): THREE.BufferGeometry {
  const key = specKey(spec, standing);
  const hit = cache.get(key);
  if (hit) return hit;
  const B = Object.fromEntries(BONES.map((n) => [n, new GeoBuilder()])) as Record<BoneName, GeoBuilder>;
  const skin = SKIN[spec.skin], hair = HAIR[spec.hairColor], top = OUTFIT[spec.outfitColor], pants = PANTS[spec.pants];
  const acc = new Set(spec.accessories);
  const vest = spec.outfit === 'vest';
  const tee = spec.outfitColor === 0 ? '#f6f1e8' : '#ebd4b9';
  const sleeve = vest ? '#d8d0c3' : top;
  const rib = shade(top, 0.86);

  // Hips + legs.
  B.hips.add(roundedBox(0.4, 0.2, 0.3, 0.09, 2), pants, { p: [0, 0.17, 0.03] });
  for (const [hip, knee] of [['hipL', 'kneeL'], ['hipR', 'kneeR']] as const) {
    B[hip].add(capsule(0.09, 0.15), pants, { p: [0, -0.12, 0] });
    B[knee].add(sphere(0.088, 10, 6), pants);
    B[knee].add(cyl(0.086, 0.094, 0.22, 12), pants, { p: [0, -0.11, 0] });
    B[knee].add(cyl(0.097, 0.097, 0.03, 12), shade(pants, 0.88), { p: [0, -0.215, 0] });
    B[knee].add(roundedBox(0.135, 0.085, 0.2, 0.04, 2), SHOE, { p: [0, -0.272, 0.035] });
    B[knee].add(roundedBox(0.14, 0.03, 0.205, 0.012, 1), SOLE, { p: [0, -0.318, 0.035] });
  }

  // Torso.
  const T = B.torso;
  const lathe = new THREE.LatheGeometry(PROF.map(([r, y]) => new THREE.Vector2(r, y)), 18);
  T.add(lathe, top, { s: vest ? [1.07, 1, TORSO_Z * 1.1] : [1, 1, TORSO_Z] });
  T.add(cyl(0.238, 0.232, 0.07, 18), rib, { p: [0, 0.035, 0], s: [1, 1, TORSO_Z] });
  const fz = (y: number) => front(y, vest ? TORSO_Z * 1.1 : TORSO_Z);
  switch (spec.outfit) {
    case 'hoodie':
      T.add(torus(0.125, 0.05, Math.PI * 2, 8, 18), shade(top, 0.94), { p: [0, 0.5, -0.015], r: [Math.PI / 2 + 0.22, 0, 0] });
      T.add(sphere(0.19, 14, 10), shade(top, 0.9), { p: [0, 0.47, -0.12], s: [1.15, 0.84, 0.62] });
      T.add(roundedBox(0.27, 0.12, 0.035, 0.03, 2), shade(top, 0.92), { p: [0, 0.13, fz(0.13) + 0.004], r: [-0.06, 0, 0] });
      for (const x of [-0.042, 0.042]) {
        T.add(cyl(0.008, 0.008, 0.13, 5), STRING, { p: [x, 0.39, fz(0.39) + 0.014], r: [0.28, 0, 0] }, 0);
        T.add(sphere(0.012, 6, 4), STRING, { p: [x, 0.325, fz(0.33) + 0.03] }, 0);
      }
      break;
    case 'sweater':
      T.add(torus(0.115, 0.042, Math.PI * 2, 8, 18), rib, { p: [0, 0.5, 0], r: [Math.PI / 2 + 0.12, 0, 0] });
      for (const x of [-0.075, 0.075]) T.add(roundedBox(0.05, 0.34, 0.03, 0.014, 1), shade(top, 0.93), { p: [x, 0.27, fz(0.27) - 0.006] }, 0);
      break;
    case 'cardigan':
      T.add(roundedBox(0.13, 0.42, 0.04, 0.02, 2), tee, { p: [0, 0.28, fz(0.28) - 0.01] });
      T.add(torus(0.108, 0.03, Math.PI * 2, 6, 16), tee, { p: [0, 0.5, 0], r: [Math.PI / 2 + 0.12, 0, 0] });
      for (const x of [-0.072, 0.072]) T.add(roundedBox(0.032, 0.46, 0.036, 0.014, 1), rib, { p: [x, 0.26, fz(0.26) - 0.002], r: [0.06, 0, 0] });
      for (const y of [0.11, 0.21, 0.31]) T.add(sphere(0.014, 6, 4), '#eadcc4', { p: [0.072, y, fz(y) + 0.018] }, 0);
      for (const sd of [-1, 1]) T.add(roundedBox(0.09, 0.07, 0.025, 0.012, 1), rib, { p: [sd * 0.13, 0.12, fz(0.12) - 0.018], r: [0, sd * 0.5, 0] });
      break;
    case 'track':
    case 'vest':
      T.add(roundedBox(0.018, 0.48, 0.02, 0.006, 1), '#d9d6cf', { p: [0, 0.26, fz(0.26) + 0.004] }, 0);
      T.add(cyl(0.12, 0.145, 0.09, 16), shade(top, 0.9), { p: [0, 0.51, 0] });
      if (vest) for (const y of [0.13, 0.25, 0.37]) {
        T.add(torus(torsoR(y) * 1.075, 0.011, Math.PI * 2, 4, 24), shade(top, 0.8), { p: [0, y, 0], r: [Math.PI / 2, 0, 0], s: [1, TORSO_Z * 1.1 / 1.075 * 1.03, 1] }, 0);
      }
      break;
    case 'sweatshirt':
      T.add(torus(0.115, 0.036, Math.PI * 2, 8, 18), rib, { p: [0, 0.5, 0], r: [Math.PI / 2 + 0.12, 0, 0] });
      T.add(new THREE.ConeGeometry(0.028, 0.05, 3), shade(top, 0.8), { p: [0, 0.445, fz(0.445) + 0.006], r: [0, 0, Math.PI], s: [1, 1, 0.3] }, 0);
      break;
  }
  if (acc.has('scarf')) {
    T.add(torus(0.135, 0.058, Math.PI * 2, 8, 18), ACC.scarf, { p: [0, 0.5, 0], r: [Math.PI / 2 + 0.12, 0, 0] });
    T.add(roundedBox(0.085, 0.24, 0.035, 0.015, 2), ACC.scarf, { p: [0.07, 0.36, fz(0.36) + 0.045], r: [0.15, 0, 0.12] });
    T.add(roundedBox(0.075, 0.16, 0.03, 0.014, 2), shade(ACC.scarf, 0.9), { p: [-0.03, 0.4, fz(0.4) + 0.05], r: [0.2, 0, -0.18] });
  }

  // Arms.
  for (const [sh, el, hd, sd] of [['shoulderL', 'elbowL', 'handL', -1], ['shoulderR', 'elbowR', 'handR', 1]] as const) {
    B[sh].add(capsule(0.062, L1 - 0.08), sleeve, { p: [0, -L1 / 2 + 0.02, 0] });
    B[el].add(capsule(0.056, L2 - 0.1), sleeve, { p: [0, -L2 / 2 + 0.03, 0] });
    B[el].add(cyl(0.06, 0.062, 0.05, 10), shade(sleeve, 0.88), { p: [0, -L2 + 0.075, 0] });
    if (spec.outfit === 'track') {
      B[sh].add(roundedBox(0.016, L1 - 0.04, 0.016, 0.006, 1), '#f2efe8', { p: [sd * 0.062, -L1 / 2 + 0.01, 0] }, 0);
      B[el].add(roundedBox(0.016, L2 - 0.1, 0.016, 0.006, 1), '#f2efe8', { p: [sd * 0.056, -L2 / 2 + 0.03, 0] }, 0);
    }
    B[hd].add(sphere(0.058, 10, 7), skin, { p: [0, 0.005, 0], s: [0.9, 1.05, 0.82] });
    B[hd].add(sphere(0.024, 6, 4), skin, { p: [-sd * 0.012, 0.02, 0.042] });
  }

  // Head.
  const H = B.head;
  H.add(sphere(HEAD_R, 24, 16), skin, { s: HEAD_S });
  for (const sd of [-1, 1]) H.add(sphere(0.05, 8, 6), skin, { p: [sd * 0.315, -0.04, 0], s: [0.55, 0.95, 0.85] });
  const fn = HAIR_FN[spec.hair];
  const hairCol = (y: number) => '#' + new THREE.Color(shade(hair, 0.8)).lerp(new THREE.Color(hair), ss(-0.6, 0.2, y)).getHexString();
  const curly = spec.hair === 'curly';
  H.add(shellGeo(fn, hairCol, curly ? 28 : 34, curly ? 18 : 22, Math.PI * 0.82), null);
  const beanie = acc.has('beanie');
  const blob = (d: V3, r: number, rad: number, s: V3 = [1, 1, 1]) => H.add(sphere(rad, 12, 8), hair, { p: hp(d, r), s });
  switch (spec.hair) {
    case 'crop':
      if (!beanie) H.add(sphere(0.06, 10, 7), hair, { p: hp([0, 0.92, -0.38], 1.1), r: [-0.7, 0, 0.2], s: [0.8, 1.5, 0.7] });
      break;
    case 'bun':
      if (!beanie) {
        blob([0, 0.82, -0.57], 1.18, 0.13, [1, 0.92, 1]);
        H.add(torus(0.08, 0.022, Math.PI * 2, 6, 14), shade(hair, 0.7), { p: hp([0, 0.82, -0.57], 1.04), r: [Math.atan2(-0.82, -0.57), 0, 0] }, 0);
      }
      break;
    case 'ponytail': {
      const base = hp([0, -0.3, -0.95], 1.04);
      const prof = [[0, 0], [0.06, -0.03], [0.085, -0.1], [0.08, -0.18], [0.055, -0.26], [0.02, -0.32], [0, -0.33]].map(([x, y]) => new THREE.Vector2(x, y));
      H.add(new THREE.LatheGeometry(prof, 12), hair, { p: [0, base[1], base[2] - 0.02], r: [0.38, 0, 0] });
      H.add(torus(0.05, 0.02, Math.PI * 2, 6, 14), shade(hair, 0.65), { p: [0, base[1] - 0.005, base[2] - 0.02], r: [Math.PI / 2 + 0.38, 0, 0] }, 0);
      break;
    }
    case 'curly': {
      const puffs: [V3, number][] = beanie
        ? [[[-0.85, -0.1, -0.35], 0.13], [[0.85, -0.1, -0.35], 0.13], [[0, -0.15, -0.95], 0.14], [[-0.55, -0.25, -0.75], 0.12], [[0.55, -0.25, -0.75], 0.12]]
        : [[[-0.5, 0.78, 0.38], 0.14], [[0.5, 0.78, 0.38], 0.14], [[0, 0.75, -0.66], 0.16], [[-0.88, 0.32, -0.35], 0.145], [[0.88, 0.32, -0.35], 0.145]];
      for (const [d, rad] of puffs) blob(d, 1.08, rad);
      break;
    }
  }
  const hairAt = (d: V3) => { const n = Math.hypot(...d); return shellR(fn, d[0] / n, d[1] / n, d[2] / n); };
  if (beanie) {
    H.add(shellGeo(beanieFn, (_y, s) => (s < 0.17 ? shade(ACC.beanie, 0.88) : ACC.beanie), 30, 12, Math.PI * 0.62), null);
  }
  if (acc.has('clips') && !beanie) {
    [[[0.42, 0.62, 0.66], ACC.clipA, -0.55], [[0.58, 0.5, 0.64], ACC.clipB, -0.75]].forEach(([d, c, rz]) => {
      H.add(roundedBox(0.085, 0.022, 0.024, 0.01, 1), c as string, { p: hp(d as V3, hairAt(d as V3) + 0.02), r: [-0.45, 0.55, rz as number] }, 0);
    });
  }
  if (acc.has('glasses')) {
    for (const sd of [-1, 1]) {
      H.add(torus(0.052, 0.008, Math.PI * 2, 5, 16), ACC.glasses, { p: [sd * 0.1, -0.045, 0.298], r: [0, sd * 0.3, 0] }, 0);
      H.add(roundedBox(0.012, 0.012, 0.27, 0.005, 1), ACC.glasses, { p: [sd * 0.228, -0.04, 0.15], r: [0, -sd * 0.57, 0] }, 0);
    }
    H.add(cyl(0.007, 0.007, 0.05, 5), ACC.glasses, { p: [0, -0.036, 0.31], r: [0, 0, Math.PI / 2] }, 0);
  }
  if (acc.has('headphones')) {
    const side = hairAt([1, -0.1, 0]) * HEAD_R * HEAD_S[0] + 0.03;
    const topY = Math.max(hairAt([0, 1, 0]), curly ? 1.3 : 0) * HEAD_R * HEAD_S[1] + 0.03;
    H.add(torus(side, 0.026, Math.PI, 6, 18), ACC.phones, { p: [0, -0.02, -0.01], s: [1, (topY + 0.02) / side, 1] });
    for (const sd of [-1, 1]) {
      H.add(cyl(0.088, 0.088, 0.07, 14), ACC.phones, { p: [sd * (side + 0.005), -0.035, -0.01], r: [0, 0, Math.PI / 2] });
      H.add(cyl(0.07, 0.07, 0.03, 12), shade(ACC.phones, 0.7), { p: [sd * (side - 0.04), -0.035, -0.01], r: [0, 0, Math.PI / 2] }, 0);
    }
  }

  // Backpack: worn when standing, hung on the chair back when seated.
  if (acc.has('backpack')) {
    const G = B.bag;
    G.add(roundedBox(0.3, 0.34, 0.14, 0.06, 2), ACC.bag);
    G.add(roundedBox(0.31, 0.13, 0.15, 0.05, 2), shade(ACC.bag, 0.86), { p: [0, 0.11, -0.008] });
    G.add(roundedBox(0.2, 0.12, 0.05, 0.03, 1), shade(ACC.bag, 0.93), { p: [0, -0.07, -0.08] });
    G.add(roundedBox(0.032, 0.08, 0.012, 0.005, 1), ACC.strap, { p: [0, 0.05, -0.088] }, 0);
    G.add(torus(0.045, 0.012, Math.PI, 4, 10), ACC.strap, { p: [0, 0.17, 0] });
    if (standing) {
      for (const sd of [-1, 1]) T.add(torus(0.16, 0.018, Math.PI * 0.95, 4, 14), ACC.strap, { p: [sd * 0.12, 0.33, -0.01], r: [0, Math.PI / 2, 0] });
    } else {
      for (const sd of [-1, 1]) G.add(torus(0.075, 0.016, Math.PI, 4, 10), ACC.strap, { p: [sd * 0.09, 0.16, 0.07], r: [0, Math.PI / 2, 0] });
    }
  }

  // Bake: each bone's parts move to bind (model) space with a rigid weight.
  const offset = bindOffsets();
  const parts: THREE.BufferGeometry[] = [];
  BONES.forEach((name, i) => {
    if (B[name].empty) return;
    const g = B[name].build();
    g.translate(...offset[name]);
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, k) => (k % 4 === 0 ? i : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4));
    parts.push(g);
  });
  const geo = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());
  geo.computeBoundingSphere();
  cache.set(key, geo);
  return geo;
}

function bindOffsets(): Record<BoneName, V3> {
  const out = {} as Record<BoneName, V3>;
  for (const n of BONES) {
    const p = PARENT[n] ? out[PARENT[n]!] : [0, 0, 0];
    out[n] = [p[0] + REST[n][0], p[1] + REST[n][1], p[2] + REST[n][2]];
  }
  return out;
}

export function heldItems() {
  if (itemGeo) return itemGeo;
  const pen = new GeoBuilder().add(cyl(0.011, 0.011, 0.16, 6), '#f2b45a', { p: [0, 0, 0.04], r: [Math.PI / 2 - 0.5, 0, 0] }, 0).build();
  const phone = new GeoBuilder()
    .add(roundedBox(0.09, 0.16, 0.016, 0.012, 2), '#2a2f45', {})
    .add(roundedBox(0.078, 0.14, 0.004, 0.008, 1), '#7fd1e0', { p: [0, 0, 0.009] }, 0)
    .build();
  itemGeo = { pen, phone };
  return itemGeo;
}

// ---- instance --------------------------------------------------------------

export interface CharacterRig {
  root: THREE.Group;
  bones: Record<BoneName, THREE.Bone>;
  body: THREE.SkinnedMesh;
  face: THREE.Mesh;
  setExpression(e: Expression): void;
  dispose(): void;
}

const IDENTITY = new THREE.Matrix4();

export function buildCharacter(spec: CharacterSpec, opts: { standing?: boolean } = {}): CharacterRig {
  const standing = !!opts.standing;
  const m = charMaterials();
  const geo = bodyGeometry(spec, standing);
  const root = new THREE.Group();
  const bones = {} as Record<BoneName, THREE.Bone>;
  const offset = bindOffsets();
  for (const n of BONES) {
    const b = new THREE.Bone();
    b.name = n;
    b.position.set(...REST[n]);
    bones[n] = b;
    (PARENT[n] ? bones[PARENT[n]!] : root).add(b);
  }
  const inverses = BONES.map((n) => new THREE.Matrix4().makeTranslation(-offset[n][0], -offset[n][1], -offset[n][2]));
  const skeleton = new THREE.Skeleton(BONES.map((n) => bones[n]), inverses);
  const body = new THREE.SkinnedMesh(geo, m.toon);
  const outline = new THREE.SkinnedMesh(geo, m.outline);
  for (const mesh of [body, outline]) {
    mesh.bind(skeleton, IDENTITY);
    mesh.frustumCulled = false;
    root.add(mesh);
  }
  body.castShadow = true;
  const kit = faceKit(m.gradient);
  let expr: Expression = spec.expression;
  const face = new THREE.Mesh(kit.geo, kit.mats[expr]);
  bones.head.add(face);
  if (!standing) {
    bones.hipL.rotation.x = bones.hipR.rotation.x = -Math.PI / 2;
    bones.kneeL.rotation.x = bones.kneeR.rotation.x = Math.PI / 2;
    bones.bag.position.set(...BAG_SEAT);
  }
  return {
    root, bones, body, face,
    setExpression(e) { if (e !== expr) { expr = e; face.material = kit.mats[e]; } },
    dispose() { skeleton.dispose(); },
  };
}

export function disposeCharacterCache() {
  cache.forEach((g) => g.dispose());
  cache.clear();
  if (itemGeo) { itemGeo.pen.dispose(); itemGeo.phone.dispose(); itemGeo = null; }
  disposeFaceKit();
  if (mats) { mats.toon.dispose(); mats.outline.dispose(); mats.gradient.dispose(); mats = null; }
}
