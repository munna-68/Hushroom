// Table props: the eight seat lamps (all different silhouettes), the per-seat desk
// kits, mugs, chairs and backpacks. Geometry only; room.ts places and owns them.
import * as THREE from 'three';
import { EnvBuilder, type EnvPart } from './envGeo';
import { capsule, cyl, roundedBox, sphere, torus, type V3 } from './toon';
import { TABLE_TOP, type KitItem, type LampKind, type SeatKit } from './hall';
import type { PageHook } from './character';

export const BOOKS = ['#b6584a', '#3f6b8a', '#d9a441', '#4f7d5c', '#8a6aa8', '#c97a4a', '#2f4a6b', '#e2c79a', '#6e3d5c', '#3f8f8a', '#a8473f', '#d6cbb0'];
const BRASS = '#c99a4c';
const WOOD = '#b0703f';
const WOOD_DARK = '#7a4a2c';

export interface LampInfo {
  /** Bulb position relative to the lamp base (lamp faces +z). */
  bulb: THREE.Vector3;
  /** Fake light reach and glow sprite size. */
  reach: number;
  glow: number;
}

const halfDome = (r: number, ws = 20, hs = 8) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2);
const openCyl = (rt: number, rb: number, h: number, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, true);
const lathe = (pts: [number, number][], seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/**
 * Adds one lamp in lamp space (base on the table at the origin, head toward +z).
 * `emit` is the lamp index whose level lights the shade.
 */
export function buildLamp(kind: LampKind, b: EnvBuilder, emit: number): LampInfo {
  const glow = (g: number): EnvPart => ({ emit, glow: g });
  const inner = '#fff1cf';
  switch (kind) {
    case 'banker': {
      b.add(roundedBox(0.22, 0.03, 0.13, 0.012, 2), BRASS, { p: [0, 0.015, -0.02] });
      b.add(cyl(0.011, 0.011, 0.25, 8), BRASS, { p: [0, 0.155, -0.04] });
      b.add(cyl(0.008, 0.008, 0.07, 6), BRASS, { p: [0, 0.27, -0.01], r: [0.9, 0, 0] });
      const sh = new THREE.CylinderGeometry(0.078, 0.078, 0.3, 18, 1, true, -Math.PI / 2, Math.PI);
      b.add(sh, '#2f7d4c', { p: [0, 0.3, 0.02], r: [0, 0, Math.PI / 2] }, glow(0.55));
      b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.29, 16, 1, true, Math.PI / 2, Math.PI), inner, { p: [0, 0.3, 0.02], r: [0, 0, Math.PI / 2] }, glow(1.4));
      for (const sd of [-1, 1]) b.add(torus(0.078, 0.008, Math.PI, 4, 14), BRASS, { p: [sd * 0.15, 0.3, 0.02], r: [0, Math.PI / 2, 0] });
      b.add(cyl(0.022, 0.022, 0.12, 10), '#fff6dc', { p: [0, 0.285, 0.02], r: [0, 0, Math.PI / 2] }, glow(1.6));
      return { bulb: new THREE.Vector3(0, 0.27, 0.03), reach: 1.65, glow: 0.62 };
    }
    case 'swing': {
      b.add(cyl(0.07, 0.078, 0.026, 18), BRASS, { p: [0, 0.013, -0.04] });
      const elbow: V3 = [0, 0.33, -0.1], head: V3 = [0, 0.37, 0.17];
      const seg = (a: V3, c: V3) => {
        const va = new THREE.Vector3(...a), vc = new THREE.Vector3(...c), mid = va.clone().add(vc).multiplyScalar(0.5);
        const d = vc.clone().sub(va);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
        const e = new THREE.Euler().setFromQuaternion(q);
        b.add(cyl(0.009, 0.009, d.length(), 8), BRASS, { p: mid.toArray() as V3, r: [e.x, e.y, e.z] });
      };
      seg([0, 0.02, -0.04], elbow);
      seg(elbow, head);
      b.add(sphere(0.018, 8, 6), BRASS, { p: elbow });
      b.add(sphere(0.016, 8, 6), BRASS, { p: [0, 0.03, -0.04] });
      b.add(openCyl(0.032, 0.075, 0.11, 18), '#efe2c4', { p: [head[0], head[1] - 0.04, head[2]], r: [0.25, 0, 0] }, glow(0.5));
      b.add(openCyl(0.028, 0.07, 0.1, 16), inner, { p: [head[0], head[1] - 0.04, head[2]], r: [0.25, 0, 0] }, glow(1.5));
      b.add(cyl(0.034, 0.034, 0.02, 12), BRASS, { p: [head[0], head[1] + 0.02, head[2] - 0.015], r: [0.25, 0, 0] });
      return { bulb: new THREE.Vector3(0, 0.31, 0.18), reach: 1.55, glow: 0.5 };
    }
    case 'amber': {
      b.add(cyl(0.06, 0.072, 0.022, 18), BRASS, { p: [0, 0.011, 0] });
      b.add(cyl(0.012, 0.016, 0.17, 10), BRASS, { p: [0, 0.1, 0] });
      b.add(halfDome(0.135, 22, 9), '#e8892a', { p: [0, 0.19, 0], s: [1, 0.78, 1] }, glow(1.25));
      b.add(cyl(0.133, 0.133, 0.008, 22), '#ffd27a', { p: [0, 0.19, 0] }, glow(1.5));
      b.add(sphere(0.016, 8, 6), BRASS, { p: [0, 0.296, 0] });
      return { bulb: new THREE.Vector3(0, 0.2, 0), reach: 1.8, glow: 0.75 };
    }
    case 'drum': {
      b.add(lathe([[0, 0], [0.05, 0], [0.068, 0.03], [0.072, 0.07], [0.055, 0.13], [0.022, 0.16], [0.016, 0.17], [0, 0.17]], 18), '#eadfca', { p: [0, 0, 0] });
      b.add(cyl(0.008, 0.008, 0.08, 6), BRASS, { p: [0, 0.2, 0] });
      b.add(openCyl(0.075, 0.118, 0.14, 22), '#f2e4c4', { p: [0, 0.27, 0] }, glow(0.95));
      b.add(openCyl(0.071, 0.113, 0.138, 20), inner, { p: [0, 0.27, 0] }, glow(1.2));
      b.add(torus(0.075, 0.004, Math.PI * 2, 4, 20), '#d8c7a2', { p: [0, 0.34, 0], r: [Math.PI / 2, 0, 0] });
      return { bulb: new THREE.Vector3(0, 0.25, 0), reach: 1.7, glow: 0.62 };
    }
    case 'cone': {
      b.add(cyl(0.06, 0.066, 0.02, 18), '#56606b', { p: [0, 0.01, 0] });
      b.add(cyl(0.008, 0.008, 0.28, 6), '#56606b', { p: [0, 0.15, 0] });
      b.add(openCyl(0.022, 0.105, 0.12, 20), '#5c6772', { p: [0, 0.31, 0] });
      b.add(openCyl(0.019, 0.1, 0.115, 18), inner, { p: [0, 0.31, 0] }, glow(1.4));
      b.add(cyl(0.024, 0.024, 0.02, 10), '#4a535d', { p: [0, 0.375, 0] });
      return { bulb: new THREE.Vector3(0, 0.28, 0), reach: 1.5, glow: 0.48 };
    }
    case 'gooseneck': {
      const BLACK = '#2c2d33';
      b.add(cyl(0.068, 0.074, 0.024, 18), BLACK, { p: [0, 0.012, -0.06] });
      const curve = new THREE.CatmullRomCurve3([[0, 0.02, -0.06], [0, 0.2, -0.08], [0, 0.4, -0.02], [0, 0.43, 0.09], [0, 0.39, 0.18]].map((p) => new THREE.Vector3(...p)));
      b.add(new THREE.TubeGeometry(curve, 20, 0.011, 6), BLACK);
      b.add(halfDome(0.07, 16, 6), BLACK, { p: [0, 0.37, 0.19], r: [0.35, 0, 0], s: [1, 1.15, 1] });
      b.add(cyl(0.064, 0.064, 0.006, 16), inner, { p: [0, 0.37, 0.19], r: [0.35, 0, 0] }, glow(1.6));
      return { bulb: new THREE.Vector3(0, 0.35, 0.2), reach: 1.45, glow: 0.45 };
    }
    case 'mushroom': {
      b.add(lathe([[0, 0], [0.058, 0], [0.062, 0.02], [0.042, 0.05], [0.03, 0.1], [0.036, 0.15], [0.026, 0.18], [0, 0.18]], 18), '#3f8f8a');
      b.add(halfDome(0.115, 22, 9), '#f2e6cf', { p: [0, 0.18, 0], s: [1, 0.85, 1] }, glow(1.0));
      b.add(cyl(0.113, 0.113, 0.006, 20), inner, { p: [0, 0.18, 0] }, glow(1.4));
      return { bulb: new THREE.Vector3(0, 0.18, 0), reach: 1.6, glow: 0.6 };
    }
    case 'dome': {
      b.add(cyl(0.055, 0.062, 0.02, 16), '#55697a', { p: [0, 0.01, 0] });
      b.add(cyl(0.012, 0.012, 0.11, 8), '#55697a', { p: [0, 0.07, 0] });
      b.add(halfDome(0.085, 18, 8), '#5d7385', { p: [0, 0.12, 0], s: [1, 0.95, 1] });
      b.add(cyl(0.083, 0.083, 0.006, 18), inner, { p: [0, 0.12, 0] }, glow(1.5));
      b.add(sphere(0.014, 8, 6), '#55697a', { p: [0, 0.205, 0] });
      return { bulb: new THREE.Vector3(0, 0.11, 0), reach: 1.4, glow: 0.42 };
    }
  }
}

