// The study hall diorama: static geometry merged into a handful of meshes,
// per-seat prop sets, the armchair reader and the sleeping cat.
import * as THREE from 'three';
import { avatar } from '../lib/avatars';
import { Character, CHAIR_ROOT_Y, type FocusAct } from './character';
import {
  GeoBuilder, blobShadow, capsule, cyl, glowSprite, lightPool, materials, rng, roundedBox, sphere, toonMesh, torus,
} from './toon';
import { rainWindowMaterial } from './ambient';

export const TABLE_TOP = 0.69;
const SEAT_X = [-2.2, -1.1, 0, 1.1, 2.2];
const SEAT_Z = 0.95;
const FOCUS_ACTS: FocusAct[] = ['write', 'read', 'type', 'read', 'write', 'type', 'write', 'read', 'type', 'write'];
const CUSHIONS = ['#d9a441', '#c96f6a', '#3f8f8a', '#e7d9bd', '#8a6aa8', '#d4844e', '#5d8fb8', '#b9c27a', '#c75b78', '#4a9b7f'];
const MUGS = ['#f4efe4', '#3f8f8a', '#d97a76', '#e3a948', '#33507a', '#f4efe4', '#9a86c4', '#c96f4a', '#7fa38a', '#2f3d4f'];
const BOOKS = ['#b6584a', '#3f6b8a', '#d9a441', '#4f7d5c', '#8a6aa8', '#c97a4a', '#2f4a6b', '#e2c79a', '#6e3d5c', '#3f8f8a', '#a8473f', '#d6cbb0'];
const WOOD = '#9a6440';
const WOOD_DARK = '#6e4430';

export interface SeatSlot {
  index: number;
  anchor: THREE.Group; // positioned/rotated at the seat, character faces +Z
  props: THREE.Group;
  tableMug: THREE.Mesh;
  handMug: THREE.Mesh;
  page: THREE.Object3D | null;
  focusAct: FocusAct;
  emptyGlow: THREE.Mesh;
  meRing: THREE.Mesh;
  character: Character | null;
  mugWorld: THREE.Vector3;
  headWorld: THREE.Vector3;
}

export interface RoomBuild {
  group: THREE.Group;
  seats: SeatSlot[];
  lamps: { light: THREE.PointLight; glow: THREE.Sprite; base: number }[];
  shadowCasters: THREE.Object3D[];
  window: THREE.ShaderMaterial;
  update(now: number, dt: number): void;
  dispose(): void;
}

function mugGeo(color: string): THREE.BufferGeometry {
  return new GeoBuilder()
    .add(cyl(0.055, 0.05, 0.11, 14), color, { p: [0, 0.055, 0] })
    .add(torus(0.032, 0.011, Math.PI * 2, 6, 12), color, { p: [0.06, 0.06, 0], r: [0, 0, 0] })
    .add(cyl(0.047, 0.047, 0.004, 12), '#5a3424', { p: [0, 0.1, 0] }, 0)
    .build();
}

function book(b: GeoBuilder, w: number, h: number, d: number, color: string, xf: { p: [number, number, number]; r?: [number, number, number] }) {
  b.add(roundedBox(w, h, d, 0.012, 1), color, xf);
}

