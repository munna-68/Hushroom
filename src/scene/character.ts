// Animated student: drives the skinned rig from characterBuild.ts with a small
// procedural pose system and analytic two-bone arm IK. No per-frame allocations.
//
// Hands follow two-stage (ease-in/ease-out) springs toward per-act targets; props
// that are handled (mug, page, phone) are driven from the solved hand position so
// they never drift out of the hand or teleport when put down.
import * as THREE from 'three';
import type { AvatarVariant, Expression } from '../lib/avatars';
import { L1, L2, STAND_ROOT_Y, buildCharacter, heldItems, type CharacterRig } from './characterBuild';
import { materials } from './toon';

export { disposeCharacterCache } from './characterBuild';

export type Status = 'focusing' | 'break' | 'away';
export type FocusAct = 'write' | 'read' | 'type';
type BreakAct = 'stretch' | 'drink' | 'phone' | 'nap' | 'gaze' | 'recline' | 'chat';
type Act = FocusAct | BreakAct | 'sip' | 'think' | 'neck' | 'chairRead' | 'idle';

/** Root height when seated on a chair so the feet touch the floor. */
export const CHAIR_ROOT_Y = 0.17;
export { STAND_ROOT_Y };

/** A turnable page: `pivot` rotates about `axis` through the spine from `from` to `to`. */
export interface PageHook {
  pivot: THREE.Object3D;
  axis: 'y' | 'z';
  from: number;
  to: number;
  grab: THREE.Vector3; // pivot-local point the fingers pinch
  lift: THREE.Vector3; // offset in the pivot's parent space so the hand rests on, not in, the page
  side: -1 | 1; // which arm turns it
}

export interface CharacterHooks {
  /** Mug on the table, in the seat's anchor space (sibling of the character root). */
  tableMug?: THREE.Object3D;
  page?: PageHook;
  /** Hand-held book in root space with the two book-local hold points (−x arm, +x arm). */
  book?: { obj: THREE.Object3D; hold: [THREE.Vector3, THREE.Vector3] };
}

interface Arm {
  shoulder: THREE.Bone; elbow: THREE.Bone; hand: THREE.Bone; side: number;
  t: THREE.Vector3; // target
  m: THREE.Vector3; // spring stage 1
  c: THREE.Vector3; // spring stage 2 (current)
  o: THREE.Vector3; // additive detail (taps, scribbles) applied after the spring
  tip: THREE.Vector3; // solved hand position, root space
  k: number;
  direct: boolean; // follow the target exactly (scripted prop handling)
}

/** Two-stage smoothed scalar: eases in and out instead of snapping toward the target. */
class Sm {
  v = 0; m = 0; t = 0;
  step(a: number) { this.m += (this.t - this.m) * a; this.v += (this.m - this.v) * a; }
}

// Scratch objects shared by all characters (single-threaded render loop).
const _inv = new THREE.Matrix4();
const _rootInv = new THREE.Matrix4();
const _rootWInv = new THREE.Matrix4();
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
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _g = new THREE.Vector3();
const _px = new THREE.Vector3();
const _pu = new THREE.Vector3();
const _pn = new THREE.Vector3();

const TY = 0.565; // hand resting on the table top
const SIP_T = 4.3;
const STRETCH_T = 5.4;
// Head-local points (head faces +z).
const MOUTH = new THREE.Vector3(0, -0.15, 0.3);
const CHIN = new THREE.Vector3(0, -0.33, 0.12);
const EYES = new THREE.Vector3(0, -0.06, 0.28);
// Mug-local points with the handle toward +x (mirrored for left-hand mugs).
const MUG_GRIP = new THREE.Vector3(0.105, 0.062, 0);
const MUG_RIM = new THREE.Vector3(0, 0.108, -0.048);

const BREAK_ACTS: BreakAct[] = ['stretch', 'drink', 'phone', 'nap', 'gaze', 'recline', 'chat'];
const BREAK_DUR: Record<BreakAct, [number, number]> = {
  stretch: [STRETCH_T, 0], drink: [14, 10], phone: [10, 12], nap: [14, 12], gaze: [9, 8], recline: [10, 10], chat: [8, 7],
};
const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const smoother = (x: number) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const ph = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
/** 0 → 1 over [a, b], held, then 1 → 0 over [c, d]. */
const win = (x: number, a: number, b: number, c: number, d: number) => smooth((x - a) / (b - a)) * (1 - smooth((x - c) / (d - c)));
/** Rotate v about +x by −tau (tips a mug's rim toward −z, the drinker). */
const tilt = (v: THREE.Vector3, tau: number) => {
  const c = Math.cos(tau), s = Math.sin(tau), y = v.y, z = v.z;
  v.y = y * c + z * s; v.z = -y * s + z * c;
  return v;
};

