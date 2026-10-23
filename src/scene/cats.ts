// The two cats: an orange tabby asleep on the sofa and a black cat by the shelves.
// Each is one small skinned mesh built like the characters (rigid parts per bone,
// baked colours, the character toon material and outline), posed procedurally.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { charMaterials } from './characterBuild';
import { GeoBuilder, capsule, rng, sphere, type V3 } from './toon';
import { SOFA } from './hall';

const BONES = ['root', 'body', 'chest', 'head', 'earL', 'earR', 'eyes', 'tail0', 'tail1', 'tail2', 'tail3', 'legFL', 'legFR', 'legBL', 'legBR'] as const;
type B = (typeof BONES)[number];
const PARENT: Record<B, B | null> = {
  root: null, body: 'root', chest: 'body', head: 'chest', earL: 'head', earR: 'head', eyes: 'head',
  tail0: 'body', tail1: 'tail0', tail2: 'tail1', tail3: 'tail2', legFL: 'chest', legFR: 'chest', legBL: 'body', legBR: 'body',
};
const REST: Record<B, V3> = {
  root: [0, 0, 0], body: [0, 0.17, -0.08], chest: [0, 0.01, 0.16], head: [0, 0.1, 0.11],
  earL: [-0.068, 0.095, -0.01], earR: [0.068, 0.095, -0.01], eyes: [0, 0.01, 0.105],
  tail0: [0, 0.035, -0.12], tail1: [0, 0, -0.085], tail2: [0, 0, -0.085], tail3: [0, 0, -0.08],
  legFL: [-0.062, -0.045, 0.03], legFR: [0.062, -0.045, 0.03], legBL: [-0.065, -0.045, -0.03], legBR: [0.065, -0.045, -0.03],
};

interface Palette { fur: string; belly: string; stripe: string | null; eye: string; pupil: string; nose: string }

function catGeometry(p: Palette): THREE.BufferGeometry {
  const G = Object.fromEntries(BONES.map((n) => [n, new GeoBuilder()])) as Record<B, GeoBuilder>;
  G.body.add(sphere(0.135, 14, 10), p.fur, { s: [1, 0.86, 1.25] });
  G.body.add(sphere(0.11, 10, 8), p.belly, { p: [0, -0.04, 0.02], s: [0.9, 0.7, 1.1] }, 0);
  G.chest.add(sphere(0.125, 14, 10), p.fur, { p: [0, 0.01, 0], s: [1, 0.95, 1.05] });
  G.chest.add(sphere(0.09, 10, 8), p.belly, { p: [0, -0.02, 0.06], s: [0.9, 1, 0.8] }, 0);
  G.head.add(sphere(0.13, 16, 12), p.fur, { s: [1.1, 0.94, 0.98] });
  G.head.add(sphere(0.06, 10, 8), p.belly, { p: [0, -0.04, 0.105], s: [1.25, 0.8, 0.7] }, 0);
  G.head.add(sphere(0.016, 6, 5), p.nose, { p: [0, -0.012, 0.135], s: [1.2, 0.8, 0.8] }, 0);
  for (const sd of [-1, 1]) {
    G.eyes.add(sphere(0.022, 8, 6), p.eye, { p: [sd * 0.05, 0, 0], s: [1, 1.15, 0.5] }, 0);
    G.eyes.add(sphere(0.011, 6, 5), p.pupil, { p: [sd * 0.05, 0, 0.009], s: [0.7, 1.6, 0.4] }, 0);
    const ear = sd < 0 ? G.earL : G.earR;
    ear.add(new THREE.ConeGeometry(0.048, 0.085, 4), p.fur, { p: [0, 0.03, 0], r: [-0.15, Math.PI / 4, sd * -0.25] });
    ear.add(new THREE.ConeGeometry(0.028, 0.05, 4), p.nose, { p: [0, 0.022, 0.012], r: [-0.15, Math.PI / 4, sd * -0.25] }, 0);
  }
  for (const k of ['tail0', 'tail1', 'tail2', 'tail3'] as const) G[k].add(capsule(0.03 - (k === 'tail3' ? 0.004 : 0), 0.06), k === 'tail3' && p.stripe ? p.belly : p.fur, { p: [0, 0, -0.042], r: [Math.PI / 2, 0, 0] });
  for (const k of ['legFL', 'legFR', 'legBL', 'legBR'] as const) {
    G[k].add(capsule(0.036, 0.09), p.fur, { p: [0, -0.06, 0] });
    G[k].add(sphere(0.04, 8, 6), p.belly, { p: [0, -0.115, 0.012], s: [1, 0.7, 1.25] });
  }
  if (p.stripe) {
    for (let k = 0; k < 4; k++) G.body.add(new THREE.TorusGeometry(0.128, 0.012, 4, 14, Math.PI * 0.9), p.stripe, { p: [0, 0.01, -0.07 + k * 0.05], r: [0, 0, Math.PI * 0.05], s: [1, 0.86, 1] }, 0);
    for (let k = 0; k < 2; k++) G.chest.add(new THREE.TorusGeometry(0.122, 0.011, 4, 14, Math.PI * 0.85), p.stripe, { p: [0, 0.02, -0.02 + k * 0.05], r: [0, 0, Math.PI * 0.075] }, 0);
    for (const x of [-0.035, 0, 0.035]) G.head.add(new THREE.BoxGeometry(0.014, 0.05, 0.02), p.stripe, { p: [x, 0.085, 0.07], r: [-0.6, 0, x * 3] }, 0);
    G.tail1.add(new THREE.TorusGeometry(0.031, 0.008, 4, 12), p.stripe, { p: [0, 0, -0.04] }, 0);
    G.tail2.add(new THREE.TorusGeometry(0.03, 0.008, 4, 12), p.stripe, { p: [0, 0, -0.04] }, 0);
  }
  const off: Record<string, V3> = {};
  for (const n of BONES) {
    const par = PARENT[n] ? off[PARENT[n]!] : [0, 0, 0];
    off[n] = [par[0] + REST[n][0], par[1] + REST[n][1], par[2] + REST[n][2]];
  }
  const parts: THREE.BufferGeometry[] = [];
  BONES.forEach((n, i) => {
    if (G[n].empty) return;
    const g = G[n].build();
    g.translate(...off[n]);
    const c = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(c * 4).map((_, k) => (k % 4 === 0 ? i : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(c * 4).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4));
    parts.push(g);
  });
  const geo = mergeGeometries(parts, false)!;
  parts.forEach((g) => g.dispose());
  geo.computeBoundingSphere();
  return geo;
}