function seatProps(i: number, act: FocusAct, r: () => number): { geo: THREE.BufferGeometry; glow: THREE.BufferGeometry | null; page: THREE.Mesh | null; pagePivot: THREE.Group | null } {
  const b = new GeoBuilder();
  const u = new GeoBuilder();
  const y = TABLE_TOP;
  let pagePivot: THREE.Group | null = null;
  let page: THREE.Mesh | null = null;
  const cover = BOOKS[(i * 5 + 2) % BOOKS.length];
  if (act === 'write') {
    b.add(roundedBox(0.44, 0.02, 0.31, 0.01, 1), cover, { p: [0, y + 0.01, 0.52], r: [0, (r() - 0.5) * 0.2, 0] });
    b.add(roundedBox(0.41, 0.012, 0.28, 0.006, 1), '#f6efe0', { p: [0, y + 0.026, 0.52], r: [0, (r() - 0.5) * 0.2, 0] });
    for (let l = 0; l < 4; l++) b.add(new THREE.BoxGeometry(0.15 - r() * 0.04, 0.002, 0.008), '#9aa6c0', { p: [-0.1, y + 0.033, 0.45 + l * 0.04] }, 0);
    for (let l = 0; l < 3; l++) b.add(new THREE.BoxGeometry(0.12, 0.002, 0.008), '#9aa6c0', { p: [0.11, y + 0.033, 0.45 + l * 0.04] }, 0);
  } else if (act === 'read') {
    b.add(roundedBox(0.46, 0.02, 0.3, 0.01, 1), cover, { p: [0, y + 0.01, 0.5] });
    [-1, 1].forEach((sd) => b.add(roundedBox(0.2, 0.03, 0.27, 0.01, 1), '#f3ead7', { p: [sd * 0.105, y + 0.03, 0.5], r: [0, 0, sd * -0.08] }));
    b.add(new THREE.BoxGeometry(0.12, 0.002, 0.008), '#b0a48c', { p: [-0.11, y + 0.05, 0.44] }, 0);
    pagePivot = new THREE.Group();
    pagePivot.position.set(0, y + 0.045, 0.5);
    const pg = new GeoBuilder().add(new THREE.BoxGeometry(0.19, 0.006, 0.26), '#fbf4e4', { p: [0.095, 0, 0] }).build();
    page = new THREE.Mesh(pg, materials().toon);
    pagePivot.add(page);
  } else {
    const lap = i % 2 ? '#c9ccd6' : '#3a3f55';
    b.add(roundedBox(0.4, 0.025, 0.27, 0.015, 1), lap, { p: [0, y + 0.013, 0.5] });
    b.add(roundedBox(0.34, 0.004, 0.13, 0.002, 1), i % 2 ? '#9a9eaa' : '#262a3a', { p: [0, y + 0.027, 0.47] }, 0);
    b.add(roundedBox(0.4, 0.27, 0.02, 0.015, 1), lap, { p: [0, y + 0.14, 0.66], r: [-0.25, 0, 0] });
    b.add(sphere(0.02, 6, 5), CUSHIONS[(i + 3) % 10], { p: [0, y + 0.15, 0.674], s: [1, 1, 0.3] }, 0);
    u.add(new THREE.PlaneGeometry(0.36, 0.23), '#a9d8ee', { p: [0, y + 0.145, 0.646], r: [-0.25, Math.PI, 0] }, 0);
    for (let l = 0; l < 5; l++) u.add(new THREE.PlaneGeometry(0.08 + r() * 0.16, 0.012), l % 2 ? '#6aa7c9' : '#f2b45a', { p: [0.06 - r() * 0.08, y + 0.21 - l * 0.03, 0.638 - l * 0.007], r: [-0.25, Math.PI, 0] }, 0);
  }
  // Belongings that make each seat different.
  const extras = [(i * 3) % 7, (i * 3 + 2) % 7, (i + 5) % 7];
  const side = i % 2 ? 1 : -1;
  extras.slice(0, 2 + (i % 2)).forEach((e, k) => {
    const x = (k % 2 ? -side : side) * (0.36 + k * 0.06);
    const z = 0.5 + (k === 2 ? 0.25 : 0.05 * k);
    switch (e) {
      case 0: { // book stack
        let h = y;
        const n = 1 + Math.floor(r() * 3);
        for (let s = 0; s < n; s++) { const t = 0.04 + r() * 0.03; book(b, 0.24, t, 0.17, BOOKS[(i + s * 4) % BOOKS.length], { p: [x, h + t / 2, z + 0.15], r: [0, (r() - 0.5) * 0.5, 0] }); h += t; }
        break;
      }
      case 1: // water bottle
        b.add(cyl(0.045, 0.045, 0.24, 12), ['#7fd1c1', '#f2b45a', '#d97a76', '#9a86c4'][i % 4], { p: [x, y + 0.12, z + 0.12] });
        b.add(cyl(0.035, 0.04, 0.05, 10), '#f4efe4', { p: [x, y + 0.265, z + 0.12] });
        break;
      case 2: // highlighters
        ['#ffe066', '#ff8fab', '#8ce99a'].forEach((c, h) => b.add(cyl(0.014, 0.014, 0.13, 6), c, { p: [x + h * 0.035, y + 0.014, z], r: [Math.PI / 2, 0.3 + h * 0.15, 0] }, 0));
        break;
      case 3: // flashcards
        for (let s = 0; s < 4; s++) b.add(new THREE.BoxGeometry(0.13, 0.006, 0.09), s % 2 ? '#f6efe0' : '#ffd8a8', { p: [x, y + 0.004 + s * 0.007, z], r: [0, s * 0.18, 0] }, s === 3 ? 1 : 0);
        break;
      case 4: // succulent
        b.add(cyl(0.06, 0.045, 0.08, 12), '#d4844e', { p: [x, y + 0.04, z + 0.15] });
        for (let s = 0; s < 5; s++) b.add(sphere(0.035, 8, 6), '#6fae7a', { p: [x + Math.cos(s * 1.3) * 0.03, y + 0.1 + (s % 2) * 0.02, z + 0.15 + Math.sin(s * 1.3) * 0.03], s: [1, 1.4, 1] });
        break;
      case 5: // snack plate
        b.add(cyl(0.09, 0.07, 0.015, 16), '#f4efe4', { p: [x, y + 0.008, z] });
        [0, 1].forEach((s) => b.add(cyl(0.035, 0.035, 0.014, 12), '#c98a4a', { p: [x + s * 0.04 - 0.02, y + 0.022 + s * 0.006, z], r: [0.2 * s, 0, 0] }));
        break;
      default: // sticky notes + pen
        b.add(new THREE.BoxGeometry(0.09, 0.012, 0.09), ['#ffe066', '#ffadc6', '#a5d8ff'][i % 3], { p: [x, y + 0.006, z], r: [0, 0.3, 0] });
        b.add(cyl(0.01, 0.01, 0.14, 6), '#33507a', { p: [x + 0.08, y + 0.01, z + 0.04], r: [Math.PI / 2, 0.8, 0] }, 0);
    }
  });
  return { geo: b.build(), glow: u.empty ? null : u.build(), page, pagePivot };
}

