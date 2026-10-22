// Animated student: drives the skinned rig from characterBuild.ts with a small
// procedural pose system and analytic two-bone arm IK. No per-frame allocations.
import * as THREE from 'three';
import type { AvatarVariant, Expression } from '../lib/avatars';
import { L1, L2, STAND_ROOT_Y, buildCharacter, heldItems, type CharacterRig } from './characterBuild';
import { materials } from './toon';

export { disposeCharacterCache } from './characterBuild';

export type Status = 'focusing' | 'break' | 'away';
export type FocusAct = 'write' | 'read' | 'type';
type Act = FocusAct | 'sip' | 'stretch' | 'drink' | 'phone' | 'lean' | 'chairRead' | 'idle';

/** Root height when seated on a chair so the feet touch the floor. */
export const CHAIR_ROOT_Y = 0.17;
export { STAND_ROOT_Y };
/** Continuous focus after which the face turns exhausted. */
const EXHAUSTED_AFTER = 20 * 60;

interface Arm { shoulder: THREE.Bone; elbow: THREE.Bone; hand: THREE.Bone; side: number }

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
  readonly root: THREE.Group;
  readonly body: THREE.Bone;
  readonly head: THREE.Bone;
  readonly rig: CharacterRig;
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
  private lastStatus: Status | null = null;
  private focusSince = 0;
  private nextSmile = 0;
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
    this.phone.rotation.set(-1.2, 0, 0);
    this.phone.position.set(0.04, -0.05, 0.03);
    const b = this.rig.bones;
    this.armL = { shoulder: b.shoulderL, elbow: b.elbowL, hand: b.handL, side: -1 };
    this.armR = { shoulder: b.shoulderR, elbow: b.elbowR, hand: b.handR, side: 1 };
    this.armR.hand.add(this.pen, this.phone);
    this.pen.visible = this.phone.visible = false;
    const now = performance.now() / 1000;
    this.nextSip = now + 8 + this.rand() * 30;
    this.nextPage = now + 6 + this.rand() * 20;
    this.nextBlink = now + this.rand() * 3;
  }

  /** Release per-instance GPU state (bone texture). Geometry and materials are shared. */
  dispose() {
    this.rig.dispose();
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
    this.rig.setExpression('smile');
    this.applyPose();
  }

  /** Static standing pose (arms at the sides) for the dev gallery. */
  poseStanding(expr: Expression = this.variant.spec.expression) {
    this.act = 'idle';
    this.root.position.y = STAND_ROOT_Y;
    this.cL.set(-0.29, 0.2, 0.06); this.cR.set(0.29, 0.2, 0.06);
    this.lean = this.sway = this.hp = this.hy = this.hr = 0;
    this.rig.setExpression(expr);
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
    if (this.status !== this.lastStatus) {
      if (this.status === 'focusing') this.focusSince = now;
      this.lastStatus = this.status;
    }
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
        this.tL.set(-0.13, 0.42, 0.34); this.tR.set(0.13, 0.42, 0.34);
        if (this.pageT < 0 && now > this.nextPage) { this.pageT = 0; this.nextPage = now + 12 + this.rand() * 15; }
        if (this.pageT >= 0) {
          this.pageT += dt / 1.2;
          const p = Math.min(1, this.pageT);
          this.tR.set(0.13 - p * 0.2, 0.42 + Math.sin(p * Math.PI) * 0.06, 0.36);
          if (this.hooks.page) this.hooks.page.rotation.y = -p * Math.PI;
          if (this.pageT >= 1) { this.pageT = -1; if (this.hooks.page) this.hooks.page.rotation.y = 0; }
        }
        this.leanT = -0.05; this.hpT = 0.42; this.hyT = 0.06 * Math.sin(t * 0.6);
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
    let blink = false;
    if (now > this.nextBlink) {
      if (now - this.nextBlink < 0.14) blink = true; else this.nextBlink = now + 2 + this.rand() * 4.5;
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
    this.rig.setExpression(closed || blink ? 'blink' : this.mood(now));
    this.body.scale.y = 1 + 0.012 * Math.sin(t * 1.7);
    this.applyPose();
  }

  /** Face for the current status: focus → focused/determined (exhausted after a long stretch), break → smile/sleepy. */
  private mood(now: number): Expression {
    if (this.chair) {
      if (now > this.nextSmile + 3) this.nextSmile = now + 10 + this.rand() * 20;
      return now > this.nextSmile ? 'smile' : 'focused';
    }
    if (this.status === 'break') return this.act === 'lean' || this.act === 'drink' ? 'sleepy' : 'smile';
    if (now - this.focusSince > EXHAUSTED_AFTER) return 'exhausted';
    return this.variant.spec.expression === 'determined' ? 'determined' : 'focused';
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