class Cat {
  readonly root = new THREE.Group();
  readonly bones = {} as Record<B, THREE.Bone>;
  private skeleton: THREE.Skeleton;
  private meshes: THREE.SkinnedMesh[] = [];
  constructor(geo: THREE.BufferGeometry) {
    const m = charMaterials();
    for (const n of BONES) {
      const b = new THREE.Bone();
      b.position.set(...REST[n]);
      this.bones[n] = b;
      (PARENT[n] ? this.bones[PARENT[n]!] : this.root).add(b);
    }
    const off: Record<string, V3> = {};
    for (const n of BONES) {
      const par = PARENT[n] ? off[PARENT[n]!] : [0, 0, 0];
      off[n] = [par[0] + REST[n][0], par[1] + REST[n][1], par[2] + REST[n][2]];
    }
    this.skeleton = new THREE.Skeleton(BONES.map((n) => this.bones[n]), BONES.map((n) => new THREE.Matrix4().makeTranslation(-off[n][0], -off[n][1], -off[n][2])));
    for (const mat of [m.toon, m.outline]) {
      const sm = new THREE.SkinnedMesh(geo, mat);
      sm.bind(this.skeleton, new THREE.Matrix4());
      sm.frustumCulled = false;
      sm.castShadow = mat === m.toon;
      this.root.add(sm);
      this.meshes.push(sm);
    }
  }
  dispose() { this.skeleton.dispose(); }
}

// ---- poses ------------------------------------------------------------------------------

