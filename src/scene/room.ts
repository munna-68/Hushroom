// The study hall (layout from the golden-hour / rainy-night references): a corner
// room with a big window, window counter and stools, three bays of bookshelves, a
// teal door wall, the long table on a teal rug, a lounge with a sofa, and a
// balustrade over the stairwell. Static pieces merge into two meshes (shell and
// furniture); books, chairs and mugs are instanced; seat kits are per seat.
import * as THREE from 'three';
import { EnvBuilder } from './envGeo';
import { envMaterial, lightRig, N_LAMPS, PENDANT_LAMP, WINDOW_LAMP, stUniforms } from './envMaterial';
import { buildWindowView, type WindowView } from './windowView';
import { backpackGeo, buildKit, buildLamp, chairGeo, mugGeo, type LampInfo } from './props';
import { cyl, materials, rng, roundedBox, sphere, torus, type V3 } from './toon';
import type { FocusAct, PageHook } from './character';
import type { Atmo } from './atmosphere';
import type { TierSettings } from './quality';
import {
  CHAIR_IN, COFFEE, COUNTER, DOOR, FLOOR_X1, FLOOR_Z1, KITS, LAMP_AT, LAMP_FADE, LAMP_TINT, MAX_SLOTS, PENDANT, SHELF,
  SOFA, STOOLS, TABLE, TABLE_TOP, WALL_H, WALL_X, WALL_Z, WELL, WINDOW, seatPose,
} from './hall';

const OAK = '#c07a40';
const OAK_DARK = '#8a522c';
const OAK_DEEP = '#5e3a24';
const TEAL_WALL = '#3a6664';
const TEAL_PANEL = '#2c6462';
const CREAM_WALL = '#e9d4ad';
const TERRA = '#bf6342';

export interface Seat {
  slot: number;
  anchor: THREE.Group;
  kit: THREE.Group;
  book: THREE.Group | null;
  page: PageHook | null;
  /** Mug proxy in seat space; the character moves it, the instanced mug follows. */
  mug: THREE.Object3D;
  bag: THREE.Mesh | null;
  focusAct: FocusAct;
  lamp: LampInfo & { world: THREE.Vector3; tint: THREE.Color; level: number; target: number };
  /** Chair slide along the seat's facing axis (+ toward the table) and twist; driven by the scene. */
  chair: { offset: number; yaw: number };
  /** 0..1 kit unpack animation. */
  kitShown: number;
  kitTarget: number;
}

export interface RoomBuild {
  group: THREE.Group;
  seats: Seat[];
  window: WindowView;
  door: THREE.Group;
  /** Dynamic floor shadows: index → [x, z, radius, strength]; the scene fills these. */
  blobs: THREE.InstancedMesh;
  /** Shelf books (instanced) and the per-slot pools for books carried closed or open (in hands or on the table). */
  books: THREE.InstancedMesh;
  held: { closed: THREE.InstancedMesh; covers: THREE.InstancedMesh; pages: THREE.InstancedMesh };
  update(t: number, dt: number, atmo: Atmo): void;
  setQuality(s: TierSettings): void;
  /** Pixels per world unit at distance 1 (point sprite sizing). */
  setPx(px: number): void;
  dispose(): void;
}