const mkArm = (shoulder: THREE.Bone, elbow: THREE.Bone, hand: THREE.Bone, side: number): Arm => {
  const rest = new THREE.Vector3(side * 0.15, 0.4, 0.2);
  return { shoulder, elbow, hand, side, t: rest.clone(), m: rest.clone(), c: rest.clone(), o: new THREE.Vector3(), tip: rest.clone(), k: 8, direct: false };
};

export class Character {
  readonly root: THREE.Group;
  readonly body: THREE.Bone;
  readonly head: THREE.Bone;
  readonly rig: CharacterRig;
  private armL: Arm;
  private armR: Arm;
  private pen: THREE.Mesh;
  private phone: THREE.Mesh;
  readonly variant: AvatarVariant;

  status: Status = 'focusing';
  focusAct: FocusAct = 'write';
  private hooks: CharacterHooks = {};
  private chair: boolean;
  private started = false;
  private act: Act = 'idle';
  private actStart = 0;
  private actUntil = 0;
  private mode: 'focus' | 'break' = 'focus';
  private switchAt = 0;
  private nextMicro = 0;
  private dir = 1; // which neighbour/side the current act favours
  private phase = -1; // sub-phase marker for one-time captures
  private nextPage = 0;
  private pageStart = -1;
  private pagePhase = 0;
  private pageOff = new THREE.Vector3();
  private nextBlink = 0;
  private nextTilt = 0;
  private nextLook = 0;
  private seed: number;
  private rand: () => number;
  private lean = new Sm(); private sway = new Sm(); private yaw = new Sm();
  private hp = new Sm(); private hy = new Sm(); private hr = new Sm();
  private tiltY = 0; private tiltR = 0;
  private kBody = 4;
  private breath = 1.7; private breathAmp = 0.012;
  private expr: Expression | null = null;
  private from = new THREE.Vector3();
  // Mug handling: the table mug itself is carried, so put-down lands exactly where it was.
  private mugHome = new THREE.Vector3();
  private mugYaw = 0;
  private mugS = 1;
  private mugArm: Arm;
  private mugHeld = false;
  private mugTilt = 0;
  private tiltFrom = 0;
  private mugOff = new THREE.Vector3();
  private mugOffK = 0;
  private bookPos = new THREE.Vector3();
  private bookRotX = 0;
  private forced: string | null = null;
  /** Scene hook: no new micro act (sip, think, neck roll) or page turn starts before this time. */
  quietUntil = 0;

  constructor(v: AvatarVariant, opts: { chair?: boolean; seed?: number; standing?: boolean } = {}) {
    this.variant = v;
    this.chair = !!opts.chair;
    this.seed = opts.seed ?? v.id * 7 + 3;
    let s = (this.seed * 2654435761) >>> 0 || 1;
    this.rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
    this.rig = buildCharacter(v.spec, { standing: opts.standing });
    this.root = this.rig.root;
    this.body = this.rig.bones.torso;
    this.head = this.rig.bones.head;
    const m = materials();
    const it = heldItems();
    this.pen = new THREE.Mesh(it.pen, m.toon);
    this.phone = new THREE.Mesh(it.phone, m.toon);
    const b = this.rig.bones;
    this.armL = mkArm(b.shoulderL, b.elbowL, b.handL, -1);
    this.armR = mkArm(b.shoulderR, b.elbowR, b.handR, 1);
    this.mugArm = this.armR;
    this.armR.hand.add(this.pen);
    this.root.add(this.phone);
    this.pen.visible = this.phone.visible = false;
    this.applyPose();
  }

  /** Release per-instance GPU state (bone texture). Geometry and materials are shared. */
  dispose() {
    this.park();
    this.root.remove(this.phone);
    this.rig.dispose();
  }

  /** Connect the props this character handles. */
  attach(h: CharacterHooks) {
    this.hooks = h;
    const mug = h.tableMug;
    if (mug) {
      // Remember the true resting place once, even if a previous occupant left it mid-air.
      const home = (mug.userData.home ??= { p: mug.position.clone(), yaw: mug.rotation.y }) as { p: THREE.Vector3; yaw: number };
      this.mugHome.copy(home.p);
      this.mugYaw = home.yaw;
      this.mugS = home.p.x >= 0 ? 1 : -1;
      this.mugArm = this.mugS > 0 ? this.armR : this.armL;
    }
    if (h.book) { this.bookPos.copy(h.book.obj.position); this.bookRotX = h.book.obj.rotation.x; }
  }

  /** Put handled props back (seat left, went away) and forget the current act. */
  park() {
    this.mugHeld = false;
    this.placeMug();
    const pg = this.hooks.page;
    if (pg) pg.pivot.rotation[pg.axis] = pg.from;
    this.pageStart = -1;
    this.pagePhase = 0;
    this.phone.visible = false;
    this.act = 'idle';
    this.started = false;
  }

