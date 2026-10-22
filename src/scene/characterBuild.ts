// buildCharacter(spec): procedural clay-toy chibi matching docs/character-sheet.png.
// Every rigid part is baked (vertex colours) into ONE skinned geometry with rigid
// per-bone weights, so a character is one body draw + one outline draw + one face
// decal. Geometry is cached per spec and shared; each instance only owns its bones.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HAIR, OUTFIT, PANTS, SKIN, type CharacterSpec, type Expression, type HairStyle } from '../lib/avatars';
import { HEAD_R, HEAD_S, disposeFaceKit, faceKit } from './faceAtlas';
import { GeoBuilder, cyl, roundedBox, sphere, torus, type V3 } from './toon';

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
const ACC = { glasses: '#523e30', phones: '#4c5448', beanie: '#8a4630', clipA: '#dda063', clipB: '#6f7a70', scarf: '#3c5350', bag: '#646f62', strap: '#7a5236' };
const SHOE = '#efe7da', SOLE = '#d6c9b4', STRING = '#f2ead8';

// ---- materials -------------------------------------------------------------

interface CharMats { toon: THREE.MeshToonMaterial; outline: THREE.ShaderMaterial; gradient: THREE.DataTexture }
let mats: CharMats | null = null;

/** Softer ramp than the room's toon steps: reads as matte clay. */
export function charMaterials(): CharMats {
  if (mats) return mats;
  const steps = [138, 176, 214, 240, 255];
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
const SOFT = 0.045;
const K = HEAD_R / 0.3;
const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 3, 8);

/** Hairline height: front fringe → sides → nape, blended by |azimuth| (0 = face). */
function hairline(az: number, yF: number, yS: number, yB: number, f0 = 0.55, f1 = 1.5) {
  const a = Math.abs(az);
  return mix(mix(yF, yS, ss(f0, f1, a)), yB, ss(1.9, 2.8, a));
}
const roll = (s: number) => 0.035 * (1 - ss(0, 0.16, s)); // rounded lip at the hair edge

const dirOf = (az: number, el: number): V3 => [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];

interface LockOpts {
  /** Radius at root and tip, in unit-head radii (× the shell radius when surf is given). */
  lift?: [number, number];
  /** Follow a hair shell's surface instead of the unit sphere. */
  surf?: (d: V3) => number;
  /** Sideways bow of the path, so locks can sweep in arcs. */
  bend?: number;
  /** Where the width profile starts (0 = rooted at the hairline: full width but flat there). */
  root?: number;
  /** Tip sharpness: lower is blunter. */
  tipPow?: number;
  /** Pulled taut (ponytail, bun): widest at the root, thinning to the tie. */
  pull?: boolean;
}

/**
 * One sculpted hair lock: a tapered, flattened strand that follows the head from a
 * root direction to a tip, its underside buried in the hair cap below.
 * Angles in radians; lift/thick in unit-head radii.
 */
function lockGeo(root: V3, tip: V3, halfW: number, thick: number, hex: string, o: LockOpts = {}): THREE.BufferGeometry {
  const NP = 9, NR = 8;
  const { lift = [0.99, 1.03], surf, bend = 0, root: r0 = 0.2, tipPow = 0.55, pull = false } = o;
  const r = new THREE.Vector3(...root).normalize(), q = new THREE.Vector3(...tip).normalize();
  const om = Math.acos(THREE.MathUtils.clamp(r.dot(q), -1, 1)) || 1e-4;
  const side = r.clone().cross(q).normalize();
  const at = (t: number) => r.clone().multiplyScalar(Math.sin((1 - t) * om)).addScaledVector(q, Math.sin(t * om)).divideScalar(Math.sin(om))
    .addScaledVector(side, bend * Math.sin(Math.PI * t)).normalize();
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const base = new THREE.Color(hex), c = new THREE.Color();
  const S = [HEAD_R * HEAD_S[0], HEAD_R * HEAD_S[1], HEAD_R * HEAD_S[2]];
  for (let i = 0; i <= NP; i++) {
    const t = i / NP;
    const n = at(t), T = at(Math.min(1, t + 0.01)).sub(at(Math.max(0, t - 0.01))).normalize();
    const B = n.clone().cross(T).normalize();
    // Rooted at the hairline: full width from the start, but flat there so it melts into the edge.
    const u = r0 > 0 ? r0 + (1 - r0) * t : 0.3 + 0.7 * t;
    const prof = pull ? 1 - 0.7 * t ** 1.3 : Math.pow(Math.sin(Math.PI * u), u < 0.5 ? 0.55 : tipPow);
    const tp = pull ? 0.6 * Math.sqrt(ss(0, 0.3, t)) * (1 - 0.5 * t) : r0 > 0 ? prof : prof * Math.sqrt(ss(0, 0.35, t));
    const R = (surf ? Math.max(surf([n.x, n.y, n.z]), 1.02) : 1) * mix(lift[0], lift[1], t) + thick * 0.35 * tp;
    for (let j = 0; j < NR; j++) {
      const ph = (j / NR) * Math.PI * 2;
      const p = n.clone().multiplyScalar(R)
        .addScaledVector(B, Math.cos(ph) * halfW * R * prof)
        .addScaledVector(n, Math.sin(ph) * thick * 0.6 * tp);
      pos.push(p.x * S[0], p.y * S[1], p.z * S[2]);
      // Darker along the lock's edges and root so neighbouring locks separate.
      c.copy(base).multiplyScalar(0.72 + 0.3 * Math.max(0, Math.sin(ph)) ** 0.6 + 0.06 * ss(0, 0.5, t)).toArray(col, col.length);
      if (i < NP) { const a = i * NR + j, b = i * NR + ((j + 1) % NR); idx.push(a, b, a + NR, b, b + NR, a + NR); }
    }
  }
  return finishGeo(pos, col, idx);
}