// ---- small helpers --------------------------------------------------------------

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _Z = new THREE.Vector3(0, 0, 1);
/** Euler that turns local +z toward dir. */
function aim(dir: THREE.Vector3, roll = 0): V3 {
  _q.setFromUnitVectors(_Z, dir.clone().normalize());
  if (roll) _q.multiply(new THREE.Quaternion().setFromAxisAngle(_Z, roll));
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z];
}
const lathe = (pts: [number, number][], seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

interface PlantOpts { pot: string; potR: number; potH: number; leaves: number; height: number; spread: number; leaf: number; y0?: number; greens?: string[]; seed: number; droop?: number }

function plant(b: EnvBuilder, x: number, z: number, o: PlantOpts) {
  const r = rng(o.seed);
  const y0 = o.y0 ?? 0;
  b.add(lathe([[0, 0], [o.potR * 0.78, 0], [o.potR, o.potH * 0.92], [o.potR * 1.06, o.potH], [o.potR * 0.92, o.potH], [0, o.potH * 0.96]], 18), o.pot, { p: [x, y0, z] }, { ao: 0.25 });
  b.add(cyl(o.potR * 0.88, o.potR * 0.88, 0.01, 14), '#3a2a20', { p: [x, y0 + o.potH * 0.95, z] });
  const greens = o.greens ?? ['#4f8f4a', '#3f7a42', '#5f9e55'];
  const v = new THREE.Vector3();
  for (let k = 0; k < o.leaves; k++) {
    const a = k * 2.39996 + r() * 0.4;
    const f = k / o.leaves;
    const up = 0.35 + (1 - f) * 0.9 + r() * 0.25 - (o.droop ?? 0);
    const len = o.height * (0.45 + 0.55 * (1 - f * 0.6)) * (0.8 + r() * 0.3);
    v.set(Math.cos(a) * Math.cos(up), Math.sin(up), Math.sin(a) * Math.cos(up));
    const base: V3 = [x + v.x * 0.03, y0 + o.potH, z + v.z * 0.03];
    const tip: V3 = [base[0] + v.x * len * o.spread, base[1] + v.y * len, base[2] + v.z * len * o.spread];
    // stem
    const mid = new THREE.Vector3((base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2, (base[2] + tip[2]) / 2);
    const sd = new THREE.Vector3(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]);
    const sl = sd.length();
    const so = aim(sd);
    b.add(cyl(0.008, 0.01, sl, 5), '#4c6b34', { p: mid.toArray() as V3, r: [so[0] + Math.PI / 2, so[1], so[2]] }, { sway: 0.4 * f + 0.2 });
    // leaf: a flattened ellipsoid pointing outward and drooping
    const ld = new THREE.Vector3(v.x, v.y * 0.35 - 0.25, v.z).normalize();
    const lc: V3 = [tip[0] + ld.x * o.leaf * 0.8, tip[1] + ld.y * o.leaf * 0.8, tip[2] + ld.z * o.leaf * 0.8];
    b.add(sphere(1, 7, 4), greens[k % greens.length], { p: lc, r: aim(ld, r() * 0.6 - 0.3), s: [o.leaf * 0.48, o.leaf * 0.09, o.leaf] }, { sway: 0.6 + 0.6 * (1 - f) });
  }
}

function frame(b: EnvBuilder, w: number, h: number, p: V3, ry: number, scene: 'sunset' | 'hills' | 'lake') {
  const fwd = (d: number): V3 => [p[0] + Math.sin(ry) * d, p[1], p[2] + Math.cos(ry) * d];
  b.add(roundedBox(w, h, 0.045, 0.012, 1), '#c99a62', { p: fwd(0.022), r: [0, ry, 0] });
  b.add(new THREE.BoxGeometry(w - 0.08, h - 0.08, 0.01), '#efe4cb', { p: fwd(0.045), r: [0, ry, 0] });
  const iw = w - 0.2, ih = h - 0.2;
  const sky = scene === 'sunset' ? '#e8b77d' : scene === 'lake' ? '#a9c3cf' : '#b9cbc4';
  b.add(new THREE.BoxGeometry(iw, ih, 0.01), sky, { p: fwd(0.05), r: [0, ry, 0] });
  const right = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
  const at = (dx: number, dy: number, d: number): V3 => { const f = fwd(d); return [f[0] + right.x * dx, f[1] + dy, f[2] + right.z * dx]; };
  b.add(new THREE.BoxGeometry(iw, ih * 0.38, 0.01), scene === 'lake' ? '#5f8a9c' : '#6f8f5c', { p: at(0, -ih * 0.31, 0.056), r: [0, ry, 0] });
  b.add(sphere(1, 12, 6), scene === 'sunset' ? '#a4744a' : '#557a4a', { p: at(-iw * 0.18, -ih * 0.12, 0.054), r: [0, ry, 0], s: [iw * 0.42, ih * 0.22, 0.004] });
  b.add(sphere(1, 12, 6), '#4c6a44', { p: at(iw * 0.22, -ih * 0.16, 0.057), r: [0, ry, 0], s: [iw * 0.36, ih * 0.16, 0.004] });
  if (scene !== 'lake') b.add(sphere(1, 10, 6), scene === 'sunset' ? '#f6d48c' : '#f1e3b0', { p: at(iw * 0.18, ih * 0.2, 0.055), r: [0, ry, 0], s: [ih * 0.08, ih * 0.08, 0.003] });
}

// ---- shell ------------------------------------------------------------------------

function buildShell(): THREE.BufferGeometry {
  const b = new EnvBuilder();
  const r = rng(42);
  // Floor: dark underlay showing through the plank seams, then staggered oak planks.
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WALL_X + 0.6, 0.04, WELL.z - WALL_Z + 0.3), '#3a2216', { p: [(WALL_X + FLOOR_X1) / 2, -0.035, (WALL_Z + WELL.z) / 2] });
  b.add(new THREE.BoxGeometry(WELL.x - WALL_X + 0.3, 0.04, FLOOR_Z1 - WELL.z + 0.01), '#3a2216', { p: [(WALL_X + WELL.x) / 2, -0.035, (WELL.z + FLOOR_Z1) / 2] });
  const PW = 0.34;
  for (let z = WALL_Z; z < FLOOR_Z1 - 0.01; z += PW) {
    const zc = z + PW / 2;
    const xEnd = zc > WELL.z ? WELL.x : FLOOR_X1;
    let x = WALL_X - r() * 1.6;
    while (x < xEnd) {
      const len = 1.5 + r() * 2.2;
      const x0 = Math.max(WALL_X, x), x1 = Math.min(xEnd, x + len);
      if (x1 - x0 > 0.05) {
        const k = 0.86 + r() * 0.2;
        const c = new THREE.Color(r() < 0.25 ? '#b56d3b' : '#bd7a44').multiplyScalar(k);
        b.add(new THREE.BoxGeometry(x1 - x0 - 0.012, 0.03, PW - 0.012), '#' + c.getHexString(), { p: [(x0 + x1) / 2, -0.015, zc] });
      }
      x += len;
    }
  }
  // Rug under the table: teal with a thin gold double border.
  const RW = 7.4, RD = 4.3;
  b.add(roundedBox(RW, 0.024, RD, 0.01, 1), '#244f4c', { p: [0, 0.012, 0] });
  b.add(roundedBox(RW - 0.06, 0.026, RD - 0.06, 0.01, 1), '#2a5c58', { p: [0, 0.013, 0] });
  for (const inset of [0.2, 0.29]) {
    const w = RW - inset * 2, d = RD - inset * 2, t = 0.028;
    b.add(new THREE.BoxGeometry(w, 0.004, t), '#c9a457', { p: [0, 0.027, d / 2] });
    b.add(new THREE.BoxGeometry(w, 0.004, t), '#c9a457', { p: [0, 0.027, -d / 2] });
    b.add(new THREE.BoxGeometry(t, 0.004, d), '#c9a457', { p: [w / 2, 0.027, 0] });
    b.add(new THREE.BoxGeometry(t, 0.004, d), '#c9a457', { p: [-w / 2, 0.027, 0] });
  }
  // Round rug under the coffee table: teal ring around cream.
  b.add(cyl(1.22, 1.22, 0.02, 48), '#2f6d6a', { p: [COFFEE.x, 0.01, COFFEE.z - 0.45] });
  b.add(cyl(1.1, 1.1, 0.024, 48), '#e6d6ba', { p: [COFFEE.x, 0.012, COFFEE.z - 0.45] });
  b.add(new THREE.TorusGeometry(0.98, 0.012, 3, 48), '#cdb994', { p: [COFFEE.x, 0.025, COFFEE.z - 0.45], r: [Math.PI / 2, 0, 0] });

  const T = 0.3;
  // Left wall (window wall): cream plaster with the window cut out. Shape x = −world z.
  const lw = new THREE.Shape();
  lw.moveTo(-FLOOR_Z1, 0); lw.lineTo(-(WALL_Z - T), 0); lw.lineTo(-(WALL_Z - T), WALL_H); lw.lineTo(-FLOOR_Z1, WALL_H); lw.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-WINDOW.z1, WINDOW.y0); hole.lineTo(-WINDOW.z0, WINDOW.y0); hole.lineTo(-WINDOW.z0, WINDOW.y1); hole.lineTo(-WINDOW.z1, WINDOW.y1); hole.closePath();
  lw.holes.push(hole);
  b.add(new THREE.ExtrudeGeometry(lw, { depth: T, bevelEnabled: false }), CREAM_WALL, { p: [WALL_X - T, 0, 0], r: [0, Math.PI / 2, 0] });
  // Back wall (door wall): deep teal, door opening.
  const dx0 = DOOR.x - DOOR.w / 2, dx1 = DOOR.x + DOOR.w / 2;
  const bw = new THREE.Shape();
  bw.moveTo(WALL_X - T, 0); bw.lineTo(dx0, 0); bw.lineTo(dx0, DOOR.h); bw.lineTo(dx1, DOOR.h); bw.lineTo(dx1, 0); bw.lineTo(FLOOR_X1, 0); bw.lineTo(FLOOR_X1, WALL_H); bw.lineTo(WALL_X - T, WALL_H); bw.closePath();
  b.add(new THREE.ExtrudeGeometry(bw, { depth: T, bevelEnabled: false }), TEAL_WALL, { p: [0, 0, WALL_Z - T] });
  // Wall tops read as a cut section.
  b.add(new THREE.BoxGeometry(T + 0.02, 0.03, FLOOR_Z1 - WALL_Z + T), '#3b2a24', { p: [WALL_X - T / 2, WALL_H + 0.015, (FLOOR_Z1 + WALL_Z - T) / 2] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WALL_X + T, 0.03, T + 0.02), '#3b2a24', { p: [(FLOOR_X1 + WALL_X - T) / 2, WALL_H + 0.015, WALL_Z - T / 2] });
  // Crown moulding along both walls.
  b.add(roundedBox(0.12, 0.14, FLOOR_Z1 - WALL_Z, 0.03, 1), '#e2c8a0', { p: [WALL_X + 0.05, WALL_H - 0.3, (FLOOR_Z1 + WALL_Z) / 2] });
  b.add(roundedBox(FLOOR_X1 - WALL_X, 0.14, 0.12, 0.03, 1), '#24504f', { p: [(FLOOR_X1 + WALL_X) / 2, WALL_H - 0.3, WALL_Z + 0.05] });

  // Back wall wainscot: wood panels, top rail, baseboard (gap at the door).
  const WH = 1.28;
  const runs: [number, number][] = [[WALL_X, dx0 - 0.13], [dx1 + 0.13, FLOOR_X1]];
  for (const [a, c] of runs) {
    const w = c - a;
    b.add(new THREE.BoxGeometry(w, WH, 0.04), '#8c532e', { p: [(a + c) / 2, WH / 2, WALL_Z + 0.02] });
    b.add(roundedBox(w, 0.06, 0.09, 0.02, 1), '#a8673a', { p: [(a + c) / 2, WH, WALL_Z + 0.045] });
    b.add(roundedBox(w, 0.16, 0.06, 0.015, 1), '#6e4128', { p: [(a + c) / 2, 0.08, WALL_Z + 0.05] });
    const n = Math.max(1, Math.round(w / 1.05));
    for (let k = 0; k < n; k++) {
      const pw = w / n;
      b.add(roundedBox(pw - 0.2, WH - 0.42, 0.03, 0.02, 1), '#965a33', { p: [a + pw * (k + 0.5), 0.2 + (WH - 0.36) / 2, WALL_Z + 0.05] });
    }
  }
  // Left wall: teal panelled wainscot beyond the counter, cream pier, baseboard.
  b.add(new THREE.BoxGeometry(0.04, 0.98, FLOOR_Z1 - COUNTER.z1), TEAL_PANEL, { p: [WALL_X + 0.02, 0.49, (FLOOR_Z1 + COUNTER.z1) / 2] });
  b.add(roundedBox(0.09, 0.06, FLOOR_Z1 - COUNTER.z1, 0.02, 1), OAK, { p: [WALL_X + 0.045, 0.98, (FLOOR_Z1 + COUNTER.z1) / 2] });
  b.add(roundedBox(0.06, 0.14, FLOOR_Z1 - WALL_Z, 0.015, 1), '#6e4128', { p: [WALL_X + 0.03, 0.07, (FLOOR_Z1 + WALL_Z) / 2] });
  // Pilaster on the back wall left of the door.
  const PX = 1.0;
  b.add(roundedBox(0.36, WALL_H - 0.4, 0.14, 0.03, 1), '#e7d3b0', { p: [PX, (WALL_H - 0.4) / 2, WALL_Z + 0.07] });
  b.add(roundedBox(0.44, 0.12, 0.2, 0.03, 1), '#e2cba4', { p: [PX, 0.06, WALL_Z + 0.1] });
  b.add(roundedBox(0.44, 0.1, 0.2, 0.03, 1), '#e2cba4', { p: [PX, WH + 0.04, WALL_Z + 0.1] });
  // Hallway behind the door.
  b.add(new THREE.BoxGeometry(DOOR.w + 0.6, DOOR.h + 0.4, 1.6), '#3b2b22', { p: [DOOR.x, DOOR.h / 2, WALL_Z - T - 0.8] });

  // Stairwell: floor edge, dark teal walls going down.
  const D = 3.6;
  b.add(new THREE.BoxGeometry(0.3, 0.29, FLOOR_Z1 - WELL.z), '#7a4a2b', { p: [WELL.x - 0.15, -0.175, (FLOOR_Z1 + WELL.z) / 2] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WELL.x, 0.29, 0.3), '#7a4a2b', { p: [(FLOOR_X1 + WELL.x) / 2, -0.175, WELL.z - 0.15] });
  b.add(new THREE.BoxGeometry(0.1, D, FLOOR_Z1 - WELL.z), '#1f3a3a', { p: [WELL.x - 0.05, -0.32 - D / 2, (FLOOR_Z1 + WELL.z) / 2] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WELL.x, D, 0.1), '#21403f', { p: [(FLOOR_X1 + WELL.x) / 2, -0.32 - D / 2, WELL.z - 0.05] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WELL.x, 0.1, FLOOR_Z1 - WELL.z), '#14201f', { p: [(FLOOR_X1 + WELL.x) / 2, -0.32 - D, (FLOOR_Z1 + WELL.z) / 2] });
  // A flight of stairs going down along the back of the well.
  for (let s = 0; s < 10; s++) {
    b.add(roundedBox(1.1, 0.06, 0.32, 0.015, 1), '#6b4128', { p: [WELL.x + 1.2 + s * 0.3, -0.36 - s * 0.3, WELL.z + 0.62] });
    b.add(new THREE.BoxGeometry(1.1, 0.3, 0.02), '#2c3d3b', { p: [WELL.x + 1.05 + s * 0.3, -0.21 - s * 0.3, WELL.z + 0.62] });
  }
  return b.build();
}

