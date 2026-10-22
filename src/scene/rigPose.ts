// Full-body poses on the existing 14-bone rig (characterBuild.ts) for everything the
// seated act system (character.ts) doesn't do: standing, walking, getting up and
// sitting down, stools, the sofa, browsing shelves. Same conventions as character.ts:
// torso/head Euler angles, hand targets in root space, analytic two-bone arm IK,
// here with a per-arm elbow pole. Nothing here allocates per frame.
import * as THREE from 'three';
import { HEAD_Y, L1, L2, STAND_ROOT_Y, TORSO_Y, type BoneName, type CharacterRig } from './characterBuild';

export { STAND_ROOT_Y };
export const SEAT_HIP = -Math.PI / 2;
export const SEAT_KNEE = Math.PI / 2;
/** Hip joint height above the root, and hip-to-sole length when standing. */
export const HIP_Y = 0.17;
export const LEG_LEN = STAND_ROOT_Y + HIP_Y;

export interface Pose {
  lean: number; yaw: number; sway: number;
  hp: number; hy: number; hr: number;
  /** Hand targets in root space. */
  armL: THREE.Vector3; armR: THREE.Vector3;
  /** Elbow pole directions in torso space. */
  poleL: THREE.Vector3; poleR: THREE.Vector3;
  hipL: number; kneeL: number; hipR: number; kneeR: number;
  /** Legs apart (hip roll), radians. */
  splay: number;
  breath: number;
}

export function makePose(): Pose {
  return {
    lean: 0, yaw: 0, sway: 0, hp: 0, hy: 0, hr: 0,
    armL: new THREE.Vector3(-0.27, 0.15, 0.05), armR: new THREE.Vector3(0.27, 0.15, 0.05),
    poleL: new THREE.Vector3(-0.9, -0.6, -0.5), poleR: new THREE.Vector3(0.9, -0.6, -0.5),
    hipL: 0, kneeL: 0, hipR: 0, kneeR: 0, splay: 0, breath: 1,
  };
}

export function copyPose(d: Pose, s: Pose): Pose {
  d.lean = s.lean; d.yaw = s.yaw; d.sway = s.sway; d.hp = s.hp; d.hy = s.hy; d.hr = s.hr;
  d.armL.copy(s.armL); d.armR.copy(s.armR); d.poleL.copy(s.poleL); d.poleR.copy(s.poleR);
  d.hipL = s.hipL; d.kneeL = s.kneeL; d.hipR = s.hipR; d.kneeR = s.kneeR; d.splay = s.splay; d.breath = s.breath;
  return d;
}

const L = (a: number, b: number, t: number) => a + (b - a) * t;
export function lerpPose(d: Pose, a: Pose, b: Pose, t: number): Pose {
  d.lean = L(a.lean, b.lean, t); d.yaw = L(a.yaw, b.yaw, t); d.sway = L(a.sway, b.sway, t);
  d.hp = L(a.hp, b.hp, t); d.hy = L(a.hy, b.hy, t); d.hr = L(a.hr, b.hr, t);
  d.armL.lerpVectors(a.armL, b.armL, t); d.armR.lerpVectors(a.armR, b.armR, t);
  d.poleL.lerpVectors(a.poleL, b.poleL, t); d.poleR.lerpVectors(a.poleR, b.poleR, t);
  d.hipL = L(a.hipL, b.hipL, t); d.kneeL = L(a.kneeL, b.kneeL, t); d.hipR = L(a.hipR, b.hipR, t); d.kneeR = L(a.kneeR, b.kneeR, t);
  d.splay = L(a.splay, b.splay, t); d.breath = L(a.breath, b.breath, t);
  return d;
}

/** Damp every pose channel toward a goal (critically smooth, frame-rate independent). */
export function dampPose(d: Pose, goal: Pose, k: number, dt: number): Pose {
  return lerpPose(d, d, goal, 1 - Math.exp(-k * dt));
}

// ---- matrices for head-relative targets -------------------------------------------