  /** Scene hook: true while a sip, page turn or held mug is mid-gesture and must not be cut. */
  get gesturing(): boolean { return this.pageStart >= 0 || this.mugHeld || this.act === 'sip'; }

  /** Dev: jump straight into an act (or 'page' to turn a page) on the next update. */
  play(name: string) { this.forced = name; }

  /** Static pose for thumbnails. */
  posePortrait() {
    this.act = 'idle';
    this.armL.c.set(-0.12, 0.45, 0.28); this.armR.c.set(0.12, 0.45, 0.28);
    this.armL.o.set(0, 0, 0); this.armR.o.set(0, 0, 0);
    this.hp.v = 0.05; this.hr.v = 0.08;
    this.rig.setExpression('smile');
    this.applyPose();
  }

  /** Static standing pose (arms at the sides) for the dev gallery. */
  poseStanding(expr: Expression = this.variant.spec.expression) {
    this.act = 'idle';
    this.root.position.y = STAND_ROOT_Y;
    this.armL.c.set(-0.27, 0.15, 0.05); this.armR.c.set(0.27, 0.15, 0.05);
    this.armL.o.set(0, 0, 0); this.armR.o.set(0, 0, 0);
    this.lean.v = this.sway.v = this.hp.v = this.hy.v = this.hr.v = this.yaw.v = 0;
    this.rig.setExpression(expr);
    this.applyPose();
  }

  // ---- scheduling ------------------------------------------------------------

  private start(now: number) {
    this.started = true;
    this.mode = this.status === 'break' ? 'break' : 'focus';
    this.switchAt = 0;
    this.nextMicro = now + 6 + this.rand() * 26;
    this.nextPage = now + 4 + this.rand() * 14;
    this.nextBlink = now + this.rand() * 3;
    this.nextLook = now + 8 + this.rand() * 20;
    this.actUntil = now;
  }

  private setAct(a: Act, now: number, dur: number) {
    this.mugHeld = false;
    this.phase = -1;
    this.act = a;
    this.actStart = now;
    this.actUntil = now + dur;
  }

  /** True while an act is mid-gesture and must not be cut. */
  private busy(now: number) {
    if (this.pageStart >= 0) return true;
    return (this.act === 'sip' || this.act === 'stretch' || this.act === 'drink') && now < this.actUntil;
  }

  private pickAct(now: number) {
    if (this.forced) {
      const f = this.forced;
      this.forced = null;
      if (f === 'page') { this.nextPage = now; return; }
      if (BREAK_ACTS.includes(f as BreakAct)) {
        this.status = 'break'; this.mode = 'break'; this.dir = this.rand() < 0.5 ? -1 : 1;
        const [base, spread] = BREAK_DUR[f as BreakAct];
        this.setAct(f as Act, now, base + spread * 0.5);
      } else if (!this.chair) {
        this.status = 'focusing'; this.mode = 'focus';
        this.setAct(f as Act, now, f === 'sip' ? SIP_T : f === 'think' ? 5 : f === 'neck' ? 3.4 : 1e9);
      }
      return;
    }
    if (this.chair) { if (this.act !== 'chairRead') this.setAct('chairRead', now, 1e9); return; }
    const want = this.status === 'break' ? 'break' : 'focus';
    if (want !== this.mode) {
      // Everyone hears the timer at once but reacts in their own time.
      if (!this.switchAt) this.switchAt = now + 0.3 + this.rand() * 5.5;
      if (now >= this.switchAt) {
        if (this.act === 'drink') this.endDrinkSoon(now);
        if (!this.busy(now)) { this.mode = want; this.switchAt = 0; this.actUntil = now; }
      }
    } else this.switchAt = 0;

    if (this.mode === 'break') {
      if (BREAK_ACTS.includes(this.act as BreakAct) && now < this.actUntil) return;
      const opts = BREAK_ACTS.filter((a) => a !== this.act && (a !== 'drink' || this.hooks.tableMug));
      const a = opts[Math.floor(this.rand() * opts.length)];
      const [base, spread] = BREAK_DUR[a];
      this.dir = this.rand() < 0.5 ? -1 : 1;
      this.setAct(a, now, base + this.rand() * spread);
      return;
    }
    if ((this.act === 'sip' || this.act === 'think' || this.act === 'neck') && now < this.actUntil) return;
    if (this.act !== this.focusAct) { this.setAct(this.focusAct, now, 1e9); return; }
    if (now > this.nextMicro && this.pageStart < 0 && now >= this.quietUntil) {
      const r = this.rand();
      this.dir = this.rand() < 0.5 ? -1 : 1;
      if (this.hooks.tableMug && r < 0.5) this.setAct('sip', now, SIP_T);
      else if (r < 0.85) this.setAct('think', now, 3.5 + this.rand() * 4);
      else this.setAct('neck', now, 3.4);
      this.nextMicro = now + 14 + this.rand() * 30;
    }
  }