// ---- furniture ----------------------------------------------------------------------

function buildTable(b: EnvBuilder) {
  const L = TABLE.len, Dp = TABLE.depth;
  b.add(roundedBox(L, 0.085, Dp, 0.035, 2), '#c27b43', { p: [0, TABLE_TOP - 0.0425, 0] });
  b.add(roundedBox(L - 0.12, 0.012, Dp - 0.1, 0.004, 1), '#c88246', { p: [0, TABLE_TOP - 0.002, 0] });
  b.add(roundedBox(L - 0.3, 0.1, Dp - 0.26, 0.02, 1), '#8f5631', { p: [0, TABLE_TOP - 0.13, 0] });
  for (const x of [-L / 2 + 0.2, 0, L / 2 - 0.2]) for (const z of [-Dp / 2 + 0.16, Dp / 2 - 0.16]) {
    b.add(roundedBox(0.14, TABLE_TOP - 0.085, 0.14, 0.035, 1), '#8f5631', { p: [x, (TABLE_TOP - 0.085) / 2, z] }, { ao: 0.3 });
  }
}

function buildCounter(b: EnvBuilder) {
  const z0 = COUNTER.z0, z1 = COUNTER.z1, zc = (z0 + z1) / 2, L = z1 - z0;
  const front = WALL_X + 0.36;
  b.add(roundedBox(COUNTER.depth + 0.04, 0.065, L + 0.06, 0.025, 2), '#c98a4c', { p: [WALL_X + (COUNTER.depth + 0.04) / 2, COUNTER.top - 0.0325, zc] });
  b.add(new THREE.BoxGeometry(0.05, COUNTER.top - 0.14, L), TEAL_PANEL, { p: [front, (COUNTER.top - 0.14) / 2 + 0.08, zc] });
  b.add(new THREE.BoxGeometry(0.06, 0.08, L), '#203b3a', { p: [front - 0.02, 0.04, zc] });
  const n = 4;
  for (let k = 0; k < n; k++) {
    const pz = z0 + (L / n) * (k + 0.5);
    b.add(roundedBox(0.03, COUNTER.top - 0.36, L / n - 0.16, 0.012, 1), '#336f6c', { p: [front + 0.03, 0.08 + (COUNTER.top - 0.14) / 2, pz] });
  }
  for (const z of [z0 + 0.03, z1 - 0.03]) b.add(new THREE.BoxGeometry(0.36, COUNTER.top - 0.07, 0.05), TEAL_PANEL, { p: [WALL_X + 0.18, (COUNTER.top - 0.07) / 2, z] });
  // Things on the counter.
  plant(b, WALL_X + 0.22, z0 + 0.36, { pot: TERRA, potR: 0.1, potH: 0.15, leaves: 9, height: 0.26, spread: 0.9, leaf: 0.075, y0: COUNTER.top, seed: 5 });
  plant(b, WALL_X + 0.24, z1 - 0.4, { pot: '#efe8dc', potR: 0.1, potH: 0.14, leaves: 10, height: 0.3, spread: 0.8, leaf: 0.08, y0: COUNTER.top, seed: 9 });
  b.add(roundedBox(0.24, 0.045, 0.32, 0.01, 1), '#3f7d74', { p: [WALL_X + 0.27, COUNTER.top + 0.022, z1 - 1.05], r: [0, 0.12, 0] });
  b.add(roundedBox(0.21, 0.04, 0.29, 0.01, 1), '#d07a8a', { p: [WALL_X + 0.27, COUNTER.top + 0.065, z1 - 1.05], r: [0, -0.06, 0] });
  // Stools.
  for (const [sx, sz] of STOOLS) {
    b.add(cyl(0.19, 0.18, 0.06, 20), '#c8833f', { p: [sx, 0.53, sz] });
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      b.add(cyl(0.02, 0.024, 0.52, 8), '#9a5e32', { p: [sx + Math.cos(a) * 0.13, 0.25, sz + Math.sin(a) * 0.13], r: [Math.sin(a) * -0.09, 0, Math.cos(a) * 0.09] }, { ao: 0.25 });
    }
    b.add(torus(0.15, 0.012, Math.PI * 2, 6, 24), '#9a5e32', { p: [sx, 0.24, sz], r: [Math.PI / 2, 0, 0] });
  }
}