const _tm = new THREE.Matrix4();
const _hm = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _eu = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Torso matrix (root space) for a pose, as character.ts builds it. */
function torsoMatrix(p: Pose, out: THREE.Matrix4) {
  return out.compose(_p.set(0, TORSO_Y, 0.03), _q.setFromEuler(_eu.set(p.lean, p.yaw, p.sway)), _s.set(1, p.breath, 1));
}
function headMatrix(p: Pose, out: THREE.Matrix4) {
  return out.compose(_p.set(0, HEAD_Y, 0), _q.setFromEuler(_eu.set(p.hp - p.lean * 0.5, p.hy - p.yaw * 0.4, p.hr)), _s.set(1, 1, 1));
}
/** Head-local point → root space for this pose. */
export function headPoint(p: Pose, local: THREE.Vector3, out: THREE.Vector3) {
  torsoMatrix(p, _tm); headMatrix(p, _hm);
  return out.copy(local).applyMatrix4(_hm).applyMatrix4(_tm);
}
/** Torso-local point → root space for this pose. */
export function bodyPoint(p: Pose, x: number, y: number, z: number, out: THREE.Vector3) {
  torsoMatrix(p, _tm);
  return out.set(x, y, z).applyMatrix4(_tm);
}

// Head-local points (head faces +z), shared with the seated system's conventions.
export const MOUTH = new THREE.Vector3(0, -0.15, 0.3);
export const CHIN = new THREE.Vector3(0, -0.33, 0.12);
export const EYES = new THREE.Vector3(0, -0.06, 0.28);
export const BACK_OF_HEAD = new THREE.Vector3(0, 0.02, -0.3);

// ---- applying a pose -----------------------------------------------------------------

const _inv = new THREE.Matrix4();
const _basis = new THREE.Matrix4();
const _t = new THREE.Vector3(), _d = new THREE.Vector3(), _k = new THREE.Vector3(), _u = new THREE.Vector3();
const _y = new THREE.Vector3(), _z = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _pole = new THREE.Vector3();

function solve(shoulder: THREE.Bone, elbow: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3) {
  const S = shoulder.position;
  _d.subVectors(target, S);
  const dist = THREE.MathUtils.clamp(_d.length(), 0.08, L1 + L2 - 0.002);
  _d.normalize();
  _pole.copy(pole).normalize();
  _k.crossVectors(_d, _pole);
  if (_k.lengthSq() < 1e-6) _k.set(1, 0, 0);
  _k.normalize();
  const a = Math.acos(THREE.MathUtils.clamp((L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist), -1, 1));
  _u.crossVectors(_k, _d);
  _u.multiplyScalar(Math.sin(a)).addScaledVector(_d, Math.cos(a)).normalize();
  _y.copy(_u).negate();
  _z.crossVectors(_k, _y);
  _basis.makeBasis(_k, _y, _z);
  shoulder.quaternion.setFromRotationMatrix(_basis);
  _e.copy(S).addScaledVector(_u, L1);
  _f.subVectors(target, _e).normalize();
  elbow.rotation.set(Math.atan2(-_f.dot(_z), -_f.dot(_y)), 0, 0);
}

export function applyPose(rig: CharacterRig, p: Pose) {
  const b = rig.bones;
  b.torso.rotation.set(p.lean, p.yaw, p.sway);
  b.torso.scale.y = p.breath;
  b.head.rotation.set(p.hp - p.lean * 0.5, p.hy - p.yaw * 0.4, p.hr);
  b.torso.updateMatrix();
  _inv.copy(b.torso.matrix).invert();
  solve(b.shoulderL, b.elbowL, _t.copy(p.armL).applyMatrix4(_inv), p.poleL);
  solve(b.shoulderR, b.elbowR, _t.copy(p.armR).applyMatrix4(_inv), p.poleR);
  b.hipL.rotation.set(p.hipL, 0, -p.splay);
  b.kneeL.rotation.set(p.kneeL, 0, 0);
  b.hipR.rotation.set(p.hipR, 0, p.splay);
  b.kneeR.rotation.set(p.kneeR, 0, 0);
}