function staticRoom(): { geo: THREE.BufferGeometry; glowGeo: THREE.BufferGeometry } {
  const b = new GeoBuilder();
  const u = new GeoBuilder();
  const r = rng(42);
  // Floor slab + planks.
  b.add(roundedBox(12, 0.3, 9, 0.06), '#5b3b2c', { p: [0, -0.15, 0] });
  for (let k = 0; k < 18; k++) {
    const shadeK = 0.86 + r() * 0.18;
    const c = new THREE.Color('#8f5d3f').multiplyScalar(shadeK);
    b.add(new THREE.BoxGeometry(11.9, 0.012, 0.47), '#' + c.getHexString(), { p: [0, 0.006, -4.25 + k * 0.5] }, 0);
  }
  // Back wall with arched window opening.
  const W = 6, H = 5.4, sill = 0.95, ww = 1.55, straight = 2.15;
  const wall = new THREE.Shape();
  wall.moveTo(-W, 0); wall.lineTo(W, 0); wall.lineTo(W, H); wall.lineTo(-W, H); wall.lineTo(-W, 0);
  const arch = (s: THREE.Path | THREE.Shape, w: number, y0: number) => {
    s.moveTo(-w, y0); s.lineTo(w, y0); s.lineTo(w, y0 + straight); s.absarc(0, y0 + straight, w, 0, Math.PI, false); s.lineTo(-w, y0);
  };
  const hole = new THREE.Path(); arch(hole, ww, sill); wall.holes.push(hole);
  b.add(new THREE.ExtrudeGeometry(wall, { depth: 0.3, bevelEnabled: false, curveSegments: 20 }), '#2a3a5e', { p: [0, 0, -4.8] });
  // Left wall.
  b.add(new THREE.BoxGeometry(0.3, H, 9.3), '#26365a', { p: [-6.15, H / 2, -0.15] });
  // Wainscot and trims.
  b.add(new THREE.BoxGeometry(11.9, 1.0, 0.06), '#1f4f57', { p: [0, 0.5, -4.47] });
  b.add(new THREE.BoxGeometry(0.06, 1.0, 8.95), '#1f4f57', { p: [-5.97, 0.5, 0] });
  b.add(roundedBox(12, 0.07, 0.12, 0.02), WOOD, { p: [0, 1.02, -4.44] });
  b.add(roundedBox(0.12, 0.07, 9, 0.02), WOOD, { p: [-5.94, 1.02, 0] });
  b.add(roundedBox(12, 0.12, 0.1, 0.02), WOOD_DARK, { p: [0, 0.06, -4.45] });
  b.add(roundedBox(0.1, 0.12, 9, 0.02), WOOD_DARK, { p: [-5.95, 0.06, 0] });
  // Window frame ring + mullions + sill.
  const ring = new THREE.Shape(); arch(ring, ww + 0.14, sill - 0.12);
  const inner = new THREE.Path(); arch(inner, ww, sill); ring.holes.push(inner);
  b.add(new THREE.ExtrudeGeometry(ring, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 20 }), '#d8c4a0', { p: [0, 0, -4.53] });
  b.add(roundedBox(0.07, straight + ww, 0.06, 0.02), '#d8c4a0', { p: [0, sill + (straight + ww) / 2, -4.62] });
  b.add(roundedBox(ww * 2, 0.07, 0.06, 0.02), '#d8c4a0', { p: [0, sill + straight, -4.62] });
  b.add(roundedBox(ww * 2, 0.05, 0.05, 0.02), '#d8c4a0', { p: [0, sill + straight * 0.5, -4.62] });
  b.add(roundedBox(ww * 2 + 0.5, 0.1, 0.42, 0.04), '#e2cfa8', { p: [0, sill - 0.05, -4.35] });
  // Curtains, gathered at the sides.
  [-1, 1].forEach((sd) => {
    for (let f = 0; f < 3; f++) b.add(capsule(0.11, 3.1), '#c9b28c', { p: [sd * (ww + 0.35 + f * 0.15), 2.55, -4.38 + f * 0.02], r: [0, 0, sd * 0.03 * f] });
    b.add(torus(0.2, 0.03), '#b6584a', { p: [sd * (ww + 0.5), 2.0, -4.3], r: [Math.PI / 2, 0, 0], s: [1.4, 1, 1] });
  });
  b.add(cyl(0.035, 0.035, ww * 2 + 1.6, 8), WOOD_DARK, { p: [0, 4.15, -4.36], r: [0, 0, Math.PI / 2] });
  // Sill plants.
  [-1.0, 0.95].forEach((x, k) => {
    b.add(cyl(0.12, 0.09, 0.18, 12), k ? '#3f8f8a' : '#d4844e', { p: [x, sill + 0.09, -4.3] });
    for (let s = 0; s < 7; s++) b.add(sphere(0.08, 8, 6), '#5f9e6e', { p: [x + Math.cos(s) * 0.09, sill + 0.24 + (s % 3) * 0.06, -4.3 + Math.sin(s) * 0.07], s: [1, 1.5, 0.8], r: [0, 0, Math.cos(s) * 0.5] });
  });
  // Rug.
  b.add(roundedBox(7.8, 0.03, 3.9, 0.012, 2), '#e1c27a', { p: [0, 0.015, 0] }, 0);
  b.add(roundedBox(7.5, 0.035, 3.6, 0.012, 2), '#2f7f7a', { p: [0, 0.02, 0] });
  b.add(roundedBox(7.0, 0.037, 3.1, 0.012, 2), '#3d9890', { p: [0, 0.022, 0] }, 0);
  b.add(roundedBox(6.6, 0.039, 2.7, 0.012, 2), '#2f7f7a', { p: [0, 0.024, 0] }, 0);
  for (let k = 0; k < 9; k++) b.add(sphere(0.07, 8, 4), '#e1c27a', { p: [-3.2 + k * 0.8, 0.04, 1.6], s: [1, 0.12, 1] }, 0);
  for (let k = 0; k < 9; k++) b.add(sphere(0.07, 8, 4), '#e1c27a', { p: [-3.2 + k * 0.8, 0.04, -1.6], s: [1, 0.12, 1] }, 0);
  // Long low table.
  b.add(roundedBox(5.8, 0.09, 1.3, 0.04), '#b97c4c', { p: [0, TABLE_TOP - 0.045, 0] });
  b.add(roundedBox(5.7, 0.05, 1.2, 0.02), '#8f5a36', { p: [0, TABLE_TOP - 0.11, 0] }, 0);
  [[-2.6, -0.5], [2.6, -0.5], [-2.6, 0.5], [2.6, 0.5], [0, -0.5], [0, 0.5]].forEach(([x, z]) => b.add(roundedBox(0.14, TABLE_TOP - 0.12, 0.14, 0.04), WOOD_DARK, { p: [x, (TABLE_TOP - 0.12) / 2, z] }));
  // Table lamps (shade glow is unlit).
  [-1.65, 1.65].forEach((x) => {
    b.add(cyl(0.12, 0.14, 0.04, 16), '#e7d9bd', { p: [x, TABLE_TOP + 0.02, 0] });
    b.add(cyl(0.02, 0.02, 0.32, 8), '#e7d9bd', { p: [x, TABLE_TOP + 0.18, 0] });
    u.add(new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#ffcf86', { p: [x, TABLE_TOP + 0.3, 0], s: [1, 0.85, 1] }, 1);
    u.add(cyl(0.199, 0.199, 0.01, 18), '#fff0c8', { p: [x, TABLE_TOP + 0.3, 0] }, 0);
  });
  // Bookshelf on the left wall.
  const sx = -5.55, sz0 = -3.7, sw = 2.9, sh = 2.7;
  b.add(roundedBox(0.42, sh, 0.08, 0.02), WOOD_DARK, { p: [sx, sh / 2, sz0] });
  b.add(roundedBox(0.42, sh, 0.08, 0.02), WOOD_DARK, { p: [sx, sh / 2, sz0 + sw] });
  b.add(new THREE.BoxGeometry(0.04, sh, sw), '#4a3027', { p: [sx - 0.19, sh / 2, sz0 + sw / 2] }, 0);
  for (let s = 0; s < 5; s++) {
    const yy = 0.08 + s * (sh - 0.1) / 4;
    b.add(roundedBox(0.44, 0.06, sw + 0.06, 0.02), WOOD, { p: [sx, yy, sz0 + sw / 2] });
    if (s === 4) break;
    let z = sz0 + 0.08;
    while (z < sz0 + sw - 0.2) {
      const t = 0.06 + r() * 0.06, hgt = 0.34 + r() * 0.18;
      const lean = r() < 0.12 && z > sz0 + 0.3 ? 0.25 : 0;
      if (r() < 0.08) { z += 0.18; continue; }
      book(b, 0.28, hgt, t, BOOKS[Math.floor(r() * BOOKS.length)], { p: [sx + 0.02, yy + 0.03 + hgt / 2, z + t / 2], r: [lean, 0, 0] });
      z += t + 0.012 + (lean ? 0.08 : 0);
    }
  }
  // Shelf-top plant + jar.
  b.add(cyl(0.13, 0.1, 0.2, 12), '#e7d9bd', { p: [sx, sh + 0.13, sz0 + 0.5] });
  for (let s = 0; s < 9; s++) b.add(capsule(0.04, 0.35), '#4f8f5e', { p: [sx + Math.cos(s * 0.7) * 0.12, sh + 0.12, sz0 + 0.5 + Math.sin(s * 0.7) * 0.12], r: [Math.sin(s * 0.7) * 1.4, 0, -Math.cos(s * 0.7) * 1.4] });
  b.add(cyl(0.09, 0.09, 0.22, 12), '#7fb3c9', { p: [sx, sh + 0.14, sz0 + 2.2] });
  // Big plant by the window.
  b.add(new THREE.LatheGeometry([[0, 0], [0.32, 0], [0.38, 0.5], [0.4, 0.55], [0, 0.55]].map(([x, y]) => new THREE.Vector2(x, y)), 18), '#c7653f', { p: [-3.0, 0, -3.85] });
  for (let s = 0; s < 14; s++) {
    const a = s * 2.4, h = 0.9 + (s % 5) * 0.25;
    b.add(sphere(0.22, 10, 6), s % 2 ? '#3f7d55' : '#5a9a64', { p: [-3.0 + Math.cos(a) * 0.4, h, -3.85 + Math.sin(a) * 0.3], r: [0, a, 0.6], s: [1.3, 0.35, 0.8] });
  }
  b.add(cyl(0.025, 0.03, 1.4, 6), '#3f6b3f', { p: [-3.0, 0.9, -3.85] }, 0);
  // Corkboard with notes.
  b.add(roundedBox(1.3, 0.9, 0.06, 0.03), '#c49a64', { p: [2.55, 2.75, -4.47] });
  b.add(roundedBox(1.18, 0.78, 0.065, 0.02), '#d9b07a', { p: [2.55, 2.75, -4.465] }, 0);
  ['#ffe066', '#ffadc6', '#a5d8ff', '#b2f2bb', '#ffd8a8'].forEach((c, k) => b.add(new THREE.BoxGeometry(0.2, 0.2, 0.01), c, { p: [2.1 + (k % 3) * 0.42, 2.95 - Math.floor(k / 3) * 0.38, -4.43], r: [0, 0, (r() - 0.5) * 0.3] }, 0));
  // Wall frames on the left wall.
  [[-1.2, 3.4, 0.7, 0.55, '#3f8f8a'], [0.2, 3.6, 0.5, 0.7, '#d9a441']].forEach(([z, y, w, h, c]) => {
    b.add(roundedBox(0.05, h as number, w as number, 0.015), '#e7d9bd', { p: [-5.96, y as number, z as number] });
    b.add(new THREE.BoxGeometry(0.02, (h as number) - 0.1, (w as number) - 0.1), c as string, { p: [-5.93, y as number, z as number] }, 0);
  });
  // Bed (back-right corner).
  const bx = 4.35, bz = -3.3;
  b.add(roundedBox(1.7, 0.32, 2.2, 0.06), WOOD, { p: [bx, 0.18, bz] });
  b.add(roundedBox(1.8, 1.1, 0.12, 0.05), WOOD_DARK, { p: [bx, 0.55, bz - 1.12] });
  b.add(roundedBox(1.6, 0.22, 2.05, 0.1), '#efe4cf', { p: [bx, 0.43, bz] });
  b.add(roundedBox(1.66, 0.14, 1.45, 0.07), '#4f6fa0', { p: [bx, 0.55, bz + 0.3] });
  b.add(roundedBox(1.68, 0.15, 0.32, 0.07), '#e3a948', { p: [bx, 0.56, bz + 0.6] });
  [-0.4, 0.4].forEach((x) => b.add(roundedBox(0.6, 0.16, 0.38, 0.08), '#f6efe0', { p: [bx + x, 0.62, bz - 0.78], r: [-0.25, 0, 0] }));
  // Armchair (front-left).
  const ac = new GeoBuilder();
  ac.add(roundedBox(1.15, 0.36, 1.0, 0.14), '#b85f45', { p: [0, 0.3, 0] });
  ac.add(roundedBox(1.15, 0.9, 0.28, 0.13), '#b85f45', { p: [0, 0.75, -0.42], r: [-0.12, 0, 0] });
  [-1, 1].forEach((sd) => ac.add(roundedBox(0.24, 0.42, 1.0, 0.11), '#a5523b', { p: [sd * 0.5, 0.6, 0] }));
  ac.add(roundedBox(0.8, 0.12, 0.78, 0.06), '#d0735a', { p: [0, 0.5, 0.06] });
  [[-0.45, -0.38], [0.45, -0.38], [-0.45, 0.38], [0.45, 0.38]].forEach(([x, z]) => ac.add(cyl(0.04, 0.03, 0.14, 8), WOOD_DARK, { p: [x, 0.07, z] }));
  b.add(ac.build(), null, { p: [-4.2, 0, 1.55], r: [0, 0.75, 0] });
  // Floor lamp by the armchair.
  b.add(cyl(0.2, 0.24, 0.05, 16), '#2f3d4f', { p: [-5.15, 0.025, 0.55] });
  b.add(cyl(0.025, 0.025, 1.75, 8), '#2f3d4f', { p: [-5.15, 0.9, 0.55] });
  b.add(new THREE.CylinderGeometry(0.16, 0.3, 0.32, 18, 1, true), '#e7d9bd', { p: [-5.15, 1.88, 0.55] });
  u.add(cyl(0.155, 0.29, 0.31, 18), '#ffd79a', { p: [-5.15, 1.88, 0.55] }, 0);
  // Wooden chairs with coloured seat pads around the table.
  for (let i = 0; i < 10; i++) {
    const { x, z, rotY } = seatXZ(i);
    const ch = new GeoBuilder();
    ch.add(roundedBox(0.5, 0.06, 0.46, 0.03), WOOD_DARK, { p: [0, 0.2, 0.02] });
    ch.add(roundedBox(0.44, 0.05, 0.4, 0.025), CUSHIONS[i], { p: [0, 0.245, 0.02] });
    [[-0.2, -0.17], [0.2, -0.17], [-0.2, 0.2], [0.2, 0.2]].forEach(([cx, cz]) => ch.add(cyl(0.025, 0.025, 0.2, 8), WOOD_DARK, { p: [cx, 0.1, cz] }));
    [-0.2, 0.2].forEach((cx) => ch.add(cyl(0.022, 0.022, 0.36, 8), WOOD_DARK, { p: [cx, 0.4, -0.2] }));
    ch.add(roundedBox(0.48, 0.14, 0.04, 0.02), WOOD_DARK, { p: [0, 0.52, -0.2] });
    b.add(ch.build(), null, { p: [x, 0, z], r: [0, rotY, 0] });
  }
  return { geo: b.build(), glowGeo: u.build() };
}