function buildWindowFrame(b: EnvBuilder) {
  const { z0, z1, y0, y1, cols, rows } = WINDOW;
  const x = WALL_X - 0.12;
  const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2;
  const F = '#c8884a';
  // Casing on the room side.
  b.add(roundedBox(0.06, 0.16, z1 - z0 + 0.32, 0.03, 1), F, { p: [WALL_X + 0.03, y1 + 0.08, zc] });
  b.add(roundedBox(0.06, y1 - y0 + 0.16, 0.16, 0.03, 1), F, { p: [WALL_X + 0.03, yc + 0.04, z0 - 0.08] });
  b.add(roundedBox(0.06, y1 - y0 + 0.16, 0.16, 0.03, 1), F, { p: [WALL_X + 0.03, yc + 0.04, z1 + 0.08] });
  // Mullions in the glass plane.
  for (let c = 1; c < cols; c++) b.add(roundedBox(0.09, y1 - y0, 0.1, 0.025, 1), F, { p: [x, yc, z0 + ((z1 - z0) * c) / cols] });
  for (let rr = 1; rr < rows; rr++) b.add(roundedBox(0.09, 0.09, z1 - z0, 0.025, 1), F, { p: [x, y0 + ((y1 - y0) * rr) / rows, zc] });
  // Inner frame lining the opening.
  b.add(new THREE.BoxGeometry(0.1, 0.06, z1 - z0), F, { p: [x, y0 + 0.03, zc] });
  b.add(new THREE.BoxGeometry(0.1, 0.06, z1 - z0), F, { p: [x, y1 - 0.03, zc] });
  b.add(new THREE.BoxGeometry(0.1, y1 - y0, 0.06), F, { p: [x, yc, z0 + 0.03] });
  b.add(new THREE.BoxGeometry(0.1, y1 - y0, 0.06), F, { p: [x, yc, z1 - 0.03] });
}

/** Shelf carcass; returns the shelf levels for the book instances. */
function buildShelves(b: EnvBuilder): number[] {
  const { z0, bay, bays, depth, h } = SHELF;
  const x0 = WALL_X, xc = x0 + depth / 2;
  const levels = [0.12, 0.56, 1.0, 1.44, 1.88, 2.32];
  b.add(new THREE.BoxGeometry(0.03, h, bay * bays), '#5a3826', { p: [x0 + 0.03, h / 2, z0 + (bay * bays) / 2] });
  for (let k = 0; k <= bays; k++) b.add(roundedBox(depth, h, 0.06, 0.015, 1), OAK, { p: [xc, h / 2, z0 + k * bay] });
  for (const y of levels) b.add(roundedBox(depth - 0.02, 0.035, bay * bays, 0.01, 1), OAK, { p: [xc, y, z0 + (bay * bays) / 2] });
  b.add(roundedBox(depth + 0.06, 0.08, bay * bays + 0.1, 0.02, 1), OAK_DARK, { p: [xc + 0.02, h + 0.04, z0 + (bay * bays) / 2] });
  b.add(roundedBox(depth + 0.02, 0.1, bay * bays + 0.04, 0.02, 1), OAK_DEEP, { p: [xc, 0.05, z0 + (bay * bays) / 2] });
  // Ivy planters on top, trailing down the front.
  const r = rng(77);
  for (const pz of [z0 + 0.45, z0 + bay * 2 + 0.35]) {
    b.add(roundedBox(0.3, 0.14, 0.42, 0.04, 1), '#d9cdb5', { p: [xc, h + 0.15, pz] });
    for (let s = 0; s < 4; s++) {
      const sz = pz - 0.18 + s * 0.12 + (r() - 0.5) * 0.05;
      const len = 0.7 + r() * 0.9;
      const n = Math.floor(len / 0.075);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const y = h + 0.18 - t * len;
        const out = 0.06 + Math.sin(t * Math.PI) * 0.08;
        const side = k % 2 ? 1 : -1;
        b.add(sphere(1, 7, 4), k % 3 ? '#4e8c48' : '#3d7540', {
          p: [x0 + depth + out, y, sz + side * 0.03], r: [0.6 * side, r() * 0.8, 0.9], s: [0.045, 0.012, 0.05],
        }, { sway: 0.3 + t * 1.1 });
      }
    }
    for (let k = 0; k < 12; k++) {
      const a = k * 2.4;
      b.add(sphere(1, 7, 4), k % 2 ? '#4e8c48' : '#5c9a50', { p: [xc + Math.cos(a) * 0.12, h + 0.25 + (k % 3) * 0.03, pz + Math.sin(a) * 0.16], r: [r(), r() * 3, r()], s: [0.06, 0.016, 0.07] }, { sway: 0.3 });
    }
  }
  return levels;
}