  private endDrinkSoon(now: number) {
    const local = now - this.actStart;
    const T = this.actUntil - this.actStart;
    if (local >= T - 1.85) return; // already putting it down
    this.actUntil = local < 1.85 ? this.actStart + 3.7 : now + 1.85;
  }

  // ---- frame -----------------------------------------------------------------

  update(now: number, dt: number) {
    if (!this.root.visible) return;
    if (!this.started) this.start(now);
    this.root.updateMatrix();
    _rootInv.copy(this.root.matrix).invert();
    _rootWInv.copy(this.root.matrixWorld).invert();
    this.pickAct(now);
    const t = now + this.seed;
    const local = now - this.actStart;
    const L = this.armL, R = this.armR;
    this.pen.visible = false;
    this.phone.visible = false;
    this.expr = null;
    this.kBody = 4;
    this.breath = 1.7; this.breathAmp = 0.012;
    this.sway.t = 0; this.yaw.t = 0; this.lean.t = 0; this.hp.t = 0.1; this.hy.t = 0;
    L.o.set(0, 0, 0); R.o.set(0, 0, 0);
    L.direct = R.direct = false;
    L.k = R.k = 8;

    // Idle life: small head tilts and glances.
    if (now > this.nextTilt) {
      this.tiltR = (this.rand() - 0.5) * 0.22;
      this.tiltY = (this.rand() - 0.5) * 0.24;
      this.nextTilt = now + 3 + this.rand() * 6;
    }
    this.hr.t = this.tiltR;
    let glance = this.tiltY;

    switch (this.act) {
      case 'write': case 'read': case 'type':
        this.focusBase(t);
        if (this.act === 'read') this.maybeTurnPage(now);
        break;
      case 'sip': this.focusBase(t); this.sip(local); break;
      case 'think': this.think(t, local); break;
      case 'neck': {
        this.focusBase(t);
        const w = win(local, 0, 0.7, 2.6, 3.4);
        this.hr.t += 0.32 * Math.sin(local * 2.1) * w;
        this.hp.t = this.hp.t * (1 - w) - 0.12 * w;
        L.o.multiplyScalar(1 - w); R.o.multiplyScalar(1 - w);
        if (w > 0.5) this.expr = 'blink';
        glance *= 1 - w;
        break;
      }
      case 'drink': this.drink(t, local); break;
      case 'stretch': this.stretch(local); glance = 0; break;
      case 'phone': this.phoneAct(t, local); break;
      case 'nap': {
        L.t.set(-0.13, TY + 0.02, 0.37); R.t.set(0.12, TY + 0.02, 0.39);
        L.k = R.k = 4;
        this.lean.t = 0.28; this.hp.t = 0.24; this.hr.t = 0.32 * this.dir; this.hy.t = 0.22 * this.dir;
        this.kBody = 2.2; this.breath = 0.85; this.breathAmp = 0.026;
        this.expr = local > 1.2 ? 'blink' : 'sleepy';
        glance = 0;
        break;
      }
      case 'recline': {
        this.bodyPoint(-0.075, 0.17, 0.24, L.t); this.bodyPoint(0.075, 0.19, 0.245, R.t);
        L.k = R.k = 4;
        this.lean.t = -0.16; this.hp.t = -0.1; this.hr.t += 0.14 * this.dir; this.hy.t = 0.1 * this.dir;
        this.kBody = 2.5; this.breath = 1.0; this.breathAmp = 0.022;
        this.expr = Math.sin(t * 0.4) > 0.2 ? 'blink' : 'sleepy';
        glance *= 0.3;
        break;
      }
      case 'gaze': {
        // Chin in hand, elbow on the table, eyes drifting toward the window.
        const arm = this.dir > 0 ? R : L, other = this.dir > 0 ? L : R;
        this.headPoint(CHIN, arm.t); arm.t.x += this.dir * 0.05;
        other.t.set(-this.dir * 0.16, TY, 0.4);
        arm.k = other.k = 5;
        this.lean.t = 0.17; this.hp.t = 0.02 + 0.06 * Math.sin(t * 0.17);
        this.hy.t = 0.18 * this.dir + 0.35 * Math.sin(t * 0.11); this.hr.t += 0.16 * this.dir;
        this.kBody = 2.5;
        this.expr = Math.sin(t * 0.23) > 0.3 ? 'sleepy' : 'focused';
        glance = 0;
        break;
      }
      case 'chat': {
        const d = this.dir, near = d > 0 ? R : L, far = d > 0 ? L : R;
        const talk = smooth(Math.sin(t * 0.7) * 2 + 0.4);
        this.bodyPoint(d * 0.14, 0.36, 0.3, near.t);
        near.t.x += d * 0.03 * Math.sin(t * 2.3) * talk;
        near.t.y += (0.03 + 0.04 * Math.abs(Math.sin(t * 1.7))) * talk;
        near.t.z += 0.02 * Math.sin(t * 2.9) * talk;
        far.t.set(-d * 0.15, TY, 0.36);
        near.k = 6; far.k = 5;
        this.yaw.t = 0.26 * d; this.lean.t = 0.03;
        this.hy.t = 0.38 * d; this.hp.t = 0.04 + 0.06 * Math.max(0, Math.sin(t * 3.1)) * (1 - talk);
        this.expr = 'smile';
        glance = 0;
        break;
      }
      case 'chairRead': this.chairRead(t, now); break;
      default:
        L.t.set(-0.15, TY, 0.4); R.t.set(0.15, TY, 0.4);
        this.lean.t = 0; this.hp.t = 0.1; this.hy.t = 0;
    }

    let blink = false;
    if (now > this.nextBlink) {
      if (now - this.nextBlink < 0.14) blink = true; else this.nextBlink = now + 2 + this.rand() * 4.5;
    }

    this.integrate(L, dt);
    this.integrate(R, dt);
    const kb = damp(this.kBody, dt);
    this.hy.t += glance;
    this.lean.step(kb); this.sway.step(kb); this.yaw.step(kb);
    this.hp.step(kb); this.hy.step(kb); this.hr.step(kb);
    this.rig.setExpression(blink && this.expr !== 'blink' ? 'blink' : this.expr ?? this.mood());
    this.body.scale.y = 1 + this.breathAmp * Math.sin(t * this.breath);
    this.applyPose();
    this.placeMug();
  }