function finishGeo(pos: number[], col: number[], idx: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('outline', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Free-hanging round strand along a smooth head-local path (ponytail, bun coil).
 * rad(t) gives its radius; it is darker on the side facing core(t), so strands
 * bundled around a core read as separate.
 */
function strandGeo(pts: V3[], rad: (t: number) => number, hex: string, core: (t: number) => THREE.Vector3, NP = 16, NR = 8): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const { normals, binormals } = curve.computeFrenetFrames(NP, false);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const base = new THREE.Color(hex), c = new THREE.Color(), d = new THREE.Vector3(), out = new THREE.Vector3();
  for (let i = 0; i <= NP; i++) {
    const t = i / NP, p = curve.getPointAt(t), rr = rad(t);
    out.copy(p).sub(core(t)).normalize();
    for (let j = 0; j < NR; j++) {
      const ph = (j / NR) * Math.PI * 2;
      d.copy(normals[i]).multiplyScalar(Math.cos(ph)).addScaledVector(binormals[i], Math.sin(ph));
      pos.push(p.x + d.x * rr, p.y + d.y * rr, p.z + d.z * rr);
      c.copy(base).multiplyScalar(0.74 + 0.3 * Math.max(0, d.dot(out)) ** 0.6).toArray(col, col.length);
      if (i < NP) { const a = i * NR + j, b = i * NR + ((j + 1) % NR); idx.push(a, b, a + NR, b, b + NR, a + NR); }
    }
  }
  return finishGeo(pos, col, idx);
}

/** A springy curl: a ball with a darker spiral groove wound round its outward face. */
function curlGeo(rad: number, out: THREE.Vector3, hex: string): THREE.BufferGeometry {
  const g = sphere(rad, 12, 8);
  const a = out.clone().normalize(), u = new THREE.Vector3(0, 1, 0).cross(a).normalize(), w = a.clone().cross(u);
  const p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  const base = new THREE.Color(hex), c = new THREE.Color(), col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const h = v.dot(a), spiral = 0.5 + 0.5 * Math.sin(Math.atan2(v.dot(w), v.dot(u)) + 6 * Math.acos(h));
    c.copy(base).multiplyScalar(0.6 + 0.26 * Math.max(0, h) + 0.3 * spiral * ss(-0.2, 0.5, h)).toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('outline', new THREE.BufferAttribute(new Float32Array(p.count).fill(1), 1));
  return g;
}

/** Direction at angular radius rho and angle phi round the point c (not at the pole). */
function aroundDir(c: V3, rho: number, phi: number): V3 {
  const n = new THREE.Vector3(...c).normalize();
  const u = new THREE.Vector3(0, 1, 0).cross(n).normalize(), w = n.clone().cross(u);
  return n.multiplyScalar(Math.cos(rho)).addScaledVector(u.multiplyScalar(Math.cos(phi)).addScaledVector(w, Math.sin(phi)), Math.sin(rho)).toArray() as V3;
}
/** A crown whorl: n short locks spiralling out from c, covering where the other locks' roots meet. */
const whorl = (c: V3, n: number, halfW: number, thick: number, hex: (i: number) => string, o: LockOpts) =>
  Array.from({ length: n }, (_, i) => {
    const phi = (i / n) * PI * 2;
    return lockGeo(aroundDir(c, 0.05, phi), aroundDir(c, 0.46, phi + 2.1), halfW, thick, hex(i + 7), { bend: 0.07, root: 0.12, ...o });
  });

/** [root az, root el, tip az, tip el, half-width, thickness, options] */
type Lock = [number, number, number, number, number, number, LockOpts?];
const PI = Math.PI;
const mirror = (l: Lock[]): Lock[] => l.flatMap((k) => (k[0] === 0 || k[0] === PI) && k[2] === k[0] ? [k] : [k, [-k[0], k[1], -k[2], k[3], k[4], k[5], k[6] && { ...k[6], bend: -(k[6].bend ?? 0) }]]);

// Side swept: a big fringe sweeping from the parting (char's left) over the forehead,
// the top flowing forward from the crown, short locks behind the parting.
const SWEPT_LOCKS: Lock[] = [
  [0.62, 0.8, -0.2, 0.3, 0.24, 0.26, { bend: 0.1 }], [0.66, 1.0, -0.55, 0.22, 0.24, 0.25, { bend: 0.12 }],
  [0.6, 1.2, -0.9, 0.12, 0.24, 0.24, { bend: 0.1 }], [0.4, 1.38, -1.3, 0.02, 0.24, 0.22, { bend: 0.06 }],
  [2.7, 1.2, -1.55, 0.05, 0.25, 0.22, { bend: 0.1 }], [-2.75, 1.15, -1.95, -0.1, 0.23, 0.2],
  [PI - 0.2, 1.42, 0.5, 1.05, 0.27, 0.24, { bend: 0.05 }], [-2.4, 1.32, -0.9, 0.72, 0.26, 0.22],
  [0.95, 1.0, 1.15, 0.28, 0.2, 0.18], [1.35, 0.95, 1.55, 0.24, 0.2, 0.18], [1.85, 1.0, 1.95, 0.08, 0.2, 0.18],
  // back, from the crown down: a long layer flicking out past the nape and a shorter
  // staggered one on top, all curving slightly with the sweep so the hem is jagged
  ...[2.15, 2.6, 3.05, -2.78, -2.32, -1.86].map((a, i): Lock => [a, 1.1 + 0.08 * Math.cos(a - PI), a - 0.12, [-0.3, -0.42, -0.36, -0.44, -0.32, -0.2][i], 0.21, 0.2, { bend: 0.04, lift: [0.97, 1.03] }]),
  ...[2.38, 2.84, -2.98, -2.52, -2.06].map((a, i): Lock => [a, 1.22, a - 0.1, [-0.06, -0.14, -0.1, -0.16, -0.04][i], 0.2, 0.23, { bend: 0.04, lift: [0.98, 1.0] }]),
  [-1.55, 0.9, -1.5, -0.14, 0.21, 0.2],
];

// Bob: a soft fringe swept from a side parting, and broad locks falling from the
// crown to a rounded hem that tucks under at the jaw.
const BOB_LOCKS: Lock[] = [
  [-0.44, 1.16, -0.7, 0.38, 0.22, 0.2, { tipPow: 0.4, lift: [0.97, 1.0] }],
  ...[[-0.24, 0.3], [0.2, 0.25], [0.62, 0.24]].map(([ta, te], i): Lock => [-0.36, 1.22 + 0.05 * i, ta, te, 0.26, 0.22, { bend: -0.05 - 0.03 * i, tipPow: 0.4, lift: [0.97, 1.0] }]),
  ...mirror([1.0, 1.55, 2.1, 2.62].map((a, i): Lock => [a, 1.5, a + 0.03, -0.7 - 0.12 * ss(1.6, 2.6, a), 0.3, 0.17 + 0.03 * (i % 2), { tipPow: 0.3 }])),
  [PI, 1.5, PI, -0.84, 0.3, 0.19, { tipPow: 0.3 }],
];

// Pulled-back styles (ponytail, bun) share a soft fringe swept from a parting on the
// character's right, covering where the pulled-back locks start.
const PULLED_FRINGE: Lock[] = [
  [-0.5, 1.1, -0.86, 0.24, 0.22, 0.2, { bend: 0.04 }], [-0.3, 1.18, -0.36, 0.2, 0.24, 0.22, { bend: -0.06 }],
  [-0.14, 1.22, 0.12, 0.2, 0.24, 0.22, { bend: -0.08 }], [0.02, 1.22, 0.54, 0.23, 0.24, 0.21, { bend: -0.08 }],
  [0.16, 1.16, 0.94, 0.22, 0.22, 0.2, { bend: -0.06 }],
];

// Ponytail: hair pulled back over the top and up from the nape to a tie at the back.
const PONY_TIE = 0.14; // tie elevation at the back of the head
const PONY_LOCKS: Lock[] = [
  ...[-0.42, 0, 0.42].map((a): Lock => [a, 1.0, PI - a * 0.25, PONY_TIE + 0.1, 0.25, 0.2]),
  ...mirror([
    [1.0, 0.72, PI - 0.18, PONY_TIE + 0.06, 0.24, 0.19, {}],
    [1.45, 0.14, PI - 0.16, PONY_TIE + 0.02, 0.22, 0.17, { root: 0 }],
    [1.95, -0.06, PI - 0.14, PONY_TIE - 0.02, 0.22, 0.17, { root: 0 }],
    [2.45, -0.4, PI - 0.1, PONY_TIE - 0.06, 0.22, 0.17, { root: 0 }],
  ]),
  [PI, -0.5, PI, PONY_TIE - 0.08, 0.22, 0.17, { root: 0 }],
];

// Bun: hair pulled up into the bun at the crown.
const BUN_LOCKS: Lock[] = [
  [0, 1.2, PI, 0.96, 0.24, 0.18], [PI, -0.33, PI, 0.96, 0.22, 0.16, { root: 0 }],
  ...mirror([[0.45, 1.12, {}], [0.95, 0.72, {}], [1.4, 0.16, { root: 0 }], [1.85, 0.1, { root: 0 }], [2.3, -0.06, { root: 0 }], [2.75, -0.24, { root: 0 }]]
    .map(([a, e, o]): Lock => [a as number, e as number, PI, 0.96, 0.22, 0.16, o as LockOpts])),
];

// Tousled crop: locks fan out from a crown at the back of the head, down onto the
// forehead, over the ears and down the nape. [root az, root el, tip az, tip el, half-width, thickness, tip lift]
const CROP_LOCKS: [number, number, number, number, number, number, number?][] = [
  // fringe
  [-0.45, 1.05, -0.8, 0.22, 0.22, 0.2], [-0.2, 1.1, -0.38, 0.18, 0.23, 0.22], [0.05, 1.12, 0.06, 0.16, 0.23, 0.23], [0.3, 1.1, 0.47, 0.19, 0.23, 0.22], [0.55, 1.05, 0.84, 0.24, 0.22, 0.2],
  // over the top, from the crown forward
  [Math.PI - 0.5, 1.35, -0.62, 0.66, 0.27, 0.26], [Math.PI, 1.42, 0.0, 0.7, 0.27, 0.28], [Math.PI + 0.5, 1.35, 0.62, 0.66, 0.27, 0.26],
  [-2.0, 1.15, -1.08, 0.52, 0.26, 0.24], [2.0, 1.15, 1.08, 0.52, 0.26, 0.24],
  // sides, over the ears
  [-1.35, 0.95, -1.28, 0.16, 0.21, 0.17], [1.35, 0.95, 1.28, 0.16, 0.21, 0.17], [-1.7, 0.95, -1.68, 0.02, 0.22, 0.19], [1.7, 0.95, 1.68, 0.02, 0.22, 0.19],
  // back, from the crown down: a long outer layer whose tips flick out over the nape,
  // and a shorter staggered layer on top so the hem is jagged rather than a bowl edge
  [-2.05, 0.95, -2.0, -0.28, 0.2, 0.2, 1.05], [2.05, 0.95, 2.0, -0.28, 0.2, 0.2, 1.05],
  [-2.5, 1.05, -2.48, -0.4, 0.2, 0.21, 1.06], [2.5, 1.05, 2.48, -0.4, 0.2, 0.21, 1.06],
  [-2.95, 1.1, -2.98, -0.36, 0.2, 0.21, 1.06], [2.95, 1.1, 2.98, -0.36, 0.2, 0.21, 1.06],
  [-2.28, 1.15, -2.25, -0.04, 0.21, 0.24, 1.05], [2.28, 1.15, 2.25, -0.04, 0.21, 0.24, 1.05],
  [-2.74, 1.2, -2.72, -0.12, 0.21, 0.25, 1.05], [2.74, 1.2, 2.72, -0.12, 0.21, 0.25, 1.05], [Math.PI, 1.2, Math.PI, -0.18, 0.21, 0.25, 1.05],
];

/** Hair shells as [signed distance above hairline, thickness] on the unit head sphere. */
type ShellFn = (x: number, y: number, z: number, az: number) => [number, number];
const HAIR_FN: Record<HairStyle, ShellFn> = {
  crop: (_x, y, _z, az) => {
    const burn = 0.3 * Math.exp(-((Math.abs(az) - 1.3) ** 2) / 0.006);
    const behindEar = 0.4 * ss(1.55, 1.9, Math.abs(az));
    const s = y - hairline(az, 0.3, 0.08 - burn - behindEar, -0.3, 0.75, 1.35);
    return [s, 0.03 + 0.05 * Math.pow(Math.max(0, y), 1.4) + roll(s)];
  },
  swept: (_x, y, _z, az) => {
    const s = y - hairline(az, 0.14 + 0.48 * ss(-0.7, 0.75, az), az < 0 ? -0.2 : 0.18, -0.28);
    const part = 0.035 * Math.exp(-((az - 0.62) ** 2) / 0.006) * ss(0.3, 0.8, y);
    return [s, 0.07 + 0.09 * Math.max(0, y) + roll(s) + 0.07 * ss(0.5, -0.6, az) * ss(-0.1, 0.6, y) - part];
  },
  bob: (_x, y, _z, az) => {
    const s = y - hairline(az, 0.36, -0.74, -0.8, 0.74, 0.88);
    return [s, 0.08 + 0.1 * ss(0.2, -0.4, y) - 0.06 * ss(-0.45, -0.8, y) + roll(s)];
  },
  ponytail: (_x, y, _z, az) => {
    const s = y - hairline(az, 0.26, 0.02, -0.5);
    return [s, 0.07 + 0.045 * Math.max(0, y) + 0.5 * roll(s)];
  },
  bun: (_x, y, _z, az) => {
    const s = y - hairline(az, 0.26, 0.08, -0.42);
    return [s, 0.075 + 0.04 * Math.max(0, y) + 0.5 * roll(s)];
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
/** Teardrop strand along +y, base at the origin. */
const tuft = (len: number, rad: number) =>
  new THREE.LatheGeometry([[0, 0], [rad, 0.2], [rad * 0.85, 0.45], [rad * 0.4, 0.8], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y * len)), 8);
const hairAtFn = (fn: ShellFn, d: V3) => { const n = Math.hypot(...d); return shellR(fn, d[0] / n, d[1] / n, d[2] / n); };
const shellR = (fn: ShellFn, x: number, y: number, z: number) => {
  const [s, t] = fn(x, y, z, Math.atan2(x, z));
  return 0.965 + (t + 0.035) * ss(-SOFT, SOFT, s);
};
/** Head-local point on direction d at unit radius r. */
function hp(d: V3, r: number): V3 {
  const n = Math.hypot(...d);
  return [(d[0] / n) * r * HEAD_R * HEAD_S[0], (d[1] / n) * r * HEAD_R * HEAD_S[1], (d[2] / n) * r * HEAD_R * HEAD_S[2]];
}

/**
 * Closed, smooth shell around the head; uncovered directions tuck inside the skull.
 * Rows are warped per column so a band of rows always straddles the hairline,
 * which keeps diagonal and pointed fringes clean instead of stair-stepped.
 */
function shellGeo(fn: ShellFn, color: (y: number, s: number) => string, ws: number, hs: number, thetaMax: number): THREE.BufferGeometry {
  const band = 6, nTop = Math.round((hs - band) * 0.55), nBot = hs - band - nTop, D = 0.14;
  const pos: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  for (let j = 0; j <= ws; j++) {
    const az = -Math.PI + (j / ws) * Math.PI * 2; // seam at the back
    const sx = Math.sin(az), cz = Math.cos(az);
    const yl = THREE.MathUtils.clamp(-fn(sx, 0, cz, az)[0], Math.cos(thetaMax) + D, 0.95);
    const thl = Math.acos(yl), ta = thl - D, tb = Math.min(thetaMax - 0.02, thl + D);
    for (let i = 0; i <= hs; i++) {
      const th = i <= nTop ? (ta * i) / nTop : i <= nTop + band ? ta + ((tb - ta) * (i - nTop)) / band : tb + ((thetaMax - tb) * (i - nTop - band)) / nBot;
      const st = Math.sin(th), x = st * sx, y = Math.cos(th), z = st * cz;
      const r = shellR(fn, x, y, z) * HEAD_R;
      pos.push(x * r * HEAD_S[0], y * r * HEAD_S[1], z * r * HEAD_S[2]);
      if (j < ws && i < hs) {
        const a0 = j * (hs + 1) + i, b0 = a0 + hs + 1;
        idx.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
      }
    }
  }
  let g: THREE.BufferGeometry = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g = mergeVertices(g); // weld the seam and the pole so normals stay smooth
  g.computeVertexNormals();
  // Colours after welding (vertex order changes).
  const p = g.attributes.position as THREE.BufferAttribute;
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / HEAD_S[0], y = p.getY(i) / HEAD_S[1], z = p.getZ(i) / HEAD_S[2];
    const n = Math.hypot(x, y, z) || 1;
    c.set(color(y / n, fn(x / n, y / n, z / n, Math.atan2(x, z))[0])).toArray(out, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  g.setAttribute('outline', new THREE.BufferAttribute(new Float32Array(p.count).fill(1), 1));
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
  B.hips.add(roundedBox(0.4, 0.2, 0.3, 0.09, 1), pants, { p: [0, 0.17, 0.03] });
  for (const [hip, knee] of [['hipL', 'kneeL'], ['hipR', 'kneeR']] as const) {
    B[hip].add(cap(0.09, 0.15), pants, { p: [0, -0.12, 0] });
    B[knee].add(sphere(0.088, 8, 5), pants);
    B[knee].add(cyl(0.086, 0.094, 0.22, 10), pants, { p: [0, -0.11, 0] });
    // Rolled-up cuff, then a chunky rounded sneaker.
    B[knee].add(cyl(0.104, 0.102, 0.05, 12), shade(pants, 0.9), { p: [0, -0.2, 0] });
    B[knee].add(torus(0.1, 0.012, Math.PI * 2, 4, 12), shade(pants, 1.06), { p: [0, -0.176, 0], r: [Math.PI / 2, 0, 0] }, 0);
    B[knee].add(roundedBox(0.145, 0.095, 0.215, 0.046, 2), SHOE, { p: [0, -0.27, 0.04] });
    B[knee].add(roundedBox(0.152, 0.032, 0.222, 0.014, 1), SOLE, { p: [0, -0.318, 0.04] });
  }

  // Torso.
  const T = B.torso;
  const lathe = new THREE.LatheGeometry(PROF.map(([r, y]) => new THREE.Vector2(r, y)), 16);
  T.add(lathe, top, { s: vest ? [1.07, 1, TORSO_Z * 1.1] : [1, 1, TORSO_Z] });
  T.add(cyl(0.238, 0.232, 0.07, 16), rib, { p: [0, 0.035, 0], s: [1, 1, TORSO_Z] });
  const fz = (y: number) => front(y, vest ? TORSO_Z * 1.1 : TORSO_Z);
  switch (spec.outfit) {
    case 'hoodie':
      T.add(torus(0.125, 0.05, Math.PI * 2, 6, 16), shade(top, 0.94), { p: [0, 0.5, -0.015], r: [Math.PI / 2 + 0.22, 0, 0] });
      T.add(sphere(0.19, 12, 8), shade(top, 0.9), { p: [0, 0.47, -0.12], s: [1.15, 0.84, 0.62] });
      T.add(roundedBox(0.27, 0.12, 0.035, 0.03, 1), shade(top, 0.92), { p: [0, 0.13, fz(0.13) + 0.004], r: [-0.06, 0, 0] });
      // Drawstrings: out from under the collar, lying on the chest, with the aglet on the end.
      for (const x of [-0.042, 0.042]) {
        const pts = [0.45, 0.4, 0.35, 0.31].map((y, i) => new THREE.Vector3(x + 0.004 * i * Math.sign(x), y, fz(y) + 0.011));
        const str = new THREE.CatmullRomCurve3(pts), end = pts[3], dir = str.getTangentAt(1);
        T.add(new THREE.TubeGeometry(str, 8, 0.008, 5), STRING, {}, 0);
        T.add(cap(0.0115, 0.022), STRING, { p: end.clone().addScaledVector(dir, 0.012).toArray(), r: [Math.atan2(-dir.z, -dir.y), 0, 0] }, 0);
      }
      break;
    case 'sweater':
      T.add(torus(0.115, 0.042, Math.PI * 2, 6, 16), rib, { p: [0, 0.5, 0], r: [Math.PI / 2 + 0.12, 0, 0] });
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
      T.add(torus(0.115, 0.036, Math.PI * 2, 6, 16), rib, { p: [0, 0.5, 0], r: [Math.PI / 2 + 0.12, 0, 0] });
      T.add(new THREE.ConeGeometry(0.028, 0.05, 3), shade(top, 0.8), { p: [0, 0.445, fz(0.445) + 0.006], r: [0, 0, Math.PI], s: [1, 1, 0.3] }, 0);
      break;
  }
  if (acc.has('scarf')) {
    T.add(torus(0.135, 0.058, Math.PI * 2, 6, 16), ACC.scarf, { p: [0, 0.5, 0], r: [Math.PI / 2 + 0.12, 0, 0] });
    T.add(roundedBox(0.085, 0.24, 0.035, 0.015, 2), ACC.scarf, { p: [0.07, 0.36, fz(0.36) + 0.045], r: [0.15, 0, 0.12] });
    T.add(roundedBox(0.075, 0.16, 0.03, 0.014, 2), shade(ACC.scarf, 0.9), { p: [-0.03, 0.4, fz(0.4) + 0.05], r: [0.2, 0, -0.18] });
  }

  // Arms.
  for (const [sh, el, hd, sd] of [['shoulderL', 'elbowL', 'handL', -1], ['shoulderR', 'elbowR', 'handR', 1]] as const) {
    B[sh].add(cap(0.062, L1 - 0.08), sleeve, { p: [0, -L1 / 2 + 0.02, 0] });
    B[el].add(cap(0.056, L2 - 0.1), sleeve, { p: [0, -L2 / 2 + 0.03, 0] });
    B[el].add(cyl(0.06, 0.062, 0.05, 8), shade(sleeve, 0.88), { p: [0, -L2 + 0.075, 0] });
    if (spec.outfit === 'track') {
      B[sh].add(roundedBox(0.016, L1 - 0.04, 0.016, 0.006, 1), '#f2efe8', { p: [sd * 0.062, -L1 / 2 + 0.01, 0] }, 0);
      B[el].add(roundedBox(0.016, L2 - 0.1, 0.016, 0.006, 1), '#f2efe8', { p: [sd * 0.056, -L2 / 2 + 0.03, 0] }, 0);
    }
    B[hd].add(sphere(0.058, 10, 7), skin, { p: [0, 0.005, 0], s: [0.9, 1.05, 0.82] });
    B[hd].add(sphere(0.024, 6, 4), skin, { p: [-sd * 0.012, 0.02, 0.042] });
  }

  // Head.
  const H = B.head;
  H.add(sphere(HEAD_R, 22, 16), skin, { s: HEAD_S });
  for (const sd of [-1, 1]) {
    H.add(sphere(0.056 * K, 8, 6), skin, { p: [sd * HEAD_R * HEAD_S[0] * 0.97, -0.045 * K, -0.015], s: [0.45, 1, 0.78] });
    H.add(sphere(0.03 * K, 6, 5), shade(skin, 0.86), { p: [sd * HEAD_R * HEAD_S[0] * 1.0, -0.047 * K, -0.008], s: [0.4, 1, 0.75] }, 0);
  }
  const fn = HAIR_FN[spec.hair];
  const crop = spec.hair === 'crop', curly = spec.hair === 'curly';
  const beanie = acc.has('beanie');
  const hairCol = (y: number, s: number) => {
    const c = new THREE.Color(shade(hair, 0.8)).lerp(new THREE.Color(hair), ss(-0.6, 0.2, y));
    // The cap shows only in the creases between locks and curls; its rolled edge stays lit.
    return '#' + c.multiplyScalar(mix(1, crop || curly ? 0.72 : 0.8, ss(0.03, 0.16, s))).getHexString();
  };
  H.add(shellGeo(fn, hairCol, curly ? 28 : 32, 20, Math.PI * 0.86), null);
  const hairAt = (d: V3) => hairAtFn(fn, d);
  const surf = (d: V3) => hairAt(d);
  const lockHex = (i: number) => shade(hair, 1.04 + 0.07 * Math.sin(i * 2.3));
  const addLocks = (list: Lock[], o: LockOpts) => list.forEach(([ra, re, ta, te, w, th, x], i) =>
    H.add(lockGeo(dirOf(ra, re), dirOf(ta, te), w, th, lockHex(i), { ...o, ...x }), null));
  switch (spec.hair) {
    case 'crop':
      if (!beanie) {
        CROP_LOCKS.forEach(([ra, re, ta, te, w, th, tl = 1.03], i) =>
          H.add(lockGeo(dirOf(ra, re), dirOf(ta, te), w, th, lockHex(i), { lift: [0.99, tl] }), null));
        whorl(dirOf(PI, 1.28), 3, 0.22, 0.2, lockHex, { lift: [1.0, 1.02] }).forEach((g) => H.add(g, null));
        // A few pointed strands standing up at the crown.
        const tufts: [V3, number, number, number, number][] = [[[0.03, 0.84, -0.54], 0.075, 0.04, -1.55, 0.25], [[-0.08, 0.88, -0.47], 0.06, 0.032, -1.3, -0.45]];
        for (const [d, len, rad, rx, rz] of tufts) H.add(tuft(len * K, rad * K), hair, { p: hp(d, hairAt(d) - 0.07), r: [rx, 0, rz] });
      }
      break;
    case 'swept':
      addLocks(SWEPT_LOCKS, { surf, lift: [0.97, 0.99] });
      whorl(dirOf(PI + 0.1, 1.24), 3, 0.22, 0.2, lockHex, { surf, lift: [0.99, 0.99] }).forEach((g) => H.add(g, null));
      break;
    case 'bob':
      addLocks(BOB_LOCKS, { surf, lift: [0.955, 0.96] });
      break;
    case 'bun': {
      if (beanie) break;
      addLocks(BUN_LOCKS, { surf, lift: [0.975, 0.97], pull: true });
      addLocks(PULLED_FRINGE, { surf, lift: [0.99, 1.0] });
      // A coiled bun: two strands wound round a core, from its base up to the top.
      const ax = new THREE.Vector3(0, 0.82, -0.57).normalize();
      const C = new THREE.Vector3(...hp([0, 0.82, -0.57], 1.2)), rb = 0.135 * K;
      const u = new THREE.Vector3(1, 0, 0), w = ax.clone().cross(u);
      H.add(sphere(rb * 0.88, 12, 9), shade(hair, 0.72), { p: C.toArray() });
      for (const ph of [0, PI]) {
        const pts: V3[] = [];
        for (let k = 0; k <= 20; k++) {
          const f = k / 20, th = mix(1.85, 0.12, f), az = ph + f * PI * 2.4;
          pts.push(C.clone().addScaledVector(u, rb * 0.86 * Math.sin(th) * Math.cos(az)).addScaledVector(w, rb * 0.86 * Math.sin(th) * Math.sin(az))
            .addScaledVector(ax, rb * 0.86 * Math.cos(th)).toArray() as V3);
        }
        H.add(strandGeo(pts, (t) => 0.046 * K * Math.pow(Math.sin(PI * (0.03 + 0.94 * t)), 0.35), lockHex(ph ? 3 : 0), () => C, 40), null);
      }
      H.add(torus(0.085, 0.02, PI * 2, 6, 14), shade(hair, 0.62), { p: hp([0, 0.82, -0.57], 1.03), r: [Math.atan2(-0.82, -0.57), 0, 0] }, 0);
      break;
    }
    case 'ponytail': {
      addLocks(PONY_LOCKS, { surf, lift: [0.975, 0.97], pull: true });
      if (!beanie) addLocks(PULLED_FRINGE, { surf, lift: [0.99, 1.0] });
      // The tail: a bundle of strands kicking out from the tie, then hanging and twisting a little.
      const td = dirOf(PI, PONY_TIE), base = new THREE.Vector3(...hp(td, hairAt(td) + 0.02));
      const axisC = new THREE.CatmullRomCurve3([[0, 0, 0], [0.012, 0, -0.08], [0.06, -0.08, -0.16], [0.085, -0.2, -0.15], [0.07, -0.32, -0.1]]
        .map(([x, y, z]) => base.clone().add(new THREE.Vector3(x, y, z))));
      const axis = (t: number) => axisC.getPointAt(t);
      const ex = new THREE.Vector3(1, 0, 0), tg = new THREE.Vector3();
      const strands = [[0, 0.024], ...[0, 1, 2].map((k) => [(k / 3) * PI * 2 + 0.4, 0.034])];
      strands.forEach(([a0, r], i) => {
        const off = i ? 0.044 : 0;
        const pts: V3[] = [0, 0.12, 0.26, 0.42, 0.58, 0.74, 0.88, 1].map((t) => {
          const a = a0 + 1.3 * t, o = off * Math.sin(PI * Math.min(1, 0.14 + t * 1.0));
          axisC.getTangentAt(t, tg);
          const e2 = tg.clone().cross(ex).normalize(), e1 = e2.clone().cross(tg).normalize();
          return axis(t).addScaledVector(e1, Math.cos(a) * o).addScaledVector(e2, Math.sin(a) * o).toArray() as V3;
        });
        H.add(strandGeo(pts, (t) => r * K * Math.pow(Math.sin(PI * (0.08 + 0.92 * t)), 0.55) * (1 - 0.2 * t), lockHex(i + 2), axis, 20), null);
      });
      H.add(torus(0.046, 0.019, PI * 2, 6, 14), shade(hair, 0.62), { p: base.clone().add(new THREE.Vector3(0, -0.004, -0.018)).toArray(), r: [-0.2, 0, 0] }, 0);
      break;
    }
    case 'curly': {
      // Lots of springy curls over a dark cap; under a beanie only the ones below its band.
      const n = 64;
      for (let i = 0; i < n; i++) {
        const y = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(1 - y * y), d: V3 = [rr * Math.sin(i * 2.39996), y, rr * Math.cos(i * 2.39996)];
        const az = Math.atan2(d[0], d[2]);
        if (fn(d[0], d[1], d[2], az)[0] < 0.05 + 0.08 * Math.max(0, d[2])) continue;
        if (beanie && beanieFn(d[0], d[1], d[2], az)[0] > 0.06) continue;
        const rad = (0.082 + 0.012 * Math.sin(i * 1.7)) * K;
        H.add(curlGeo(rad, new THREE.Vector3(...d), lockHex(i)), null, { p: hp(d, hairAt(d) - 0.05) });
      }
      // One more on the front of the hairline, where the spiral leaves a gap over the face.
      const df = dirOf(-0.08, 0.52);
      if (!beanie) H.add(curlGeo(0.09 * K, new THREE.Vector3(...df), lockHex(3)), null, { p: hp(df, hairAt(df) - 0.04) });
      break;
    }
  }
  if (beanie) {
    H.add(shellGeo(beanieFn, (_y, s) => (s < 0.17 ? shade(ACC.beanie, 0.88) : ACC.beanie), 30, 14, Math.PI * 0.7), null);
  }
  if (acc.has('clips') && !beanie) {
    [[[0.42, 0.62, 0.66], ACC.clipA, -0.55], [[0.58, 0.5, 0.64], ACC.clipB, -0.75]].forEach(([d, c, rz]) => {
      H.add(roundedBox(0.085, 0.022, 0.024, 0.01, 1), c as string, { p: hp(d as V3, hairAt(d as V3) + 0.14), r: [-0.45, 0.55, rz as number] }, 0);
    });
  }
  if (acc.has('glasses')) {
    for (const sd of [-1, 1]) {
      H.add(torus(0.058 * K, 0.008, Math.PI * 2, 4, 16), ACC.glasses, { p: [sd * 0.098 * K, -0.058 * K, 0.298 * K], r: [0, sd * 0.3, 0] }, 0);
      H.add(roundedBox(0.012, 0.012, 0.27 * K, 0.005, 1), ACC.glasses, { p: [sd * 0.228 * K, -0.05 * K, 0.15 * K], r: [0, -sd * 0.57, 0] }, 0);
    }
    H.add(cyl(0.007, 0.007, 0.04 * K, 5), ACC.glasses, { p: [0, -0.046 * K, 0.31 * K], r: [0, 0, Math.PI / 2] }, 0);
  }
  if (acc.has('headphones')) {
    const lk = curly || beanie ? 0 : 0.04; // clear the locks lying on the shell
    const side = hairAt([1, -0.1, 0]) * HEAD_R * HEAD_S[0] + 0.03 + lk * 0.6;
    const topY = Math.max(hairAt([0, 1, 0]), curly ? 1.3 : 0) * HEAD_R * HEAD_S[1] + 0.03 + lk;
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
    G.add(roundedBox(0.31, 0.13, 0.15, 0.05, 1), shade(ACC.bag, 0.86), { p: [0, 0.11, -0.008] });
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