function buildBooks(levels: number[]): THREE.InstancedMesh {
  const { z0, bay, bays, depth } = SHELF;
  const r = rng(13);
  const palette = ['#3f6b8a', '#2f4a6b', '#4f7d5c', '#3f8f8a', '#b6584a', '#d9a441', '#c97a4a', '#8a6aa8', '#e2c79a', '#2f6d5f', '#6e3d5c', '#a8473f', '#5d8fb8', '#d6cbb0'];
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let k = 0; k < bays; k++) {
    for (let li = 0; li < levels.length - 1; li++) {
      const y = levels[li] + 0.0175;
      const gap = levels[li + 1] - levels[li] - 0.05;
      let z = z0 + k * bay + 0.05;
      const zEnd = z0 + (k + 1) * bay - 0.05;
      let lean = 0;
      while (z < zEnd - 0.03) {
        if (r() < 0.06) { z += 0.12 + r() * 0.1; lean = r() < 0.5 ? 0.22 : 0; continue; }
        const t = 0.035 + r() * 0.045, hh = Math.min(gap, 0.27 + r() * 0.12), d = 0.24 + r() * 0.08;
        if (z + t > zEnd) break;
        if (r() < 0.05 && zEnd - z > 0.3) {
          // a short horizontal stack
          let yy = y;
          for (let j = 0; j < 3; j++) {
            const th = 0.035 + r() * 0.02;
            m.compose(p.set(WALL_X + 0.06 + d / 2, yy + th / 2, z + 0.13), q.setFromEuler(e.set(0, (r() - 0.5) * 0.2, 0)), s.set(d, th, 0.24));
            mats.push(m.clone()); cols.push(new THREE.Color(palette[Math.floor(r() * palette.length)]));
            yy += th;
          }
          z += 0.3;
          continue;
        }
        const tilt = lean ? lean : 0;
        m.compose(p.set(WALL_X + 0.06 + d / 2 + (depth - 0.08 - d) * 0.6, y + (hh / 2) * Math.cos(tilt), z + t / 2 + (hh / 2) * Math.sin(tilt)), q.setFromEuler(e.set(-tilt, 0, 0)), s.set(d, hh, t));
        mats.push(m.clone());
        const c = new THREE.Color(palette[Math.floor(r() * palette.length)]).multiplyScalar(0.85 + r() * 0.25);
        cols.push(c);
        z += t + 0.004 + (lean ? 0.06 : 0);
        lean = 0;
      }
    }
  }
  const g = new THREE.BoxGeometry(1, 1, 1);
  // Lighter page block on the inner faces, spine bands via vertex colours.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), yv = pos.getY(i);
    const k = x > 0.49 ? 1 : 0.62 + 0.1 * (yv + 0.5);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  const mesh = new THREE.InstancedMesh(g, envMaterial(), mats.length);
  mats.forEach((mm, i) => { mesh.setMatrixAt(i, mm); mesh.setColorAt(i, cols[i]); });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildSofaCorner(b: EnvBuilder) {
  const { x, z, len } = SOFA;
  const S = '#b9603f', S2 = '#c76c49', S3 = '#a9553a';
  // Built facing −z with the back at +z, then turned round so it faces the camera side.
  const sb = new EnvBuilder();
  sb.add(roundedBox(len, 0.26, 0.94, 0.08, 2), S3, { p: [0, 0.17, 0] }, { ao: 0.3 });
  for (let k = 0; k < 3; k++) sb.add(roundedBox(len / 3 - 0.06, 0.15, 0.74, 0.07, 2), S2, { p: [-len / 3 + k * (len / 3), 0.36, -0.06] });
  sb.add(roundedBox(len, 0.62, 0.26, 0.1, 2), S, { p: [0, 0.47, 0.36] }, { ao: 0.25 });
  for (let k = 0; k < 3; k++) sb.add(roundedBox(len / 3 - 0.08, 0.42, 0.2, 0.09, 2), S2, { p: [-len / 3 + k * (len / 3), 0.6, 0.2], r: [-0.18, 0, 0] });
  for (const sd of [-1, 1]) sb.add(roundedBox(0.26, 0.56, 0.96, 0.11, 2), S, { p: [sd * (len / 2 - 0.1), 0.3, 0] }, { ao: 0.3 });
  for (const lx of [-len / 2 + 0.12, len / 2 - 0.12]) for (const lz of [-0.36, 0.36]) sb.add(cyl(0.035, 0.03, 0.06, 8), OAK_DEEP, { p: [lx, 0.03, lz] });
  // Teal cushion at the head end, cream pillow at the far arm, knit throw over the back and arm.
  sb.add(roundedBox(0.42, 0.38, 0.15, 0.07, 2), '#2f6f69', { p: [len / 2 - 0.42, 0.6, 0.12], r: [-0.3, -0.25, -0.05] });
  sb.add(roundedBox(0.36, 0.32, 0.13, 0.06, 2), '#eadfc8', { p: [-len / 2 + 0.38, 0.58, 0.14], r: [-0.3, 0.3, 0.05] });
  // Knit throw draped over the far arm: across the top, down the outside, a little onto the seat.
  const th = '#ece2cc', ax = -len / 2 + 0.1;
  sb.add(roundedBox(0.34, 0.035, 0.52, 0.016, 2), th, { p: [ax, 0.6, -0.02] });
  sb.add(roundedBox(0.035, 0.42, 0.52, 0.016, 2), th, { p: [ax - 0.15, 0.4, -0.02], r: [0, 0, 0.06] });
  sb.add(roundedBox(0.2, 0.035, 0.5, 0.016, 2), th, { p: [ax + 0.24, 0.45, -0.03], r: [0, 0, -0.35] });
  for (let k = 0; k < 5; k++) sb.add(new THREE.BoxGeometry(0.04, 0.4, 0.008), '#d6c8ad', { p: [ax - 0.168, 0.4, -0.24 + k * 0.11], r: [0, 0, 0.06] });
  b.add(sb.build(), null, { p: [x, 0, z], r: [0, Math.PI, 0] });
  // Coffee table with a plant and a closed teal book.
  const { x: cx, z: cz, r: cr } = COFFEE;
  b.add(cyl(cr, cr, 0.05, 32), '#c2804a', { p: [cx, 0.42, cz] });
  b.add(cyl(cr - 0.03, cr - 0.03, 0.006, 32), '#c98a50', { p: [cx, 0.447, cz] });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    b.add(roundedBox(0.05, 0.4, 0.05, 0.015, 1), OAK_DARK, { p: [cx + Math.cos(a) * (cr - 0.12), 0.2, cz + Math.sin(a) * (cr - 0.12)], r: [Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08] }, { ao: 0.3 });
  }
  plant(b, cx - 0.1, cz - 0.12, { pot: '#efe8dc', potR: 0.07, potH: 0.1, leaves: 8, height: 0.17, spread: 0.9, leaf: 0.055, y0: 0.445, seed: 23 });
  b.add(roundedBox(0.2, 0.035, 0.27, 0.008, 1), '#2e6f6c', { p: [cx + 0.14, 0.462, cz + 0.12], r: [0, 0.5, 0] });
  b.add(new THREE.BoxGeometry(0.18, 0.025, 0.005), '#efe4cb', { p: [cx + 0.14 + Math.sin(0.5) * 0.135, 0.462, cz + 0.12 + Math.cos(0.5) * 0.135], r: [0, 0.5, 0] });
}