  private integrate(arm: Arm, dt: number) {
    if (arm.direct) { arm.m.copy(arm.t); arm.c.copy(arm.t); return; }
    const a = damp(arm.k, dt);
    arm.m.lerp(arm.t, a);
    arm.c.lerp(arm.m, a);
  }

  /** Face for the current status: focus → focused/determined, break → smile. */
  private mood(): Expression {
    if (this.mode === 'break' && this.act !== 'sip') return 'smile';
    return this.variant.spec.expression === 'determined' ? 'determined' : 'focused';
  }

  // ---- acts ------------------------------------------------------------------

  private focusBase(t: number) {
    const L = this.armL, R = this.armR;
    switch (this.focusAct) {
      case 'write': {
        // Write a line left to right, lift the pen and return to the next line.
        const cyc = 2.6, u = (t % cyc) / cyc, line = Math.floor(t / cyc) % 4;
        const z0 = 0.5 - line * 0.025, z1 = 0.5 - ((line + 1) % 4) * 0.025;
        if (u < 0.84) {
          const w = u / 0.84;
          R.t.set(0.1 + w * 0.09, TY, z0);
          R.o.set(0.006 * Math.sin(t * 23), 0.005 * Math.max(0, Math.sin(t * 11)), 0.005 * Math.cos(t * 23));
        } else {
          const w = smooth((u - 0.84) / 0.16);
          R.t.set(0.19 - w * 0.09, TY + 0.022 * Math.sin(w * Math.PI), z0 + (z1 - z0) * w);
        }
        R.k = 14;
        L.t.set(-0.17, TY, 0.46);
        this.pen.visible = true;
        this.lean.t = 0.12; this.hp.t = 0.3; this.hy.t = 0.04 + (R.t.x - 0.14) * 0.8;
        break;
      }
      case 'read': {
        L.t.set(-0.21, TY, 0.4);
        R.t.set(0.21, TY, 0.4);
        // Long stretches of reading with the chin propped on a hand.
        const prop = smooth((Math.sin(t * 0.045 + this.seed) - 0.35) * 2.5);
        if (prop > 0) { this.headPoint(CHIN, _a); _a.x += 0.05; R.t.lerp(_a, prop); }
        L.k = R.k = 6;
        this.lean.t = 0.1 + prop * 0.08; this.hp.t = 0.32 - prop * 0.06; this.hy.t = 0.1 * Math.sin(t * 0.5);
        break;
      }
      case 'type': {
        // Bursts of typing; in the pauses the right hand drifts to the trackpad.
        const g = smooth((Math.sin(t * 0.37) + 0.6 * Math.sin(t * 0.83 + 1.3) + 0.3) * 2);
        const pad = 1 - g;
        L.t.set(-0.11, TY, 0.46);
        R.t.set(0.11 - 0.1 * pad, TY, 0.46 - 0.05 * pad);
        L.o.y = g * 0.014 * Math.max(0, Math.sin(t * 17));
        R.o.set(pad * 0.012 * Math.sin(t * 1.3), g * 0.014 * Math.max(0, Math.sin(t * 15 + 1.7)), pad * 0.01 * Math.sin(t * 1.7));
        L.k = R.k = 10;
        this.lean.t = 0.04 + g * 0.03; this.hp.t = 0.1 + 0.05 * pad * Math.sin(t * 0.9); this.hy.t = 0.05 * Math.sin(t * 0.3);
        break;
      }
    }
  }

