// Procedural chibi student. Geometry is merged per bone (legs, body, head,
// upper arm, forearm) and cached per avatar variant; animation is a small
// procedural pose system with analytic two-bone arm IK. No per-frame allocations.
import * as THREE from 'three';
import type { AvatarVariant } from '../lib/avatars';
import { GeoBuilder, capsule, cyl, materials, roundedBox, sphere, toonMesh, torus } from './toon';

export type Status = 'focusing' | 'break' | 'away';
export type FocusAct = 'write' | 'read' | 'type';
type Act = FocusAct | 'sip' | 'stretch' | 'drink' | 'phone' | 'lean' | 'chairRead' | 'idle';

const PANTS = ['#36405e', '#4a3b35', '#2e3a52', '#3d3a4a', '#33425e', '#4b3a2e', '#2f3d4f', '#40374f', '#36465c', '#4a4036'];
const DARK = '#22151a';
const L1 = 0.25, L2 = 0.25;
export const SHOULDER_Y = 0.44;
export const BODY_Y = 0.2;
export const HEAD_Y = 0.74;

interface VariantGeo { legsCross: THREE.BufferGeometry; legsChair: THREE.BufferGeometry; body: THREE.BufferGeometry; head: THREE.BufferGeometry; eyes: THREE.BufferGeometry; closed: THREE.BufferGeometry; upper: THREE.BufferGeometry; fore: THREE.BufferGeometry }
const cache = new Map<number, VariantGeo>();
let itemGeo: { pen: THREE.BufferGeometry; phone: THREE.BufferGeometry } | null = null;

function shade(hex: string, k: number): string {
  return '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
}