// ---- blending with the seated act system ------------------------------------------------

const UPPER: BoneName[] = ['torso', 'head', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR'];

/** Snapshot of the upper body as the seated system left it, to blend toward. */
export class UpperSnapshot {
  private q = UPPER.map(() => new THREE.Quaternion());
  private sy = 1;
  capture(rig: CharacterRig) {
    for (let i = 0; i < UPPER.length; i++) this.q[i].copy(rig.bones[UPPER[i]].quaternion);
    this.sy = rig.bones.torso.scale.y;
  }
  /** Put the arms back exactly as the seated system had them. */
  restoreArms(rig: CharacterRig) {
    for (let i = 2; i < UPPER.length; i++) rig.bones[UPPER[i]].quaternion.copy(this.q[i]);
  }
  /** Bones currently hold our pose; move them toward the snapshot by w (1 = snapshot). */
  blend(rig: CharacterRig, w: number) {
    if (w <= 0) return;
    for (let i = 0; i < UPPER.length; i++) rig.bones[UPPER[i]].quaternion.slerp(this.q[i], w);
    rig.bones.torso.scale.y += (this.sy - rig.bones.torso.scale.y) * w;
  }
}

// ---- stock poses -----------------------------------------------------------------------

/** Relaxed standing: arms at the sides, breathing, a little weight shift. */
export function standPose(p: Pose, t: number, ph: number) {
  const br = Math.sin(t * 1.6 + ph);
  p.lean = 0.02; p.yaw = 0.03 * Math.sin(t * 0.3 + ph); p.sway = 0.025 * Math.sin(t * 0.45 + ph);
  p.hp = 0.04; p.hy = 0; p.hr = 0;
  p.armL.set(-0.27, 0.15 + 0.005 * br, 0.05); p.armR.set(0.27, 0.15 + 0.005 * br, 0.05);
  p.poleL.set(-0.9, -0.6, -0.5); p.poleR.set(0.9, -0.6, -0.5);
  p.hipL = p.hipR = 0; p.kneeL = p.kneeR = 0; p.splay = 0.03;
  p.breath = 1 + 0.012 * br;
}

/**
 * Chibi walk with the gait phase locked to distance. `phase` in radians (one cycle
 * = two steps), `amt` 0..1 blends from standing into the full gait. Returns the
 * root's height offset so the planted foot stays on the floor.
 */
export function walkPose(p: Pose, phase: number, amt: number, t: number, ph: number): number {
  const A = 0.26 * amt, K = 0.7 * amt;
  const s = Math.sin(phase), c = Math.cos(phase);
  p.hipL = -A * s; p.hipR = A * s;
  p.kneeL = K * Math.pow(Math.max(0, c), 1.4) + 0.06 * amt;
  p.kneeR = K * Math.pow(Math.max(0, -c), 1.4) + 0.06 * amt;
  p.splay = 0.02;
  const swing = 0.11 * amt;
  p.armL.set(-0.26, 0.17 + 0.02 * amt, 0.05 - swing * s); p.armR.set(0.26, 0.17 + 0.02 * amt, 0.05 + swing * s);
  p.poleL.set(-0.8, -0.5, -0.7); p.poleR.set(0.8, -0.5, -0.7);
  p.lean = 0.07 * amt; p.yaw = -0.07 * s * amt; p.sway = 0.03 * c * amt;
  p.hp = 0.06 - 0.03 * amt; p.hy = 0.05 * s * amt; p.hr = -0.02 * c * amt;
  p.breath = 1 + 0.01 * Math.sin(t * 2 + ph);
  // The stance leg (the one with the straighter knee) carries the body.
  const stance = c > 0 ? p.hipR : p.hipL;
  return -LEG_LEN * (1 - Math.cos(stance)) + 0.012 * amt * Math.abs(Math.sin(phase * 2));
}