  private think(t: number, local: number) {
    this.focusBase(t);
    const dur = this.actUntil - this.actStart;
    const w = win(local, 0, 0.8, dur - 0.8, dur);
    const R = this.armR;
    this.headPoint(CHIN, _a); _a.x += 0.045;
    const pen = this.focusAct === 'write';
    if (pen) { _a.z += 0.02; _a.y += 0.012 * Math.max(0, Math.sin(local * 7)) * w; }
    R.t.lerp(_a, w); R.o.multiplyScalar(1 - w); R.k = 6;
    this.hp.t += ((pen ? -0.08 : 0.16) - this.hp.t) * w;
    this.hy.t += (0.28 * this.dir - this.hy.t) * w;
    this.lean.t += 0.05 * w;
  }

  private sip(local: number) {
    const arm = this.mugArm, s = this.mugS;
    if (arm === this.armR) this.pen.visible = false;
    arm.o.set(0, 0, 0);
    this.tableGrip(_b);
    let tau = 0;
    if (local < 0.85) {
      arm.t.copy(_b); arm.k = 7;
      this.hy.t = s * 0.22; this.hp.t = 0.3;
    } else if (local < 1.75) {
      if (!this.mugHeld) this.grabMug(arm);
      const e = smoother(ph(local, 0.85, 1.75));
      tau = 0.3 * e;
      this.mouthGrip(tau, _a);
      arm.t.lerpVectors(this.from, _a, e);
      arm.t.y += 0.03 * Math.sin(e * Math.PI); arm.t.x += s * 0.03 * Math.sin(e * Math.PI);
      arm.direct = true;
      this.mugOffK = 1 - e;
      this.hy.t = s * 0.22 * (1 - e); this.hp.t = 0.3 - 0.3 * e;
    } else if (local < 3.35) {
      const w = ph(local, 1.75, 3.35);
      const drink = win(w, 0, 0.3, 0.75, 1);
      tau = 0.3 + 0.5 * drink;
      this.mouthGrip(tau, arm.t);
      arm.direct = true;
      this.mugOffK = 0;
      this.hy.t = 0; this.hp.t = -0.1 * drink;
      if (drink > 0.6) this.expr = 'blink';
    } else {
      const e = smoother(ph(local, 3.35, 4.25));
      tau = 0.3 * (1 - e);
      this.mouthGrip(tau, _a);
      arm.t.lerpVectors(_a, _b, e);
      arm.t.y += 0.03 * Math.sin(e * Math.PI);
      arm.direct = true;
      this.hy.t = s * 0.2 * e; this.hp.t = 0.3 * e;
      if (e >= 1) this.mugHeld = false;
    }
    this.mugTilt = tau;
    this.lean.t += 0.04;
  }

  /** Break: pick up the mug, nurse it at chest height with the occasional sip, put it back. */
  private drink(t: number, local: number) {
    const arm = this.mugArm, other = arm === this.armR ? this.armL : this.armR, s = this.mugS;
    const T = this.actUntil - this.actStart;
    this.tableGrip(_b);
    this.bodyPoint(-s * 0.1, 0.13, 0.27, other.t); // other hand on the lap
    other.k = 5;
    this.lean.t = -0.06; this.hp.t = 0.12; this.kBody = 3;
    this.expr = Math.sin(t * 0.3) > 0.4 ? 'sleepy' : 'smile';
    let tau = 0;
    if (local < 0.85) {
      arm.t.copy(_b); arm.k = 7;
      this.lean.t = 0.05; this.hy.t = s * 0.22; this.hp.t = 0.3;
    } else if (local < 1.85 && local < T - 1.85) {
      if (!this.mugHeld) this.grabMug(arm);
      const e = smoother(ph(local, 0.85, 1.85));
      this.holdGrip(t, _a);
      arm.t.lerpVectors(this.from, _a, e);
      arm.t.y += 0.03 * Math.sin(e * Math.PI);
      arm.direct = true;
      this.mugOffK = 1 - e;
    } else if (local < T - 1.85) {
      const cyc = (local - 1.85) % 6.5;
      const lift = win(cyc, 2.2, 3.0, 4.4, 5.2);
      const sipW = win(cyc, 2.7, 3.2, 4.0, 4.5);
      tau = 0.3 * lift + 0.45 * sipW;
      this.holdGrip(t, _a);
      this.mouthGrip(tau, _c);
      arm.t.lerpVectors(_a, _c, lift);
      arm.direct = true;
      this.mugOffK = 0;
      // Cradle the mug with both hands between sips.
      _c.copy(arm.t); _c.x -= s * 0.17; _c.y -= 0.02;
      other.t.lerp(_c, 1 - lift); other.k = 9;
      this.hp.t = 0.12 - 0.2 * sipW;
      if (sipW > 0.6) this.expr = 'blink';
    } else if (local < T - 0.85) {
      if (this.phase !== 3) { this.phase = 3; this.from.copy(arm.t); this.tiltFrom = this.mugTilt; }
      const e = smoother(ph(local, T - 1.85, T - 0.85));
      tau = this.tiltFrom * (1 - e);
      arm.t.lerpVectors(this.from, _b, e);
      arm.t.y += 0.04 * Math.sin(e * Math.PI);
      arm.direct = true;
      this.lean.t = 0.05; this.hy.t = s * 0.2 * e; this.hp.t = 0.12 + 0.18 * e;
      if (e >= 1) this.mugHeld = false;
    } else {
      this.mugHeld = false;
      this.bodyPoint(s * 0.1, 0.13, 0.27, arm.t); arm.k = 5;
    }
    this.mugTilt = tau;
  }