// ---- seat kits ----------------------------------------------------------------

export interface KitBuild {
  geo: THREE.BufferGeometry;
  /** Reading book (read seats): a group so it can be lifted, with the turnable page. */
  book: THREE.Group | null;
  page: PageHook | null;
  /** Mug home in seat space. */
  mug: THREE.Vector3;
  mugYaw: number;
}

function bottle(b: EnvBuilder, x: number, z: number, col: string) {
  const y = TABLE_TOP;
  b.add(cyl(0.042, 0.042, 0.21, 14), col, { p: [x, y + 0.105, z] });
  b.add(cyl(0.032, 0.04, 0.025, 12), col, { p: [x, y + 0.222, z] });
  b.add(cyl(0.03, 0.03, 0.04, 12), '#e9e4da', { p: [x, y + 0.254, z] });
}

function closedBook(b: EnvBuilder, w: number, t: number, d: number, col: string, p: V3, ry = 0) {
  b.add(roundedBox(w, t, d, 0.008, 1), col, { p, r: [0, ry, 0] });
  b.add(new THREE.BoxGeometry(w - 0.02, t - 0.008, 0.006), '#f3ead7', { p: [p[0] + Math.sin(ry) * (d / 2), p[1], p[2] + Math.cos(ry) * (d / 2)], r: [0, ry, 0] });
}