interface CatPose {
  bodyY: number; bodyX: number; chestX: number; chestY: number;
  headX: number; headY: number; headZ: number;
  tail: [number, number, number, number]; tailYaw: [number, number, number, number];
  fl: number; fr: number; bl: number; br: number;
  ears: number; eyes: number;
}
const pose = (): CatPose => ({ bodyY: 0.17, bodyX: 0, chestX: 0, chestY: 0, headX: 0, headY: 0, headZ: 0, tail: [-0.8, -0.3, 0.2, 0.3], tailYaw: [0, 0, 0, 0], fl: 0, fr: 0, bl: 0, br: 0, ears: 0, eyes: 1 });
const lerpP = (d: CatPose, a: CatPose, b: CatPose, t: number) => {
  const L = (x: number, y: number) => x + (y - x) * t;
  d.bodyY = L(a.bodyY, b.bodyY); d.bodyX = L(a.bodyX, b.bodyX); d.chestX = L(a.chestX, b.chestX); d.chestY = L(a.chestY, b.chestY);
  d.headX = L(a.headX, b.headX); d.headY = L(a.headY, b.headY); d.headZ = L(a.headZ, b.headZ);
  for (let i = 0; i < 4; i++) { d.tail[i] = L(a.tail[i], b.tail[i]); d.tailYaw[i] = L(a.tailYaw[i], b.tailYaw[i]); }
  d.fl = L(a.fl, b.fl); d.fr = L(a.fr, b.fr); d.bl = L(a.bl, b.bl); d.br = L(a.br, b.br);
  d.ears = L(a.ears, b.ears); d.eyes = L(a.eyes, b.eyes);
};

function curled(p: CatPose, t: number) {
  const br = Math.sin(t * 1.5);
  p.bodyY = 0.085; p.bodyX = 0; p.chestX = 0.08; p.chestY = 0.95;
  p.headX = 0.25; p.headY = 1.05; p.headZ = 0.25;
  p.tail = [0.55, 0.1, 0, 0]; p.tailYaw = [1.25, 0.75, 0.6, 0.45];
  p.fl = p.fr = -1.45; p.bl = p.br = -1.5;
  p.ears = 0; p.eyes = 0.12;
  return br;
}
function sitting(p: CatPose, t: number, ph: number) {
  p.bodyY = 0.1; p.bodyX = -0.8; p.chestX = -0.15; p.chestY = 0;
  p.headX = 0.9; p.headY = 0; p.headZ = 0;
  const sw = Math.sin(t * 0.9 + ph) * 0.35 + Math.sin(t * 2.3 + ph) * 0.08;
  p.tail = [0.85, 0.15, 0.05, 0.05]; p.tailYaw = [0.9, 0.5 + sw * 0.4, 0.4 + sw, 0.3 + sw * 1.3];
  p.fl = p.fr = 0.95; p.bl = p.br = -1.5;
  p.ears = 0; p.eyes = 1;
}
function standing(p: CatPose, t: number, ph: number, gait: number, amt: number) {
  p.bodyY = 0.17 + 0.008 * amt * Math.abs(Math.sin(gait)); p.bodyX = 0; p.chestX = 0; p.chestY = 0;
  p.headX = 0.05 + 0.04 * amt * Math.sin(gait * 2); p.headY = 0; p.headZ = 0;
  const sw = Math.sin(t * 1.4 + ph) * 0.25;
  p.tail = [-1.0, -0.35, 0.25, 0.45]; p.tailYaw = [sw * 0.3, sw * 0.5, sw, sw];
  const A = 0.42 * amt;
  p.fl = A * Math.sin(gait); p.br = A * Math.sin(gait); p.fr = -A * Math.sin(gait); p.bl = -A * Math.sin(gait);
  p.ears = 0; p.eyes = 1;
}