  private stretch(local: number) {
    // Chibi arms are too short to go overhead, so they open into a big V.
    const up = win(local, 0.3, 1.4, 3.6, 4.9);
    const L = this.armL, R = this.armR;
    this.bodyPoint(-0.1, 0.13, 0.27, L.t); this.bodyPoint(0.1, 0.13, 0.27, R.t);
    _a.set(-0.5, 0.98, -0.02); L.t.lerp(_a, up);
    _a.set(0.5, 0.98, -0.02); R.t.lerp(_a, up);
    L.k = R.k = 5;
    this.lean.t = -0.14 * up; this.sway.t = 0.1 * Math.sin(local * 1.5) * up;
    this.hp.t = 0.08 - 0.3 * up; this.hy.t = 0;
    this.kBody = 3;
    this.expr = up > 0.5 ? 'blink' : 'smile';
  }

  private phoneAct(t: number, local: number) {
    const L = this.armL, R = this.armR;
    _a.set(0, 0.56 + 0.005 * Math.sin(t * 1.1), 0.31); // phone centre
    this.headPoint(EYES, _pn).sub(_a).normalize();
    _pu.set(0, 0, 1).addScaledVector(_pn, -_pn.z).normalize(); // phone "up" points away from the body
    _px.crossVectors(_pu, _pn);
    R.t.copy(_a).addScaledVector(_px, 0.05).addScaledVector(_pu, -0.045).addScaledVector(_pn, -0.012);
    L.t.copy(_a).addScaledVector(_px, -0.05).addScaledVector(_pu, -0.035).addScaledVector(_pn, -0.012);
    // Thumb flicks to scroll.
    const flick = win((t * 0.55) % 1, 0, 0.06, 0.1, 0.22);
    R.o.copy(_pu).multiplyScalar(0.022 * flick);
    L.k = R.k = 7;
    this.lean.t = 0.1; this.hp.t = 0.4; this.hy.t = 0.04 * Math.sin(t * 0.4);
    this.expr = Math.sin(t * 0.21 + this.seed) > 0.7 ? 'smile' : 'focused';
    if (local > 0.6) {
      this.phone.visible = true;
      this.phone.position.copy(_a);
      _basis.makeBasis(_px, _pu, _pn);
      this.phone.quaternion.setFromRotationMatrix(_basis);
    }
  }

  private chairRead(t: number, now: number) {
    const L = this.armL, R = this.armR;
    // Every so often look up from the book with a smile, then settle back in.
    if (now > this.nextLook + 4.2 && this.pageStart < 0) this.nextLook = now + 15 + this.rand() * 25;
    const look = win(now, this.nextLook, this.nextLook + 0.9, this.nextLook + 3.2, this.nextLook + 4.2);
    const bk = this.hooks.book;
    if (bk) {
      const o = bk.obj;
      o.position.copy(this.bookPos);
      o.position.y += 0.004 * Math.sin(t * 1.7) - 0.025 * look;
      o.rotation.x = this.bookRotX + 0.03 * Math.sin(t * 0.35) + 0.12 * look;
      o.updateMatrixWorld(true);
      L.t.copy(bk.hold[0]).applyMatrix4(o.matrix);
      R.t.copy(bk.hold[1]).applyMatrix4(o.matrix);
      L.k = R.k = 14;
    } else { L.t.set(-0.13, 0.42, 0.34); R.t.set(0.13, 0.42, 0.34); }
    this.lean.t = -0.05; this.hp.t = 0.42 - 0.34 * look; this.hy.t = 0.06 * Math.sin(t * 0.6) + 0.18 * look;
    this.kBody = 3;
    this.expr = look > 0.4 ? 'smile' : 'focused';
    this.maybeTurnPage(now);
  }

  // ---- page turning ----------------------------------------------------------