function hairGeo(b: GeoBuilder, v: AvatarVariant) {
  const h = v.hairColor;
  const crown = v.hair === 'beanie' ? 0.36 : 0.44;
  b.add(new THREE.SphereGeometry(0.3, 22, 12, 0, Math.PI * 2, 0, Math.PI * crown), h, { p: [0, 0.02, -0.005], s: [1.08, 1.04, 1.04] });
  b.add(new THREE.SphereGeometry(0.3, 22, 14, Math.PI * 0.72, Math.PI * 1.56, 0, Math.PI * 0.82), h, { p: [0, 0.01, -0.01], s: [1.07, 1.02, 1.03] });
  const bangs: [number, number, number, number][] = [[-0.21, 0.12, 0.2, 0.3], [-0.12, 0.15, 0.245, 0.15], [-0.03, 0.16, 0.265, 0.04], [0.06, 0.16, 0.262, -0.06], [0.15, 0.14, 0.24, -0.18], [0.22, 0.11, 0.2, -0.3]];
  if (v.hair !== 'beanie') bangs.forEach(([x, y, z, rz]) => b.add(sphere(1, 10, 8), h, { p: [x, y, z], r: [0.2, 0, rz], s: [0.085, 0.13, 0.07] }));
  [-1, 1].forEach((sd) => b.add(capsule(0.058, 0.13), h, { p: [sd * 0.27, -0.02, 0.13], r: [0.15, 0, sd * -0.1] }));
  switch (v.hair) {
    case 'bun':
      b.add(sphere(0.14, 14, 10), h, { p: [0, 0.33, -0.1] });
      b.add(torus(0.09, 0.026), v.accColor, { p: [0, 0.25, -0.08], r: [Math.PI / 2 - 0.3, 0, 0] });
      break;
    case 'long':
    case 'bob': {
      const len = v.hair === 'long' ? 0.34 : 0.17;
      b.add(roundedBox(0.6, len, 0.26, 0.09), h, { p: [0, -0.06 - len / 2 + 0.06, -0.15] });
      [-1, 1].forEach((sd) => b.add(capsule(0.065, len * 0.7), h, { p: [sd * 0.27, -0.1 - len * 0.2, 0.04], r: [0, 0, sd * -0.08] }));
      break;
    }
    case 'short':
      [[0, 0.27, 0.03, 0.11], [-0.14, 0.25, 0.01, 0.1], [0.14, 0.25, 0.01, 0.1], [0, 0.24, -0.16, 0.11], [-0.2, 0.18, -0.1, 0.09], [0.2, 0.18, -0.1, 0.09]]
        .forEach(([x, y, z, r]) => b.add(sphere(r, 10, 8), h, { p: [x, y, z], s: [1.15, 0.85, 1.1] }));
      break;
    case 'curly':
      [[0, 0.3, 0.05], [-0.16, 0.28, 0.06], [0.16, 0.28, 0.06], [-0.27, 0.18, 0.02], [0.27, 0.18, 0.02], [-0.3, 0.05, -0.06], [0.3, 0.05, -0.06], [-0.2, 0.26, -0.13], [0.2, 0.26, -0.13], [0, 0.29, -0.15], [-0.14, 0.14, -0.26], [0.14, 0.14, -0.26], [0, 0.08, -0.28], [-0.08, 0.22, 0.2], [0.08, 0.22, 0.2]]
        .forEach(([x, y, z]) => b.add(sphere(0.125, 10, 8), h, { p: [x, y, z] }));
      break;
    case 'spiky':
      [[0, 0.3, 0.06, 0.3], [-0.14, 0.27, 0.04, 0.6], [0.14, 0.27, 0.04, -0.6], [0, 0.27, -0.14, -0.4], [-0.16, 0.2, -0.14, 0.9], [0.16, 0.2, -0.14, -0.9]]
        .forEach(([x, y, z, rz]) => b.add(new THREE.ConeGeometry(0.09, 0.2, 8), h, { p: [x, y, z], r: [z < 0 ? -0.5 : 0.3, 0, rz] }));
      break;
    case 'beanie':
      b.add(new THREE.SphereGeometry(0.33, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), v.accColor, { p: [0, 0.04, -0.01], s: [1.04, 1.02, 1.02] });
      b.add(torus(0.315, 0.05, Math.PI * 2, 8, 24), shade(v.accColor, 0.8), { p: [0, 0.07, -0.01], r: [Math.PI / 2, 0, 0], s: [1.06, 1.03, 1] });
      b.add(sphere(0.09, 10, 8), '#f4efe4', { p: [0, 0.39, -0.02] });
      break;
  }
  if (v.accessory === 'clip') b.add(roundedBox(0.1, 0.035, 0.03, 0.012), v.accColor, { p: [0.17, 0.2, 0.22], r: [0.2, 0.3, -0.5] }, 0);
  if (v.accessory === 'headphones') {
    b.add(torus(0.335, 0.024, Math.PI, 6, 18), v.accColor, { p: [0, 0.02, -0.02] });
    [-1, 1].forEach((sd) => b.add(cyl(0.085, 0.085, 0.07, 14), shade(v.accColor, 0.75), { p: [sd * 0.32, 0, -0.02], r: [0, 0, Math.PI / 2] }));
  }
  if (v.accessory === 'glasses') {
    [-1, 1].forEach((sd) => b.add(torus(0.058, 0.009, Math.PI * 2, 6, 18), v.accColor, { p: [sd * 0.105, -0.02, 0.29] }, 0));
    b.add(cyl(0.008, 0.008, 0.05, 6), v.accColor, { p: [0, -0.01, 0.295], r: [0, 0, Math.PI / 2] }, 0);
  }
}