const ITEM_SPOTS: [number, number][] = [[0.42, 0.62], [0.34, 0.88], [-0.18, 0.9], [-0.44, 0.48]];

/** One seat's belongings in seat space (character faces +z, table edge at z ≈ 0.3). */
export function buildKit(slot: number, kit: SeatKit, rand: () => number): KitBuild {
  const b = new EnvBuilder();
  const y = TABLE_TOP;
  const cover = BOOKS[(slot * 5 + 2) % BOOKS.length];
  let book: THREE.Group | null = null;
  let page: PageHook | null = null;
  const tilt = (rand() - 0.5) * 0.16;
  if (kit.act === 'write') {
    b.add(roundedBox(0.44, 0.02, 0.31, 0.01, 1), cover, { p: [0, y + 0.01, 0.52], r: [0, tilt, 0] });
    b.add(roundedBox(0.41, 0.012, 0.28, 0.006, 1), '#f6efe0', { p: [0, y + 0.026, 0.52], r: [0, tilt, 0] });
    b.add(new THREE.BoxGeometry(0.004, 0.004, 0.27), '#d8cbb0', { p: [0, y + 0.033, 0.52], r: [0, tilt, 0] });
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const at = (lx: number, lz: number): V3 => [lx * c + lz * s, y + 0.033, -lx * s + lz * c + 0.52];
    for (let l = 0; l < 5; l++) b.add(new THREE.BoxGeometry(0.15 - rand() * 0.05, 0.002, 0.007), '#8d9ab6', { p: at(-0.1, -0.08 + l * 0.04), r: [0, tilt, 0] });
    for (let l = 0; l < 3; l++) b.add(new THREE.BoxGeometry(0.12, 0.002, 0.007), '#8d9ab6', { p: at(0.11, -0.08 + l * 0.04), r: [0, tilt, 0] });
  } else if (kit.act === 'read') {
    book = new THREE.Group();
    book.position.set(0, y, 0.5);
    const bb = new EnvBuilder();
    bb.add(roundedBox(0.46, 0.02, 0.3, 0.01, 1), cover, { p: [0, 0.01, 0] });
    for (const sd of [-1, 1]) bb.add(roundedBox(0.2, 0.03, 0.27, 0.01, 1), '#f3ead7', { p: [sd * 0.105, 0.03, 0], r: [0, 0, sd * -0.08] });
    for (let l = 0; l < 6; l++) bb.add(new THREE.BoxGeometry(0.13 - (l % 2) * 0.03, 0.002, 0.007), '#b9ac92', { p: [0.11, 0.047, -0.09 + l * 0.035], r: [0, 0, -0.08] });
    for (let l = 0; l < 6; l++) bb.add(new THREE.BoxGeometry(0.12 - (l % 3) * 0.02, 0.002, 0.007), '#b9ac92', { p: [-0.11, 0.047, -0.09 + l * 0.035], r: [0, 0, 0.08] });
    book.userData.geo = bb.build();
    // The reader's right-hand page (−x, they face +z) lifts and turns over the spine.
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.055, 0);
    pivot.rotation.z = 0.08;
    pivot.userData.geo = new EnvBuilder().add(new THREE.BoxGeometry(0.19, 0.004, 0.26), '#fbf4e4', { p: [-0.095, 0, 0] }).build();
    book.add(pivot);
    page = { pivot, axis: 'z', from: 0.08, to: -Math.PI - 0.08, grab: new THREE.Vector3(-0.175, 0, -0.1), lift: new THREE.Vector3(0, 0.035, 0), side: -1 };
  } else {
    const lap = slot % 2 ? '#c9ccd6' : '#3a3f55';
    b.add(roundedBox(0.4, 0.025, 0.27, 0.015, 1), lap, { p: [0, y + 0.013, 0.5] });
    b.add(roundedBox(0.34, 0.004, 0.13, 0.002, 1), slot % 2 ? '#9a9eaa' : '#262a3a', { p: [0, y + 0.027, 0.47] });
    b.add(roundedBox(0.11, 0.003, 0.07, 0.002, 1), slot % 2 ? '#b4b8c4' : '#2e3346', { p: [0, y + 0.027, 0.585] });
    // Lid hinged at the back edge of the base, leaning away from the student.
    const LID = 0.3, ca = Math.cos(LID), sa = Math.sin(LID);
    const lid = (dx: number, ly: number, lz: number): V3 => [dx, y + 0.025 + ly * ca - lz * sa, 0.635 + ly * sa + lz * ca];
    b.add(roundedBox(0.4, 0.27, 0.02, 0.015, 1), lap, { p: lid(0, 0.135, 0), r: [LID, 0, 0] });
    b.add(new THREE.PlaneGeometry(0.36, 0.23), '#9fd2ec', { p: lid(0, 0.14, -0.0105), r: [LID, Math.PI, 0] }, { emit: slot, glow: 0.75 });
    for (let l = 0; l < 5; l++) b.add(new THREE.PlaneGeometry(0.08 + rand() * 0.16, 0.012), l % 2 ? '#5d97bf' : '#f2b45a', { p: lid(0.06 - rand() * 0.08, 0.205 - l * 0.03, -0.012), r: [LID, Math.PI, 0] }, { emit: slot, glow: 0.9 });
  }

  // Mug: writers lift it with the free (left, −x) hand, others with the right.
  const mug = new THREE.Vector3(kit.act === 'write' ? -0.3 : 0.32, y, 0.42);
  const spots = ITEM_SPOTS.filter(([x, z]) => Math.hypot(x - mug.x, z - mug.z) > 0.2);
  kit.items.forEach((it, k) => {
    const [x, z] = spots[k % spots.length];
    addItem(b, it, x, z, slot, rand);
  });
  return { geo: b.build(), book, page, mug, mugYaw: mug.x < 0 ? Math.PI : 0 };
}