  private maybeTurnPage(now: number) {
    const pg = this.hooks.page;
    if (!pg) return;
    if (this.pageStart < 0) {
      if (now < this.nextPage || now < this.quietUntil) return;
      this.pageStart = now; this.pagePhase = 0;
      this.nextPage = now + (this.chair ? 12 : 14) + this.rand() * 22;
    }
    const lt = now - this.pageStart;
    const arm = pg.side < 0 ? this.armL : this.armR;
    if (lt < 0.5) {
      this.pageGrab(pg, pg.from, arm.t); arm.k = 12;
    } else if (lt < 1.55) {
      if (this.pagePhase !== 1) {
        this.pagePhase = 1;
        this.pageGrab(pg, pg.from, _c);
        this.pageOff.subVectors(arm.c, _c);
      }
      const e = smoother(ph(lt, 0.5, 1.55));
      this.pageGrab(pg, pg.from + (pg.to - pg.from) * e, arm.t);
      arm.t.addScaledVector(this.pageOff, 1 - e);
      arm.direct = true;
    } else {
      // The landed page and the reset one look identical, so the swap is invisible.
      pg.pivot.rotation[pg.axis] = pg.from;
      this.pageStart = -1;
      this.pagePhase = 0;
    }
  }

  /** Pose the page at `angle` and return the pinch point in root space. */
  private pageGrab(pg: PageHook, angle: number, out: THREE.Vector3) {
    pg.pivot.rotation[pg.axis] = angle;
    pg.pivot.updateMatrixWorld(true);
    out.copy(pg.grab).applyMatrix4(pg.pivot.matrixWorld);
    if (pg.pivot.parent) _a.copy(pg.lift).transformDirection(pg.pivot.parent.matrixWorld).multiplyScalar(pg.lift.length());
    else _a.copy(pg.lift);
    return out.add(_a).applyMatrix4(_rootWInv);
  }

  // ---- mug -------------------------------------------------------------------

  private grabMug(arm: Arm) {
    this.mugHeld = true;
    this.from.copy(arm.c);
    // Absorb any residual gap between hand and handle over the lift.
    this.mugHomeRoot(this.mugOff).sub(arm.tip).add(this.gripVec(_c, 0));
    this.mugOffK = 1;
  }

  private mugHomeRoot(out: THREE.Vector3) { return out.copy(this.mugHome).applyMatrix4(_rootInv); }
  private gripVec(out: THREE.Vector3, tau: number) { out.copy(MUG_GRIP); out.x *= this.mugS; return tilt(out, tau); }
  private tableGrip(out: THREE.Vector3) { return this.mugHomeRoot(out).add(this.gripVec(_c, 0)); }
  /** Hand position that puts the mug's near rim at the lips with the given tilt. */
  private mouthGrip(tau: number, out: THREE.Vector3) {
    this.headPoint(MOUTH, out);
    _g.copy(MUG_GRIP); _g.x *= this.mugS;
    return out.add(tilt(_g.sub(MUG_RIM), tau));
  }
  /** Hand position holding the mug in front of the chest. */
  private holdGrip(t: number, out: THREE.Vector3) {
    this.bodyPoint(this.mugS * 0.02, 0.3, 0.37, out);
    out.y += 0.004 * Math.sin(t * 1.2);
    return out.add(this.gripVec(_c, 0));
  }

  private placeMug() {
    const mug = this.hooks.tableMug;
    if (!mug) return;
    if (!this.mugHeld) {
      mug.position.copy(this.mugHome);
      mug.rotation.set(0, this.mugYaw, 0);
      return;
    }
    const arm = this.mugArm;
    mug.position.copy(arm.tip).sub(this.gripVec(_c, this.mugTilt)).addScaledVector(this.mugOff, this.mugOffK).applyMatrix4(this.root.matrix);
    mug.rotation.set(-this.mugTilt, this.mugYaw, 0);
  }

  // ---- pose ------------------------------------------------------------------

  private headPoint(p: THREE.Vector3, out: THREE.Vector3) {
    return out.copy(p).applyMatrix4(this.head.matrix).applyMatrix4(this.body.matrix);
  }

  private bodyPoint(x: number, y: number, z: number, out: THREE.Vector3) {
    return out.set(x, y, z).applyMatrix4(this.body.matrix);
  }

  private applyPose() {
    this.body.rotation.set(this.lean.v, this.yaw.v, this.sway.v);
    this.head.rotation.set(this.hp.v - this.lean.v * 0.5, this.hy.v - this.yaw.v * 0.4, this.hr.v);
    this.body.updateMatrix();
    this.head.updateMatrix();
    _inv.copy(this.body.matrix).invert();
    this.solve(this.armL, _t.copy(this.armL.c).add(this.armL.o).applyMatrix4(_inv));
    this.solve(this.armR, _t.copy(this.armR.c).add(this.armR.o).applyMatrix4(_inv));
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
    arm.tip.copy(_e).addScaledVector(_f, L2).applyMatrix4(this.body.matrix);
  }
}