function applyCat(c: Cat, p: CatPose) {
  const b = c.bones;
  b.body.position.y = p.bodyY;
  b.body.rotation.set(p.bodyX, 0, 0);
  b.chest.rotation.set(p.chestX, p.chestY, 0);
  b.head.rotation.set(p.headX, p.headY, p.headZ);
  (['tail0', 'tail1', 'tail2', 'tail3'] as const).forEach((k, i) => b[k].rotation.set(p.tail[i], p.tailYaw[i], 0));
  b.legFL.rotation.x = p.fl; b.legFR.rotation.x = p.fr; b.legBL.rotation.x = p.bl; b.legBR.rotation.x = p.br;
  b.earL.rotation.z = p.ears; b.earR.rotation.z = -p.ears;
  b.eyes.scale.set(1, Math.max(0.08, p.eyes), 1);
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface Cats {
  group: THREE.Group;
  /** Positions of people moving about (black cat watches), sofa visitors (tabby joins). */
  update(t: number, dt: number, movers: (THREE.Vector3 | null)[], guests: THREE.Vector3[]): void;
  /** Floor shadow spots for the blob shadows: [x, z, radius]. */
  shadows(): [number, number, number][];
  dispose(): void;
}

export function createCats(): Cats {
  const group = new THREE.Group();
  const rand = rng(404);
  const tabbyGeo = catGeometry({ fur: '#e2894a', belly: '#f6e3c6', stripe: '#b5602c', eye: '#3a2a1e', pupil: '#1c140f', nose: '#e8908a' });
  const blackGeo = catGeometry({ fur: '#2a2a31', belly: '#3b3a44', stripe: null, eye: '#e9c84f', pupil: '#121216', nose: '#6b4a52' });
  const tabby = new Cat(tabbyGeo);
  const black = new Cat(blackGeo);
  group.add(tabby.root, black.root);

  // Tabby on the sofa: curled on the upper cushion along the left-wall sofa, walks along the seat to visitors.
  const SEAT_Y = SOFA.seat + 0.005, SEAT_X = SOFA.x + 0.08;
  const tb = { z: SOFA.z - 0.36, yaw: 0.35, goalZ: SOFA.z - 0.36, state: 'curl' as 'curl' | 'wake' | 'walk' | 'nuzzle' | 'stretch', st: 0, nextStretch: 40, twitch: 0, gait: 0 };
  // Black cat: sits by the shelves, strolls between a few spots, watches people.
  const SPOTS: [number, number, number][] = [[-4.05, -4.72, 0.75], [-2.95, -4.65, 0.4], [-4.0, -1.55, 1.3]];
  const bc = { x: SPOTS[0][0], z: SPOTS[0][1], yaw: SPOTS[0][2], spot: 0, state: 'sit' as 'sit' | 'rise' | 'walk' | 'settle', st: 0, next: 50, head: 0, blink: 3, gait: 0 };
  const pT = pose(), pB = pose(), tmpA = pose(), tmpB = pose();
  const shadowList: [number, number, number][] = [[0, 0, 0.5], [0, 0, 0.5]];

  return {
    group,
    update(t, dt, movers, guests) {
      // ---- tabby ----
      // Visitors: snuggle up beside one on the left-wall sofa cushion.
      const guest = guests.length ? guests[0] : null;
      if (guests.length >= 2) tb.goalZ = SOFA.z - 0.36;
      else if (guest) {
        tb.goalZ = SOFA.z - 0.36;
      }
      tb.st += dt;
      const needMove = Math.abs(tb.goalZ - tb.z) > 0.08;
      switch (tb.state) {
        case 'curl':
          if (needMove && guest) { tb.state = 'wake'; tb.st = 0; }
          else if (t > tb.nextStretch) { tb.state = 'stretch'; tb.st = 0; }
          break;
        case 'wake': if (tb.st > 1.2) { tb.state = needMove ? 'walk' : 'nuzzle'; tb.st = 0; } break;
        case 'walk': {
          const dir = Math.sign(tb.goalZ - tb.z);
          const want = dir > 0 ? 0 : Math.PI;
          tb.yaw += wrap(want - tb.yaw) * Math.min(1, dt * 5);
          const v = Math.abs(wrap(want - tb.yaw)) < 0.4 ? 0.35 : 0.05;
          tb.z += dir * Math.min(Math.abs(tb.goalZ - tb.z), v * dt);
          tb.gait += v * dt / 0.18 * Math.PI;
          if (!needMove) { tb.state = guest ? 'nuzzle' : 'curl'; tb.st = 0; }
          break;
        }
        case 'nuzzle': if (tb.st > 3.5) { tb.state = 'curl'; tb.st = 0; tb.nextStretch = t + 50 + rand() * 40; } break;
        case 'stretch': if (tb.st > 4.5) { tb.state = 'curl'; tb.st = 0; tb.nextStretch = t + 45 + rand() * 50; } break;
      }
      const br = curled(tmpA, t);
      if (tb.state === 'curl') {
        // Ear twitch now and then; breathing swells the body.
        if (t > tb.twitch + 6 && Math.sin(t * 0.37) > 0.995) tb.twitch = t;
        tmpA.ears = Math.sin(Math.min(1, (t - tb.twitch) / 0.25) * Math.PI) * 0.5;
        lerpP(pT, pT, tmpA, Math.min(1, dt * 3));
        tabby.bones.body.scale.set(1 + br * 0.02, 1 + br * 0.04, 1 + br * 0.015);
      } else {
        tabby.bones.body.scale.set(1, 1, 1);
        standing(tmpB, t, 1.3, tb.gait, tb.state === 'walk' ? 1 : 0);
        if (tb.state === 'wake') { tmpB.headX = -0.2; tmpB.eyes = 1; }
        if (tb.state === 'nuzzle') { tmpB.headZ = 0.35 * Math.sin(tb.st * 3.2); tmpB.headY = 0.3; tmpB.bodyY = 0.15; tmpB.eyes = 0.15; tmpB.tail = [-1.2, -0.5, 0.4, 0.6]; }
        if (tb.state === 'stretch') {
          const s = Math.sin(Math.min(1, tb.st / 4.5) * Math.PI);
          tmpB.bodyX = 0.35 * s; tmpB.fl = tmpB.fr = -1.15 * s; tmpB.bodyY = 0.17 - 0.03 * s; tmpB.headX = -0.4 * s; tmpB.eyes = 1 - 0.85 * s;
          tb.yaw += dt * 0.25;
        }
        lerpP(pT, pT, tmpB, Math.min(1, dt * (tb.state === 'walk' ? 12 : 4)));
      }
      applyCat(tabby, pT);
      tabby.root.position.set(SEAT_X, SEAT_Y, tb.z);
      tabby.root.rotation.y = tb.yaw;

      // ---- black cat ----
      bc.st += dt;
      // Watch the nearest person moving about.
      let best = 3.6, look = 0;
      for (const m of movers) {
        if (!m) continue;
        const d = Math.hypot(m.x - bc.x, m.z - bc.z);
        if (d < best) { best = d; look = wrap(Math.atan2(m.x - bc.x, m.z - bc.z) - bc.yaw); }
      }
      bc.head += (THREE.MathUtils.clamp(best < 3.6 ? look : 0, -1.1, 1.1) - bc.head) * Math.min(1, dt * 3);
      if (t > bc.blink) bc.blink = t + 2.5 + rand() * 4;
      const blinking = bc.blink - t > 0 && bc.blink - t < 0.14;
      if (bc.state === 'sit' && t > bc.next) { bc.state = 'rise'; bc.st = 0; bc.spot = (bc.spot + 1 + (rand() < 0.5 ? 1 : 0)) % SPOTS.length; }
      const tgt = SPOTS[bc.spot];
      if (bc.state === 'rise' && bc.st > 0.9) { bc.state = 'walk'; bc.st = 0; }
      if (bc.state === 'walk') {
        const dx = tgt[0] - bc.x, dz = tgt[1] - bc.z, d = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        bc.yaw += wrap(want - bc.yaw) * Math.min(1, dt * 4);
        const v = Math.abs(wrap(want - bc.yaw)) < 0.5 ? 0.45 : 0.08;
        const s = Math.min(d, v * dt);
        bc.x += Math.sin(bc.yaw) * s; bc.z += Math.cos(bc.yaw) * s;
        bc.gait += s / 0.2 * Math.PI;
        if (d < 0.05) { bc.state = 'settle'; bc.st = 0; }
      }
      if (bc.state === 'settle') {
        bc.yaw += wrap(tgt[2] - bc.yaw) * Math.min(1, dt * 3);
        if (bc.st > 1.2) { bc.state = 'sit'; bc.st = 0; bc.next = t + 40 + rand() * 60; }
      }
      if (bc.state === 'sit' || bc.state === 'settle') {
        sitting(tmpA, t, 2.1);
        tmpA.headY = bc.head; tmpA.eyes = blinking ? 0.08 : 1;
        lerpP(pB, pB, tmpA, Math.min(1, dt * (bc.state === 'settle' ? 3 : 6)));
      } else {
        standing(tmpB, t, 2.1, bc.gait, bc.state === 'walk' ? 1 : 0);
        tmpB.headY = bc.head * 0.5; tmpB.eyes = blinking ? 0.08 : 1;
        lerpP(pB, pB, tmpB, Math.min(1, dt * (bc.state === 'walk' ? 12 : 3)));
      }
      applyCat(black, pB);
      black.root.position.set(bc.x, 0, bc.z);
      black.root.rotation.y = bc.yaw;
      shadowList[0][0] = bc.x; shadowList[0][1] = bc.z;
      shadowList[1][0] = -99; shadowList[1][1] = -99;
    },
    shadows: () => shadowList,
    dispose() { tabby.dispose(); black.dispose(); tabbyGeo.dispose(); blackGeo.dispose(); },
  };
}