function buildBalustrade(b: EnvBuilder) {
  const W = '#b8743c', W2 = '#9c5f30';
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    b.add(roundedBox(0.1, 0.07, L, 0.03, 1), W, { p: [mx, 0.98, mz], r: [0, ry, 0] });
    b.add(roundedBox(0.07, 0.05, L, 0.02, 1), W2, { p: [mx, 0.12, mz], r: [0, ry, 0] });
    const n = Math.floor(L / 0.17);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      b.add(roundedBox(0.045, 0.82, 0.045, 0.012, 1), W, { p: [ax + (bx - ax) * t, 0.55, az + (bz - az) * t] });
    }
    for (const [px, pz] of [[ax, az], [bx, bz]]) {
      b.add(roundedBox(0.13, 1.1, 0.13, 0.03, 1), W2, { p: [px, 0.55, pz] });
      b.add(roundedBox(0.16, 0.06, 0.16, 0.03, 1), W, { p: [px, 1.12, pz] });
    }
  };
  rail(WELL.x + 0.06, WELL.z + 0.06, WELL.x + 0.06, 2.6);
  rail(WELL.x + 0.06, 2.6, WELL.x + 0.06, FLOOR_Z1);
  rail(WELL.x + 0.06, WELL.z + 0.06, FLOOR_X1, WELL.z + 0.06);
}

function buildDoorCasing(b: EnvBuilder) {
  const C = '#a0623a';
  const x0 = DOOR.x - DOOR.w / 2, x1 = DOOR.x + DOOR.w / 2;
  b.add(roundedBox(0.14, DOOR.h + 0.12, 0.08, 0.03, 1), C, { p: [x0 - 0.07, (DOOR.h + 0.12) / 2, WALL_Z + 0.04] });
  b.add(roundedBox(0.14, DOOR.h + 0.12, 0.08, 0.03, 1), C, { p: [x1 + 0.07, (DOOR.h + 0.12) / 2, WALL_Z + 0.04] });
  b.add(roundedBox(DOOR.w + 0.36, 0.16, 0.1, 0.03, 1), C, { p: [DOOR.x, DOOR.h + 0.1, WALL_Z + 0.05] });
  // Jambs lining the opening.
  b.add(new THREE.BoxGeometry(0.03, DOOR.h, 0.3), '#8a522e', { p: [x0 + 0.015, DOOR.h / 2, WALL_Z - 0.15] });
  b.add(new THREE.BoxGeometry(0.03, DOOR.h, 0.3), '#8a522e', { p: [x1 - 0.015, DOOR.h / 2, WALL_Z - 0.15] });
  b.add(new THREE.BoxGeometry(DOOR.w, 0.03, 0.3), '#8a522e', { p: [DOOR.x, DOOR.h - 0.015, WALL_Z - 0.15] });
}

function buildDoor(): THREE.BufferGeometry {
  const b = new EnvBuilder();
  const w = DOOR.w - 0.04, h = DOOR.h - 0.02;
  const D = '#8f532c', P = '#7d4725';
  b.add(roundedBox(w, h, 0.055, 0.015, 1), D, { p: [w / 2, h / 2, 0] });
  for (let rr = 0; rr < 3; rr++) for (let c = 0; c < 2; c++) {
    const ph = rr === 1 ? 0.62 : 0.5;
    const py = [0.38, 1.08, 1.78][rr];
    b.add(roundedBox(w / 2 - 0.16, ph, 0.02, 0.02, 1), P, { p: [w * (c ? 0.73 : 0.27), py, 0.03] });
    b.add(roundedBox(w / 2 - 0.22, ph - 0.07, 0.024, 0.02, 1), '#94582f', { p: [w * (c ? 0.73 : 0.27), py, 0.034] });
  }
  b.add(roundedBox(0.05, 0.14, 0.02, 0.01, 1), '#d2a64e', { p: [w - 0.09, 1.0, 0.04] });
  b.add(roundedBox(0.12, 0.022, 0.03, 0.01, 1), '#d9b05a', { p: [w - 0.13, 1.03, 0.065] });
  return b.build();
}