function addItem(b: EnvBuilder, it: KitItem, x: number, z: number, slot: number, rand: () => number) {
  const y = TABLE_TOP;
  const ry = (rand() - 0.5) * 0.8;
  switch (it) {
    case 'bottle': case 'bottleBlue': bottle(b, x, z, '#7fb2d6'); break;
    case 'bottleGrey': bottle(b, x, z, '#8e969f'); break;
    case 'bottleCream': bottle(b, x, z, '#ece4d2'); break;
    case 'mug': break;
    case 'sticky':
      ['#ffe066', '#ffadc6', '#a5d8ff'].slice(0, 2 + (slot % 2)).forEach((c, k) => b.add(roundedBox(0.085, 0.01, 0.085, 0.003, 1), c, { p: [x + k * 0.05, y + 0.005 + k * 0.006, z - k * 0.03], r: [0, ry + k * 0.3, 0] }));
      break;
    case 'phone':
      b.add(roundedBox(0.08, 0.012, 0.155, 0.012, 2), '#2a2f45', { p: [x, y + 0.006, z], r: [0, ry, 0] });
      b.add(roundedBox(0.07, 0.003, 0.135, 0.008, 1), '#3b4560', { p: [x, y + 0.013, z], r: [0, ry, 0] });
      break;
    case 'pencilCase':
      b.add(roundedBox(0.27, 0.11, 0.14, 0.03, 2), '#4c4a3a', { p: [x, y + 0.055, z], r: [0, ry, 0] });
      b.add(roundedBox(0.272, 0.012, 0.142, 0.006, 1), '#3c3a2d', { p: [x, y + 0.08, z], r: [0, ry, 0] });
      b.add(torus(0.035, 0.008, Math.PI, 4, 10), '#6b6550', { p: [x, y + 0.11, z], r: [0, ry, 0] });
      break;
    case 'pencil':
      b.add(cyl(0.008, 0.008, 0.16, 6), '#f2b45a', { p: [x, y + 0.008, z], r: [Math.PI / 2, ry, 0] });
      break;
    case 'bookStack': {
      let h = y;
      const n = 2 + Math.floor(rand() * 2);
      for (let s = 0; s < n; s++) {
        const t = 0.035 + rand() * 0.025;
        closedBook(b, 0.24 - s * 0.02, t, 0.17, BOOKS[(slot * 3 + s * 4) % BOOKS.length], [x, h + t / 2, z], ry + (rand() - 0.5) * 0.4);
        h += t;
      }
      break;
    }
    case 'notepad':
      closedBook(b, 0.15, 0.018, 0.21, ['#c96f6a', '#3f6b8a', '#d9a441'][slot % 3], [x, y + 0.009, z], ry);
      break;
  }
}