function seatXZ(i: number) {
  const side = i < 5 ? 0 : 1;
  return { x: SEAT_X[i % 5], z: side ? SEAT_Z : -SEAT_Z, rotY: side ? Math.PI : 0 };
}

function buildCat() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const tail = new THREE.Group();
  const orange = '#e0904f', cream = '#f6e3c6';
  const bb = new GeoBuilder()
    .add(sphere(0.26, 16, 12), orange, { s: [1.15, 0.62, 0.95] })
    .add(sphere(0.18, 12, 8), cream, { p: [0.06, -0.04, 0.12], s: [1, 0.55, 0.8] }, 0)
    .add(sphere(0.16, 14, 10), orange, { p: [0.27, 0.0, 0.08], s: [1, 0.88, 1] })
    .add(new THREE.ConeGeometry(0.06, 0.1, 6), orange, { p: [0.31, 0.13, 0.0], r: [-0.3, 0, -0.35] })
    .add(new THREE.ConeGeometry(0.06, 0.1, 6), orange, { p: [0.31, 0.12, 0.17], r: [0.4, 0, -0.35] })
    .add(sphere(0.07, 8, 6), cream, { p: [0.38, -0.05, 0.12], s: [0.8, 0.6, 1] }, 0);
  [0.06, 0.18].forEach((z) => bb.add(torus(0.022, 0.006, Math.PI, 4, 8), '#3a2418', { p: [0.405, 0.02, z], r: [0, Math.PI / 2, Math.PI] }, 0));
  for (let k = 0; k < 3; k++) bb.add(new THREE.BoxGeometry(0.03, 0.012, 0.16), '#c4743c', { p: [-0.12 + k * 0.1, 0.155, 0], r: [0, 0, 0.15] }, 0);
  body.add(toonMesh(bb.build(), { cast: true }));
  const tb = new GeoBuilder().add(capsule(0.05, 0.3), orange, { p: [0, 0, 0.17], r: [Math.PI / 2, 0, 0] }).add(sphere(0.055, 8, 6), cream, { p: [0, 0, 0.36] });
  tail.add(toonMesh(tb.build()));
  tail.position.set(-0.24, -0.06, 0.05);
  tail.rotation.y = 0.9;
  g.add(body, tail);
  return { g, body, tail };
}