function buildPendant(b: EnvBuilder) {
  const { x, y, z } = PENDANT;
  b.add(new THREE.SphereGeometry(0.46, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#efe2c4', { p: [x, y, z], s: [1, 0.62, 1] }, { emit: PENDANT_LAMP, glow: 0.35 });
  b.add(new THREE.SphereGeometry(0.44, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#fff3d6', { p: [x, y + 0.001, z], s: [1, 0.1, 1] }, { emit: PENDANT_LAMP, glow: 1.6 });
  b.add(cyl(0.05, 0.07, 0.06, 12), '#c99a4c', { p: [x, y + 0.3, z] });
  b.add(cyl(0.006, 0.006, 6, 4), '#2a2420', { p: [x, y + 3.3, z] });
}

// ---- assembly ---------------------------------------------------------------------------

export function buildRoom(): RoomBuild {
  const group = new THREE.Group();
  const shellMat = envMaterial();
  const furnMat = envMaterial({ sway: true, emit: true });
  const propMat = envMaterial({ emit: true });
  const shell = new THREE.Mesh(buildShell(), shellMat);
  shell.receiveShadow = true;
  group.add(shell);

  const fb = new EnvBuilder();
  buildTable(fb);
  buildCounter(fb);
  buildWindowFrame(fb);
  const levels = buildShelves(fb);
  buildSofaCorner(fb);
  buildBalustrade(fb);
  buildDoorCasing(fb);
  buildPendant(fb);
  frame(fb, 0.82, 0.64, [-1.15, 2.4, WALL_Z], 0, 'hills');
  frame(fb, 0.6, 0.76, [0.05, 2.3, WALL_Z], 0, 'sunset');
  frame(fb, 0.62, 0.8, [4.45, 2.35, WALL_Z], 0, 'lake');
  plant(fb, 1.48, WALL_Z + 0.42, { pot: '#efe8dc', potR: 0.2, potH: 0.36, leaves: 22, height: 1.25, spread: 0.5, leaf: 0.16, seed: 3 });
  plant(fb, 3.72, WALL_Z + 0.45, { pot: TERRA, potR: 0.17, potH: 0.3, leaves: 18, height: 0.9, spread: 0.65, leaf: 0.15, seed: 4 });
  plant(fb, WALL_X + 0.45, 4.15, { pot: TERRA, potR: 0.18, potH: 0.3, leaves: 18, height: 0.85, spread: 0.7, leaf: 0.15, seed: 6 });
  plant(fb, WELL.x - 0.4, 2.9, { pot: '#efe8dc', potR: 0.17, potH: 0.3, leaves: 16, height: 0.7, spread: 0.8, leaf: 0.15, seed: 8, greens: ['#7fae5a', '#6a9a4c', '#8fbb66'] });
  plant(fb, -2.6, WALL_Z + 0.45, { pot: TERRA, potR: 0.15, potH: 0.26, leaves: 14, height: 0.8, spread: 0.6, leaf: 0.14, seed: 12 });

  // Seat lamps (bodies in the furniture mesh; shades glow with the lamp level).
  const seatsLamp: (LampInfo & { world: THREE.Vector3; yaw: number })[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const sp = seatPose(i);
    const lb = new EnvBuilder();
    const info = buildLamp(KITS[i].lamp, lb, i);
    // Face the lamp head toward the seat's workspace (seat space (0, 0.5)).
    const yawLocal = Math.atan2(0 - LAMP_AT.x, 0.5 - LAMP_AT.z) + (i % 3 - 1) * 0.25;
    const yaw = sp.rotY + yawLocal;
    const c = Math.cos(sp.rotY), s = Math.sin(sp.rotY);
    const wx = sp.x + LAMP_AT.x * c + LAMP_AT.z * s, wz = sp.z - LAMP_AT.x * s + LAMP_AT.z * c;
    fb.add(lb.build(), null, { p: [wx, TABLE_TOP, wz], r: [0, yaw, 0] });
    const bw = info.bulb.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(wx, TABLE_TOP, wz));
    seatsLamp.push({ ...info, world: bw, yaw });
  }
  const furniture = new THREE.Mesh(fb.build(), furnMat);
  // The sun reaches the room through the window mask, which already handles the table;
  // the merged furniture only receives (chairs, kits, people and cats cast).
  furniture.receiveShadow = true;
  group.add(furniture);

  const books = buildBooks(levels);
  group.add(books);

  // Door on a hinge at its left edge.
  const door = new THREE.Group();
  door.position.set(DOOR.x - DOOR.w / 2 + 0.02, 0, WALL_Z - 0.06);
  const doorMesh = new THREE.Mesh(buildDoor(), shellMat);
  door.add(doorMesh);
  group.add(door);

  // Window glass + view.
  const win = buildWindowView(WINDOW.z0, WINDOW.z1, WINDOW.y0, WINDOW.y1, WALL_X - 0.16);
  group.add(win.mesh);

  // Chairs (instanced), kits, mugs, backpacks.
  const chairs = new THREE.InstancedMesh(chairGeo('#5e7f52'), propMat, MAX_SLOTS);
  chairs.castShadow = chairs.receiveShadow = true;
  chairs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(chairs);
  const mugs = new THREE.InstancedMesh(mugGeo(), propMat, MAX_SLOTS);
  mugs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mugs.castShadow = true;
  group.add(mugs);
  const seats: Seat[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const sp = seatPose(i);
    const anchor = new THREE.Group();
    anchor.position.set(sp.x, 0, sp.z);
    anchor.rotation.y = sp.rotY;
    group.add(anchor);
    const k = buildKit(i, KITS[i], rng(100 + i));
    const kit = new THREE.Group();
    const km = new THREE.Mesh(k.geo, propMat);
    km.castShadow = true;
    kit.add(km);
    if (k.book) {
      k.book.add(new THREE.Mesh(k.book.userData.geo as THREE.BufferGeometry, propMat));
      const pv = k.book.children[0];
      pv.add(new THREE.Mesh(pv.userData.geo as THREE.BufferGeometry, propMat));
      kit.add(k.book);
    }
    const mug = new THREE.Object3D();
    mug.position.copy(k.mug);
    mug.rotation.y = k.mugYaw;
    kit.add(mug);
    kit.visible = false;
    anchor.add(kit);
    mugs.setColorAt(i, new THREE.Color(KITS[i].mug));
    let bag: THREE.Mesh | null = null;
    if (KITS[i].bag) {
      bag = new THREE.Mesh(backpackGeo(KITS[i].bag!), propMat);
      bag.position.set(i % 2 ? -0.5 : 0.5, 0, -0.12);
      bag.rotation.set(-0.18, (i % 2 ? 1 : -1) * 0.5, 0);
      bag.visible = false;
      anchor.add(bag);
    }
    const tint = new THREE.Color(LAMP_TINT[KITS[i].lamp]);
    seats.push({
      slot: i, anchor, kit, book: k.book, page: k.page, mug, bag, focusAct: KITS[i].act,
      lamp: { ...seatsLamp[i], tint, level: 0, target: 0 },
      chair: { offset: CHAIR_IN, yaw: 0 },
      kitShown: 0, kitTarget: 0,
    });
  }

  // Books in hands or brought back to the table: per-slot instances, hidden by a zero scale.
  const closedGeo = new EnvBuilder()
    .add(roundedBox(0.18, 0.25, 0.042, 0.01, 1), '#ffffff', { p: [0, 0, 0] })
    .add(new THREE.BoxGeometry(0.165, 0.235, 0.044), '#f2ead8', { p: [0.006, 0, 0] })
    .build();
  const coverGeo = new EnvBuilder();
  const pageGeo = new EnvBuilder();
  for (const sd of [-1, 1]) {
    // Each half hinges at the spine (local y axis) and opens 22° toward the reader (+z).
    const a = sd * 0.38;
    const c = Math.cos(a), sn = Math.sin(a);
    coverGeo.add(roundedBox(0.17, 0.25, 0.012, 0.004, 1), '#ffffff', { p: [sd * 0.085 * c, 0, 0.085 * Math.abs(sn) - 0.006], r: [0, -a, 0] });
    pageGeo.add(roundedBox(0.16, 0.235, 0.022, 0.004, 1), '#f6eedc', { p: [sd * 0.083 * c, 0, 0.083 * Math.abs(sn) + 0.012], r: [0, -a, 0] });
    for (let l = 0; l < 6; l++) pageGeo.add(new THREE.BoxGeometry(0.1, 0.006, 0.002), '#bfb39a', { p: [sd * 0.08 * c, 0.08 - l * 0.032, 0.08 * Math.abs(sn) + 0.024], r: [0, -a, 0] });
  }
  const pools = { closed: closedGeo, covers: coverGeo.build(), pages: pageGeo.build() };
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  const pool = (g: THREE.BufferGeometry) => {
    const m = new THREE.InstancedMesh(g, propMat, MAX_SLOTS);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_SLOTS; i++) { m.setMatrixAt(i, zeroM); m.setColorAt(i, new THREE.Color('#ffffff')); }
    m.frustumCulled = false;
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const held = { closed: pool(pools.closed), covers: pool(pools.covers), pages: pool(pools.pages) };

  // Glow sprites for the lamps and the pendant (one draw).
  const glowN = MAX_SLOTS + 1;
  const gPos = new Float32Array(glowN * 3), gSize = new Float32Array(glowN), gAmt = new Float32Array(glowN), gCol = new Float32Array(glowN * 3);
  seats.forEach((s, i) => { s.lamp.world.toArray(gPos, i * 3); gSize[i] = s.lamp.glow; s.lamp.tint.toArray(gCol, i * 3); });
  gPos.set([PENDANT.x, PENDANT.y - 0.05, PENDANT.z], MAX_SLOTS * 3);
  gSize[MAX_SLOTS] = 1.6;
  new THREE.Color('#ffd9a0').toArray(gCol, MAX_SLOTS * 3);
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  gGeo.setAttribute('aSize', new THREE.BufferAttribute(gSize, 1));
  gGeo.setAttribute('aAmt', new THREE.BufferAttribute(gAmt, 1).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('aCol', new THREE.BufferAttribute(gCol, 3));
  const gMat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uMap: { value: materials().glowTex }, uScale: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aAmt; attribute vec3 aCol;
      uniform float uPx; uniform float uScale;
      varying float vA; varying vec3 vC;
      void main() {
        vA = aAmt; vC = aCol;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAmt > 0.001 ? aSize * uScale * uPx / -mv.z : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying float vA; varying vec3 vC;
      void main() {
        float m = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vC * vA, m * vA);
        #include <colorspace_fragment>
      }`,
  });
  const glow = new THREE.Points(gGeo, gMat);
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  group.add(glow);

  // Soft window haze (day): a big additive quad just inside the window.
  const hazeMat = new THREE.MeshBasicMaterial({ map: materials().glowTex, color: '#ffd8a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 4.6), hazeMat);
  haze.position.set(WALL_X + 0.45, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z0 + WINDOW.z1) / 2);
  haze.rotation.y = Math.PI / 2;
  haze.renderOrder = 2;
  group.add(haze);

  // Floor blob shadows (instanced): chairs, people, cats and static furniture.
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ map: materials().glowTex, color: '#000000', transparent: true, opacity: 1, depthWrite: false });
  blobMat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <color_pars_vertex>', 'attribute float aStr; varying float vStr;\n#include <color_pars_vertex>')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvStr = aStr;');
    s.fragmentShader = s.fragmentShader.replace('#include <color_pars_fragment>', 'varying float vStr;\n#include <color_pars_fragment>')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vStr;');
  };
  const BLOBS = 40;
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, BLOBS);
  blobGeo.setAttribute('aStr', new THREE.InstancedBufferAttribute(new Float32Array(BLOBS), 1).setUsage(THREE.DynamicDrawUsage));
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.renderOrder = 1;
  blobs.frustumCulled = false;
  group.add(blobs);
  const _m = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const statics: [number, number, number, number, number][] = [
    // x, z, w, d, strength
    [SOFA.x, SOFA.z, SOFA.len + 0.5, 1.3, 0.5], [COFFEE.x, COFFEE.z, 1.3, 1.3, 0.35],
    ...STOOLS.map(([x, z]): [number, number, number, number, number] => [x, z, 0.6, 0.6, 0.35]),
    [WALL_X + 0.4, (COUNTER.z0 + COUNTER.z1) / 2, 1.0, COUNTER.z1 - COUNTER.z0 + 0.4, 0.3],
    [WALL_X + 0.35, SHELF.z0 + 1.5, 0.9, 3.4, 0.3],
    [1.48, WALL_Z + 0.42, 0.7, 0.7, 0.35], [3.72, WALL_Z + 0.45, 0.6, 0.6, 0.35], [WALL_X + 0.45, 4.15, 0.6, 0.6, 0.35],
    [WELL.x - 0.4, 2.9, 0.6, 0.6, 0.35], [-2.6, WALL_Z + 0.45, 0.55, 0.55, 0.35],
  ];
  const blobAttr = blobGeo.getAttribute('aStr') as THREE.InstancedBufferAttribute;
  statics.forEach(([x, z, w, d, st], i) => { blobs.setMatrixAt(i, _m.makeScale(w, 1, d).setPosition(x, 0.031, z)); blobAttr.setX(i, st); });
  const FIRST_DYNAMIC = statics.length;
  for (let i = FIRST_DYNAMIC; i < BLOBS; i++) blobs.setMatrixAt(i, zero);
  blobs.userData.first = FIRST_DYNAMIC;

  // Fixed light rig entries: pendant and window spill.
  lightRig.pos[PENDANT_LAMP].set(PENDANT.x, PENDANT.y - 0.3, PENDANT.z, 6.6);
  lightRig.pos[WINDOW_LAMP].set(WALL_X + 0.9, 2.3, (WINDOW.z0 + WINDOW.z1) / 2, 4.6);
  const pendantTint = new THREE.Color('#ffd9a0');

  // ---- per frame ----------------------------------------------------------------------
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _qq = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0);
  const _cm = new THREE.Matrix4();
  let glowScale = 1;
  const smoothLevel = (x: number) => x * x * (3 - 2 * x);

  return {
    group, seats, window: win, door, blobs, books, held,
    update(t, dt, atmo) {
      stUniforms.stTime.value = t;
      // Lamps: fade toward their target, tiny flicker, feed the shader rig.
      for (let i = 0; i < MAX_SLOTS; i++) {
        const L = seats[i].lamp;
        const step = dt / LAMP_FADE;
        L.level = L.target > L.level ? Math.min(L.target, L.level + step) : Math.max(L.target, L.level - step);
        const lv = smoothLevel(L.level) * (1 + 0.025 * Math.sin(t * 7.3 + i * 1.7) * Math.sin(t * 2.9 + i));
        lightRig.level[i] = lv * atmo.lampEmit;
        lightRig.col[i].set(L.tint.r, L.tint.g, L.tint.b).multiplyScalar(2.6 * atmo.lampLight * lv);
        lightRig.pos[i].set(L.world.x, L.world.y, L.world.z, L.reach);
        gAmt[i] = lv * atmo.lampGlow * 0.55;
      }
      lightRig.level[PENDANT_LAMP] = atmo.pendant;
      lightRig.col[PENDANT_LAMP].set(pendantTint.r, pendantTint.g, pendantTint.b).multiplyScalar(2.5 * atmo.pendant);
      gAmt[MAX_SLOTS] = 0.45 * atmo.pendant * atmo.lampGlow;
      lightRig.col[WINDOW_LAMP].set(atmo.spill.r, atmo.spill.g, atmo.spill.b).multiplyScalar(atmo.spillI);
      (gGeo.attributes.aAmt as THREE.BufferAttribute).needsUpdate = true;
      gMat.uniforms.uScale.value = glowScale;
      hazeMat.opacity = 0.16 * atmo.beam * (haze.visible ? 1 : 0);
      hazeMat.color.copy(atmo.sun);

      // Chairs and mugs follow their seats.
      for (let i = 0; i < MAX_SLOTS; i++) {
        const s = seats[i];
        const a = s.anchor;
        const c = Math.cos(a.rotation.y), sn = Math.sin(a.rotation.y);
        _p.set(a.position.x + sn * s.chair.offset, 0, a.position.z + c * s.chair.offset);
        _qq.setFromAxisAngle(_y, a.rotation.y + s.chair.yaw);
        chairs.setMatrixAt(i, _cm.compose(_p, _qq, _s.set(1, 1, 1)));
        // Kit unpacks with a little pop.
        s.kitShown += (s.kitTarget - s.kitShown) * (1 - Math.exp(-10 * dt));
        if (Math.abs(s.kitTarget - s.kitShown) < 0.002) s.kitShown = s.kitTarget;
        const k = s.kitShown;
        s.kit.visible = k > 0.01;
        const pop = k < 1 ? k * (1 + 0.12 * Math.sin(k * Math.PI)) : 1;
        s.kit.scale.setScalar(Math.max(0.001, pop));
        if (s.kit.visible) {
          s.mug.updateWorldMatrix(true, false);
          mugs.setMatrixAt(i, s.mug.matrixWorld);
        } else mugs.setMatrixAt(i, zero);
      }
      chairs.instanceMatrix.needsUpdate = true;
      mugs.instanceMatrix.needsUpdate = true;
    },
    setQuality(q) {
      glowScale = q.glow * 1.0;
      haze.visible = q.haze;
      win.setLow(q.simpleRain);
    },
    setPx(px) { gMat.uniforms.uPx.value = px; },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      [shellMat, furnMat, propMat, gMat, hazeMat, blobMat, books.material as THREE.Material].forEach((m) => m.dispose());
      win.dispose();
    },
  };
}

export { N_LAMPS };