/** Mug in its own space: handle toward +x. */
export function mugGeo(): THREE.BufferGeometry {
  return new EnvBuilder()
    .add(cyl(0.055, 0.05, 0.11, 16), '#ffffff', { p: [0, 0.055, 0] })
    .add(torus(0.032, 0.011, Math.PI * 2, 6, 12), '#ffffff', { p: [0.06, 0.06, 0] })
    .add(cyl(0.047, 0.047, 0.004, 14), '#4a2a1c', { p: [0, 0.1, 0] })
    .build();
}

/** Wooden ladder-back chair, origin on the floor under the seat centre, front toward +z. */
export function chairGeo(cushion: string): THREE.BufferGeometry {
  const b = new EnvBuilder();
  b.add(roundedBox(0.5, 0.055, 0.46, 0.025, 2), WOOD, { p: [0, 0.205, 0.02] });
  b.add(roundedBox(0.44, 0.05, 0.4, 0.024, 2), cushion, { p: [0, 0.252, 0.03] });
  for (const [cx, cz] of [[-0.2, -0.17], [0.2, -0.17], [-0.2, 0.2], [0.2, 0.2]]) b.add(roundedBox(0.045, 0.2, 0.045, 0.012, 1), WOOD_DARK, { p: [cx, 0.1, cz] }, { ao: 0.3 });
  b.add(roundedBox(0.4, 0.03, 0.03, 0.01, 1), WOOD_DARK, { p: [0, 0.07, 0.2] });
  b.add(roundedBox(0.4, 0.03, 0.03, 0.01, 1), WOOD_DARK, { p: [0, 0.07, -0.17] });
  for (const cx of [-0.205, 0.205]) b.add(roundedBox(0.048, 0.42, 0.048, 0.014, 1), WOOD, { p: [cx, 0.42, -0.2] });
  b.add(roundedBox(0.5, 0.11, 0.045, 0.02, 2), WOOD, { p: [0, 0.6, -0.2] });
  b.add(roundedBox(0.44, 0.05, 0.035, 0.015, 1), WOOD, { p: [0, 0.44, -0.2] });
  return b.build();
}

/** Floor backpack leaning on something behind it (−z). */
export function backpackGeo(col: string): THREE.BufferGeometry {
  const b = new EnvBuilder();
  const dark = '#' + new THREE.Color(col).multiplyScalar(0.8).getHexString();
  b.add(roundedBox(0.3, 0.36, 0.15, 0.06, 2), col, { p: [0, 0.18, 0] }, { ao: 0.35 });
  b.add(roundedBox(0.31, 0.14, 0.16, 0.05, 2), dark, { p: [0, 0.3, 0.004] });
  b.add(roundedBox(0.2, 0.13, 0.06, 0.03, 1), dark, { p: [0, 0.12, 0.09] });
  b.add(roundedBox(0.03, 0.08, 0.012, 0.005, 1), '#c4a26a', { p: [0, 0.26, 0.085] });
  b.add(torus(0.045, 0.012, Math.PI, 4, 10), dark, { p: [0, 0.36, 0] });
  for (const sd of [-1, 1]) b.add(capsule(0.016, 0.22), dark, { p: [sd * 0.09, 0.2, -0.085] });
  return b.build();
}