export function buildRoom(): RoomBuild {
  const m = materials();
  const group = new THREE.Group();
  const shadowCasters: THREE.Object3D[] = [];
  const { geo, glowGeo } = staticRoom();
  const roomMesh = toonMesh(geo, { receive: true, cast: true });
  group.add(roomMesh);
  group.add(new THREE.Mesh(glowGeo, m.unlit));

  // Rain window pane.
  const windowMat = rainWindowMaterial();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 3.75), windowMat);
  pane.position.set(0, 0.95 + 3.75 / 2 - 0.02, -4.66);
  group.add(pane);

  // Grounding blobs and light pools.
  const blobTable = blobShadow(6.6, 2.0, 0.45); blobTable.position.set(0, 0.045, 0); group.add(blobTable);
  const poolWin = lightPool('#5f86d8', 4.2, 3.2, 0.22); poolWin.position.set(0, 0.05, -3.2); group.add(poolWin);
  const poolChair = lightPool('#ffb35c', 3.2, 3.2, 0.3); poolChair.position.set(-4.6, 0.05, 1.0); group.add(poolChair);
  const poolTable = lightPool('#ffb35c', 6.2, 2.4, 0.08); poolTable.position.set(0, TABLE_TOP + 0.005, 0); group.add(poolTable);

  const lamps: RoomBuild['lamps'] = [];
  const addLamp = (x: number, y: number, z: number, intensity: number, dist: number, glowSize: number) => {
    const light = new THREE.PointLight('#ffb35c', intensity, dist, 1.3);
    light.position.set(x, y, z);
    const glow = glowSprite('#ffb866', glowSize, 0.55);
    glow.position.set(x, y + 0.02, z);
    group.add(light, glow);
    lamps.push({ light, glow, base: intensity });
  };
  addLamp(-1.65, TABLE_TOP + 0.34, 0, 2.6, 6, 1.3);
  addLamp(1.65, TABLE_TOP + 0.34, 0, 2.6, 6, 1.3);
  addLamp(-5.15, 1.8, 0.55, 4, 6, 1.6);

  // Seats.
  const seats: SeatSlot[] = [];
  for (let i = 0; i < 10; i++) {
    const { x, z, rotY } = seatXZ(i);
    const anchor = new THREE.Group();
    anchor.position.set(x, 0, z);
    anchor.rotation.y = rotY;
    group.add(anchor);
    const act = FOCUS_ACTS[i];
    const p = seatProps(i, act, rng(100 + i));
    const props = new THREE.Group();
    props.add(toonMesh(p.geo));
    if (p.glow) props.add(new THREE.Mesh(p.glow, m.unlit));
    if (p.pagePivot) props.add(p.pagePivot);
    const mg = mugGeo(MUGS[i]);
    const tableMug = toonMesh(mg);
    const mx = i % 2 ? -0.3 : 0.32;
    tableMug.position.set(mx, TABLE_TOP, 0.42);
    props.add(tableMug);
    const handMug = toonMesh(mg);
    props.visible = false;
    anchor.add(props);
    const emptyGlow = lightPool('#ffcf86', 1.1, 1.1, 0.16);
    emptyGlow.position.set(0, 0.28, 0);
    anchor.add(emptyGlow);
    const meRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40), new THREE.MeshBasicMaterial({ color: '#7fe0d0', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    meRing.rotation.x = -Math.PI / 2;
    meRing.position.y = 0.05;
    meRing.visible = false;
    anchor.add(meRing);
    anchor.updateMatrixWorld(true);
    const mugWorld = new THREE.Vector3(mx, TABLE_TOP + 0.13, 0.42).applyMatrix4(anchor.matrixWorld);
    const headWorld = new THREE.Vector3(0, 1.38 + CHAIR_ROOT_Y, 0.05).applyMatrix4(anchor.matrixWorld);
    seats.push({ index: i, anchor, props, tableMug, handMug, page: p.pagePivot, focusAct: act, emptyGlow, meRing, character: null, mugWorld, headWorld });
  }

  // Armchair reader — always present, part of the room's life.
  const reader = new Character(avatar(4), { chair: true, seed: 991 });
  // Seated on the cushion (top ≈0.56) a little forward so the shins hang over the front edge.
  reader.root.position.set(-4.2 + Math.sin(0.75) * 0.14, 0.38, 1.55 + Math.cos(0.75) * 0.14);
  reader.root.rotation.y = 0.75;
  const rbook = new THREE.Group();
  const rb = new GeoBuilder()
    .add(roundedBox(0.03, 0.26, 0.2, 0.01, 1), '#33507a', { p: [0, 0, 0] })
    .add(roundedBox(0.17, 0.24, 0.02, 0.008, 1), '#f6efe0', { p: [-0.09, 0, 0.0], r: [0, 0.25, 0] })
    .build();
  rbook.add(toonMesh(rb));
  const rpagePivot = new THREE.Group();
  const rpage = new THREE.Mesh(new GeoBuilder().add(new THREE.BoxGeometry(0.17, 0.235, 0.006), '#fbf4e4', { p: [0.085, 0, 0] }).build(), m.toon);
  rpagePivot.add(rpage);
  rpagePivot.rotation.y = 0;
  rbook.add(rpagePivot);
  const rcover = new THREE.Mesh(new GeoBuilder().add(roundedBox(0.18, 0.26, 0.015, 0.006, 1), '#33507a', { p: [0.09, 0, -0.012], r: [0, -0.25, 0] }).build(), m.toon);
  rbook.add(rcover);
  rbook.position.set(0, 0.47, 0.38);
  rbook.rotation.set(-1.0, Math.PI, 0);
  reader.root.add(rbook);
  reader.hooks.page = rpagePivot;
  group.add(reader.root);

  // Cat asleep on the bed.
  const cat = buildCat();
  cat.g.position.set(4.6, 0.82, -2.9);
  cat.g.rotation.y = -0.6;
  group.add(cat.g);

  shadowCasters.push(roomMesh);

  return {
    group, seats, lamps, shadowCasters, window: windowMat,
    update(now, dt) {
      reader.update(now, dt);
      const br = Math.sin(now * 1.3);
      cat.body.scale.set(1 + br * 0.015, 1 + br * 0.035, 1 + br * 0.015);
      cat.tail.rotation.y = 0.9 + Math.sin(now * 0.6) * 0.25 + Math.sin(now * 2.3) * 0.05;
      for (const l of lamps) {
        const f = 1 + 0.035 * Math.sin(now * 7.1 + l.base) * Math.sin(now * 2.7) - (Math.sin(now * 0.37 + l.base) > 0.995 ? 0.12 : 0);
        l.light.intensity = l.base * f;
        l.glow.material.opacity = 0.5 * f;
      }
      windowMat.uniforms.uTime.value = now;
    },
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | undefined;
        if (mat && mat !== m.toon && mat !== m.outline && mat !== m.unlit) mat.dispose();
      });
    },
  };
}