function buildVariant(v: AvatarVariant): VariantGeo {
  const hit = cache.get(v.id);
  if (hit) return hit;
  const pants = PANTS[v.id % PANTS.length];
  const shoe = '#efe6d6';

  const legs = (chair: boolean) => {
    const b = new GeoBuilder();
    [-1, 1].forEach((sd) => {
      if (chair) {
        b.add(capsule(0.085, 0.22), pants, { p: [sd * 0.1, 0.06, 0.16], r: [Math.PI / 2, 0, 0] });
        b.add(capsule(0.075, 0.2), pants, { p: [sd * 0.11, -0.12, 0.3] });
        b.add(roundedBox(0.12, 0.08, 0.17, 0.035), shoe, { p: [sd * 0.11, -0.28, 0.34] });
      } else {
        b.add(capsule(0.085, 0.24), pants, { p: [sd * 0.13, 0.04, 0.12], r: [0, -sd * 0.42, sd * 1.25] });
        b.add(roundedBox(0.11, 0.08, 0.16, 0.035), shoe, { p: [sd * 0.08, 0.03, 0.26], r: [0, -sd * 0.6, 0] });
      }
    });
    return b.build();
  };

  // Body: torso lathe + top-specific details.
  const b = new GeoBuilder();
  const prof = [[0.01, 0], [0.22, 0.02], [0.235, 0.15], [0.21, 0.32], [0.165, 0.45], [0.09, 0.5], [0.01, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
  b.add(new THREE.LatheGeometry(prof, 20), v.topColor, { s: [1.05, 1, 0.86] });
  if (v.top === 'hoodie') {
    b.add(sphere(0.2, 14, 10), shade(v.topColor, 0.88), { p: [0, 0.42, -0.14], s: [1.1, 0.75, 0.7] });
    b.add(torus(0.13, 0.04, Math.PI * 2, 8, 18), shade(v.topColor, 0.92), { p: [0, 0.47, -0.01], r: [Math.PI / 2 + 0.15, 0, 0] });
    [-0.045, 0.045].forEach((x) => b.add(cyl(0.009, 0.009, 0.15, 5), v.trimColor, { p: [x, 0.36, 0.17], r: [0.15, 0, 0] }, 0));
    b.add(roundedBox(0.26, 0.11, 0.04, 0.03), shade(v.topColor, 0.9), { p: [0, 0.12, 0.19], r: [-0.08, 0, 0] }, 0);
  } else {
    b.add(torus(0.12, 0.035, Math.PI * 2, 8, 18), v.trimColor, { p: [0, 0.48, -0.01], r: [Math.PI / 2 + 0.1, 0, 0] });
    b.add(cyl(0.232, 0.232, 0.05, 20), v.trimColor, { p: [0, 0.2, 0], s: [1.05, 1, 0.86] }, 0);
    b.add(cyl(0.226, 0.236, 0.06, 20), shade(v.topColor, 0.86), { p: [0, 0.035, 0], s: [1.05, 1, 0.86] }, 0);
  }
  if (v.accessory === 'scarf') {
    b.add(torus(0.14, 0.055, Math.PI * 2, 8, 18), v.accColor, { p: [0, 0.48, 0], r: [Math.PI / 2 + 0.1, 0, 0] });
    b.add(roundedBox(0.09, 0.2, 0.04, 0.02), v.accColor, { p: [0.08, 0.36, 0.17], r: [0.15, 0, 0.1] });
  }
  const body = b.build();

  // Head.
  const hb = new GeoBuilder();
  hb.add(sphere(0.29, 22, 16), v.skin, { s: [1.06, 0.98, 0.98] });
  [-1, 1].forEach((sd) => hb.add(sphere(0.055, 8, 6), v.skin, { p: [sd * 0.3, -0.02, 0] }));
  [-1, 1].forEach((sd) => {
    hb.add(roundedBox(0.056, 0.014, 0.012, 0.005, 1), shade(v.hairColor, 0.8), { p: [sd * 0.105, 0.055, 0.278], r: [0, 0, sd * -0.1] }, 0);
    hb.add(sphere(0.04, 10, 6), '#f28c9a', { p: [sd * 0.165, -0.07, 0.252], r: [0, sd * 0.35, 0], s: [1.25, 0.65, 0.25] }, 0);
  });
  hb.add(sphere(0.015, 6, 6), shade(v.skin, 0.88), { p: [0, -0.04, 0.29] }, 0);
  hb.add(torus(0.022, 0.006, Math.PI, 5, 10), '#8c3b2b', { p: [0, -0.082, 0.28], r: [0, 0, Math.PI] }, 0);
  hairGeo(hb, v);
  const head = hb.build();

  const eb = new GeoBuilder();
  [-1, 1].forEach((sd) => {
    const x = sd * 0.105;
    eb.add(sphere(0.034, 10, 8), DARK, { p: [x, 0, 0.276], s: [0.85, 1.2, 0.5] }, 0);
    eb.add(sphere(0.011, 6, 5), '#ffffff', { p: [x - sd * 0.008, 0.015, 0.292] }, 0);
    eb.add(sphere(0.005, 5, 4), '#ffffff', { p: [x + sd * 0.009, -0.012, 0.29] }, 0);
  });
  const eyes = eb.build();
  const cb = new GeoBuilder();
  [-1, 1].forEach((sd) => cb.add(torus(0.03, 0.007, Math.PI, 5, 10), DARK, { p: [sd * 0.105, -0.025, 0.28] }, 0));
  const closed = cb.build();

  const ub = new GeoBuilder();
  ub.add(capsule(0.05, L1 - 0.05), v.topColor, { p: [0, -L1 / 2 + 0.01, 0] });
  const upper = ub.build();
  const fb = new GeoBuilder();
  fb.add(capsule(0.046, L2 - 0.07), v.topColor, { p: [0, -L2 / 2 + 0.02, 0] });
  fb.add(cyl(0.05, 0.05, 0.04, 10), v.top === 'hoodie' ? shade(v.topColor, 0.86) : v.trimColor, { p: [0, -L2 + 0.05, 0] }, 0);
  fb.add(sphere(0.052, 10, 8), v.skin, { p: [0, -L2, 0] });
  const fore = fb.build();

  const out = { legsCross: legs(false), legsChair: legs(true), body, head, eyes, closed, upper, fore };
  cache.set(v.id, out);
  return out;
}

function items() {
  if (itemGeo) return itemGeo;
  const pen = new GeoBuilder().add(cyl(0.011, 0.011, 0.16, 6), '#f2b45a', { p: [0, 0, 0.04], r: [Math.PI / 2 - 0.5, 0, 0] }, 0).build();
  const phone = new GeoBuilder()
    .add(roundedBox(0.09, 0.16, 0.016, 0.012, 2), '#2a2f45', {})
    .add(roundedBox(0.078, 0.14, 0.004, 0.008, 1), '#7fd1e0', { p: [0, 0, 0.009] }, 0)
    .build();
  itemGeo = { pen, phone };
  return itemGeo;
}

export function disposeCharacterCache() {
  cache.forEach((g) => Object.values(g).forEach((x) => x.dispose()));
  cache.clear();
  if (itemGeo) { itemGeo.pen.dispose(); itemGeo.phone.dispose(); itemGeo = null; }
}

interface Arm { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group; side: number }

// Scratch objects shared by all characters (single-threaded render loop).
const _inv = new THREE.Matrix4();
const _basis = new THREE.Matrix4();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _k = new THREE.Vector3();
const _u = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _f = new THREE.Vector3();
const _e = new THREE.Vector3();
const _pole = new THREE.Vector3();

const BREAK_ACTS: Act[] = ['stretch', 'drink', 'phone', 'lean'];
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);

export interface CharacterHooks {
  tableMug?: THREE.Object3D;
  page?: THREE.Object3D; // rotates about its local Z through the book spine
}

export class Character {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly head = new THREE.Group();
  private eyes: THREE.Mesh;
  private closed: THREE.Mesh;
  private armL: Arm;
  private armR: Arm;
  private pen: THREE.Mesh;
  private phone: THREE.Mesh;
  private handMug: THREE.Object3D | null = null;
  readonly variant: AvatarVariant;

  status: Status = 'focusing';
  focusAct: FocusAct = 'write';
  hooks: CharacterHooks = {};
  private chair: boolean;
  private act: Act = 'idle';
  private actStart = 0;
  private actUntil = 0;
  private nextSip = 0;
  private nextPage = 0;
  private pageT = -1;
  private nextBlink = 0;
  private nextTilt = 0;
  private seed: number;
  private rand: () => number;
  // pose state (current, damped) and targets
  private cL = new THREE.Vector3(-0.15, 0.4, 0.2);
  private cR = new THREE.Vector3(0.15, 0.4, 0.2);
  private tL = new THREE.Vector3();
  private tR = new THREE.Vector3();
  private lean = 0; private leanT = 0;
  private sway = 0; private swayT = 0;
  private hp = 0; private hpT = 0; private hy = 0; private hyT = 0; private hr = 0; private hrT = 0;
  private tiltY = 0; private tiltR = 0;
  private closedEyes = false;

  constructor(v: AvatarVariant, opts: { chair?: boolean; seed?: number } = {}) {
    this.variant = v;
    this.chair = !!opts.chair;
    this.seed = opts.seed ?? v.id * 7 + 3;
    let s = (this.seed * 2654435761) >>> 0 || 1;
    this.rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
    const g = buildVariant(v);
    const m = materials();
    this.root.add(toonMesh(this.chair ? g.legsChair : g.legsCross, { cast: true }));
    this.body.position.set(0, BODY_Y, 0);
    this.root.add(this.body);
    this.body.add(toonMesh(g.body, { cast: true }));
    this.head.position.set(0, HEAD_Y, 0.02);
    this.body.add(this.head);
    this.head.add(toonMesh(g.head, { cast: true }));
    this.eyes = new THREE.Mesh(g.eyes, m.unlit);
    this.closed = new THREE.Mesh(g.closed, m.unlit);
    this.closed.visible = false;
    this.eyes.position.y = -0.018;
    this.head.add(this.eyes, this.closed);
    const it = items();
    this.pen = new THREE.Mesh(it.pen, m.toon);
    this.phone = new THREE.Mesh(it.phone, m.toon);
    this.phone.rotation.set(-1.2, 0, 0);
    this.phone.position.set(0.04, -0.05, 0.03);
    this.armL = this.arm(-1, g);
    this.armR = this.arm(1, g);
    this.armR.hand.add(this.pen, this.phone);
    this.pen.visible = this.phone.visible = false;
    const now = performance.now() / 1000;
    this.nextSip = now + 8 + this.rand() * 30;
    this.nextPage = now + 6 + this.rand() * 20;
    this.nextBlink = now + this.rand() * 3;
  }

  private arm(side: number, g: VariantGeo): Arm {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.2, SHOULDER_Y, 0.02);
    shoulder.add(toonMesh(g.upper, { cast: true }));
    const elbow = new THREE.Group();
    elbow.position.set(0, -L1, 0);
    elbow.add(toonMesh(g.fore, { cast: true }));
    const hand = new THREE.Group();
    hand.position.set(0, -L2, 0);
    elbow.add(hand);
    shoulder.add(elbow);
    this.body.add(shoulder);
    return { shoulder, elbow, hand, side };
  }

  /** Give the character a mug held in its right hand while sipping. */
  setHandMug(obj: THREE.Object3D) {
    if (this.handMug) this.armR.hand.remove(this.handMug);
    this.handMug = obj;
    obj.position.set(0.0, -0.02, 0.07);
    obj.rotation.set(Math.PI, 0, 0);
    obj.visible = false;
    this.armR.hand.add(obj);
  }

  /** Static pose for thumbnails. */
  posePortrait() {
    this.act = 'idle';
    this.tL.set(-0.12, 0.45, 0.28); this.tR.set(0.12, 0.45, 0.28);
    this.cL.copy(this.tL); this.cR.copy(this.tR);
    this.hp = 0.05; this.hr = 0.08;
    this.applyPose();
  }

  private pickAct(now: number) {
    if (this.chair) { this.act = 'chairRead'; return; }
    if (this.status === 'break') {
      if (!BREAK_ACTS.includes(this.act) || now > this.actUntil) {
        const opts = BREAK_ACTS.filter((a) => a !== this.act);
        this.setAct(opts[Math.floor(this.rand() * opts.length)], now, 6 + this.rand() * 8);
      }
      return;
    }
    if (this.act === 'sip' && now < this.actUntil) return;
    if (now > this.nextSip && this.act === this.focusAct) {
      this.setAct('sip', now, 3.2);
      this.nextSip = now + 25 + this.rand() * 40;
      return;
    }
    if (this.act !== this.focusAct) this.setAct(this.focusAct, now, 1e9);
  }

  private setAct(a: Act, now: number, dur: number) { this.act = a; this.actStart = now; this.actUntil = now + dur; }

  update(now: number, dt: number) {
    if (!this.root.visible) return;
    this.pickAct(now);
    const t = now + this.seed;
    const local = now - this.actStart;
    const TY = 0.565;
    let closed = false;
    this.pen.visible = false;
    this.phone.visible = false;
    let mugInHand = false;
    this.swayT = 0;

    switch (this.act) {
      case 'write': {
        const line = Math.floor(t / 2.6) % 4;
        this.tR.set(0.12 + 0.02 * Math.sin(t * 7) + (t % 2.6) * 0.03, TY + 0.012 * Math.max(0, Math.sin(t * 14)), 0.5 - line * 0.025 + 0.01 * Math.cos(t * 7));
        this.tL.set(-0.17, TY, 0.46);
        this.pen.visible = true;
        this.leanT = 0.12; this.hpT = 0.26; this.hyT = 0.08;
        break;
      }
      case 'read': {
        this.tL.set(-0.2, TY, 0.44);
        this.tR.set(0.2, TY, 0.44);
        if (this.pageT < 0 && now > this.nextPage) { this.pageT = 0; this.nextPage = now + 14 + this.rand() * 22; }
        if (this.pageT >= 0) {
          this.pageT += dt / 1.3;
          const p = Math.min(1, this.pageT);
          const arc = Math.sin(p * Math.PI);
          this.tR.set(0.2 - p * 0.32, TY + arc * 0.09, 0.47);
          if (this.hooks.page) this.hooks.page.rotation.z = p * Math.PI;
          if (this.pageT >= 1) { this.pageT = -1; if (this.hooks.page) this.hooks.page.rotation.z = 0; }
        }
        this.leanT = 0.1; this.hpT = 0.3; this.hyT = 0.1 * Math.sin(t * 0.7);
        break;
      }
      case 'type':
        this.tL.set(-0.11, TY + 0.014 * Math.max(0, Math.sin(t * 17)), 0.46);
        this.tR.set(0.11, TY + 0.014 * Math.max(0, Math.sin(t * 15 + 1.7)), 0.46);
        this.leanT = 0.04; this.hpT = 0.1; this.hyT = 0;
        break;
      case 'sip':
      case 'drink': {
        const up = this.act === 'sip' ? local > 0.25 && local < this.actUntil - this.actStart - 0.6 : local > 0.3 && local < 3.8;
        if (up) this.tR.set(0.04, 0.86, 0.33); else this.tR.set(0.2, TY, 0.42);
        mugInHand = this.act === 'drink' ? local < 4.4 : true;
        this.tL.set(-0.16, this.act === 'drink' ? 0.3 : TY, this.act === 'drink' ? 0.18 : 0.44);
        this.leanT = this.act === 'drink' ? -0.04 : 0.04; this.hpT = up ? -0.18 : 0.2; this.hyT = 0;
        break;
      }
      case 'stretch':
        this.tL.set(-0.1, 1.6, 0.0); this.tR.set(0.1, 1.6, 0.0);
        this.leanT = -0.1; this.hpT = -0.28; this.swayT = 0.16 * Math.sin(t * 1.1);
        closed = true;
        break;
      case 'phone':
        this.tL.set(-0.05, 0.6, 0.3 + 0.004 * Math.sin(t * 9)); this.tR.set(0.06, 0.61, 0.31);
        this.phone.visible = true;
        this.leanT = 0.08; this.hpT = 0.36; this.hyT = 0.05;
        break;
      case 'lean':
        this.tL.set(-0.3, 0.12, -0.3); this.tR.set(0.3, 0.12, -0.3);
        this.leanT = -0.3; this.hpT = -0.15; this.hyT = 0.35 * Math.sin(t * 0.35);
        closed = Math.sin(t * 0.5) > 0.6;
        break;
      case 'chairRead': {
        this.tL.set(-0.13, 0.62, 0.36); this.tR.set(0.13, 0.62, 0.36);
        if (this.pageT < 0 && now > this.nextPage) { this.pageT = 0; this.nextPage = now + 12 + this.rand() * 15; }
        if (this.pageT >= 0) {
          this.pageT += dt / 1.2;
          const p = Math.min(1, this.pageT);
          this.tR.set(0.13 - p * 0.2, 0.62 + Math.sin(p * Math.PI) * 0.06, 0.38);
          if (this.hooks.page) this.hooks.page.rotation.y = -p * Math.PI;
          if (this.pageT >= 1) { this.pageT = -1; if (this.hooks.page) this.hooks.page.rotation.y = 0; }
        }
        this.leanT = -0.05; this.hpT = 0.32; this.hyT = 0.06 * Math.sin(t * 0.6);
        break;
      }
      default:
        this.tL.set(-0.15, TY, 0.4); this.tR.set(0.15, TY, 0.4);
        this.leanT = 0; this.hpT = 0.1; this.hyT = 0;
    }

    // Idle life: head tilts and blinks.
    if (now > this.nextTilt) {
      this.tiltR = (this.rand() - 0.5) * 0.24;
      this.tiltY = (this.rand() - 0.5) * 0.26;
      this.nextTilt = now + 3 + this.rand() * 6;
    }
    this.hrT = this.tiltR;
    let blink = 1;
    if (now > this.nextBlink) {
      const b = now - this.nextBlink;
      if (b < 0.14) blink = 0.12; else this.nextBlink = now + 2 + this.rand() * 4.5;
    }
    if (this.handMug) this.handMug.visible = mugInHand;
    if (this.hooks.tableMug) this.hooks.tableMug.visible = !mugInHand;

    const kh = damp(this.act === 'type' || this.act === 'write' ? 18 : 7, dt);
    const kb = damp(4, dt);
    this.cL.lerp(this.tL, kh);
    this.cR.lerp(this.tR, kh);
    this.lean += (this.leanT - this.lean) * kb;
    this.sway += (this.swayT - this.sway) * kb;
    this.hp += (this.hpT - this.hp) * kb;
    this.hy += (this.hyT + this.tiltY - this.hy) * kb;
    this.hr += (this.hrT - this.hr) * kb;
    if (closed !== this.closedEyes) { this.closedEyes = closed; this.closed.visible = closed; }
    this.eyes.visible = !closed;
    this.eyes.scale.y = blink;
    this.body.scale.y = 1 + 0.012 * Math.sin(t * 1.7);
    this.applyPose();
  }

  private applyPose() {
    this.body.rotation.set(this.lean, 0, this.sway);
    this.head.rotation.set(this.hp - this.lean * 0.5, this.hy, this.hr);
    this.body.updateMatrix();
    _inv.copy(this.body.matrix).invert();
    this.solve(this.armL, _t.copy(this.cL).applyMatrix4(_inv));
    this.solve(this.armR, _t.copy(this.cR).applyMatrix4(_inv));
  }

  /** Analytic two-bone IK in body space; elbows bend toward an outward/down pole. */
  private solve(arm: Arm, target: THREE.Vector3) {
    const S = arm.shoulder.position;
    _d.subVectors(target, S);
    const dist = THREE.MathUtils.clamp(_d.length(), 0.08, L1 + L2 - 0.002);
    _d.normalize();
    _pole.set(arm.side * 0.9, -0.6, -0.5).normalize();
    _k.crossVectors(_d, _pole);
    if (_k.lengthSq() < 1e-6) _k.set(1, 0, 0);
    _k.normalize();
    const a = Math.acos(THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
    _u.crossVectors(_k, _d); // perpendicular toward pole
    _u.multiplyScalar(Math.sin(a)).addScaledVector(_d, Math.cos(a)).normalize();
    _y.copy(_u).negate();
    _z.crossVectors(_k, _y);
    _basis.makeBasis(_k, _y, _z);
    arm.shoulder.quaternion.setFromRotationMatrix(_basis);
    _e.copy(S).addScaledVector(_u, L1);
    _f.subVectors(target, _e).normalize();
    arm.elbow.rotation.x = Math.atan2(-_f.dot(_z), -_f.dot(_y));
  }
}
