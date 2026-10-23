// People in the room. One agent per slot drives the existing character with a small
// state machine: seated (character.ts's own acts, plus occasional new seated poses
// blended over them), getting up with the chair, walking the room graph, a break at
// the shelves / window / sofa / in place, and walking in or out through the door.
// Every goal change is taken from wherever the person is: mid-walk they turn round,
// mid-stand they sit back down, at a destination they play a short exit first.
import * as THREE from 'three';
import { avatar, type Expression } from '../lib/avatars';
import { Character, CHAIR_ROOT_Y } from './character';
import {
  AISLE_Z, CHAIR_BACK, CHAIR_IN, DOOR, LAMP_LEVEL, MAX_SLOTS, SOFA, SPOTS, STOOL_TOP, TABLE_TOP, WALL_X,
  type DestKind, type SlotStatus, type Spot,
} from './hall';
import { Nav } from './nav';
import {
  BACK_OF_HEAD, CHIN, EYES, MOUTH, SEAT_HIP, SEAT_KNEE, STAND_ROOT_Y, UpperSnapshot, applyPose, bodyPoint, copyPose,
  dampPose, headPoint, makePose, standPose, walkPose, type Pose,
} from './rigPose';
import type { RoomBuild, Seat } from './room';

export interface Occupant {
  /** Stable id (user id) so the same person keeps their character. */
  key: string;
  name: string;
  avatar: number;
  status: SlotStatus;
  isMe: boolean;
}

export type SeatedMicro = 'leanBack' | 'restHead' | 'raiseBook' | 'penTwirl' | 'rubEyes' | 'yawn' | 'glance' | 'stretchUp';
export const SEATED_MICROS: SeatedMicro[] = ['leanBack', 'restHead', 'raiseBook', 'penTwirl', 'rubEyes', 'yawn', 'glance', 'stretchUp'];
export type LabAction = 'stand' | 'sit' | DestKind | SeatedMicro | 'join' | 'leave';

export interface Crowd {
  set(slots: (Occupant | null)[], instant: boolean): void;
  /** Behaviour at the fixed simulation step. */
  step(t: number, dt: number): void;
  /** Poses, once per rendered frame. */
  update(t: number, dt: number, camPos: THREE.Vector3): void;
  labelPoint(slot: number, out: THREE.Vector3): boolean;
  /** Where people are walking or standing (cats watch them); index = slot, null if seated/absent. */
  movers(): (THREE.Vector3 | null)[];
  /** Sofa visitors (slot → world hip point) for the cat. */
  sofaGuests(): THREE.Vector3[];
  setMicroRate(k: number, halfRateFar: boolean): void;
  setReducedMotion(on: boolean): void;
  lab(slot: number, a: LabAction): void;
  debug(slot: number): string;
  dispose(): void;
}

type Goal = 'seat' | 'break' | 'gone';
type Mode = 'gone' | 'seated' | 'chair' | 'walk' | 'dest' | 'pushIn';
type Arrive = 'seat' | 'dest' | 'door' | 'push' | 'none';

const TY = 0.565;
const STAND_Z = -0.07; // where someone stands after rising, seat space
const SCOOT = -0.3;
const GAP_X = 0.64;
const AISLE_L = -(AISLE_Z - 0.98);
const CHAIR_T = 1.7; // seconds to get up or sit down
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();
const _Y = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const seg = (x: number, a: number, b: number) => smooth((x - a) / (b - a));
/** 0 → 1 over [a, b], held, back to 0 over [c, d]. */
const win = (x: number, a: number, b: number, c: number, d: number) => seg(x, a, b) * (1 - seg(x, c, d));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
// Lying on the sofa: body axis along −x (head toward the far arm), face up.
const LIE_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)));

/** Spot reservations so two people never share a destination. */
class Spots {
  private taken = new Map<string, number>();
  free(id: string) { return !this.taken.has(id); }
  take(id: string, slot: number) { this.taken.set(id, slot); }
  release(slot: number) { for (const [k, v] of this.taken) if (v === slot) this.taken.delete(k); }
}

interface Ctx {
  room: RoomBuild;
  nav: Nav;
  spots: Spots;
  agents: Agent[];
  reduced: boolean;
  micro: number;
  shelfBooks: Map<string, number[]>;
  borrowed: Set<number>;
}

class Agent {
  readonly slot: number;
  readonly seat: Seat;
  private ctx: Ctx;
  occ: Occupant | null = null;
  char: Character | null = null;
  goal: Goal = 'gone';
  mode: Mode = 'gone';
  private rand: () => number = Math.random;
  private ph = 0;
  // World-space root.
  pos = new THREE.Vector2();
  rootY = STAND_ROOT_Y;
  heading = 0;
  private lieQ: THREE.Quaternion | null = null;
  private lieW = 0;
  private speed = 0;
  private maxSpeed = 0.75;
  private stride = 0.78;
  private gait = 0;
  private gaitAmt = 0;
  private path: THREE.Vector2[] = [];
  private pi = 0;
  private arrive: Arrive = 'none';
  private faceEnd: number | null = null;
  private blocked = 0;
  private pulling = false;
  private side = 1;
  // Chair: 0 seated … 1 standing in front of it.
  private u = 0;
  private uDir = 0;
  private chairOff = CHAIR_IN;
  private chairYaw = 0;
  // Destination.
  spot: Spot | null = null;
  private dPhase: 'enter' | 'loop' | 'exit' = 'enter';
  private dT = 0;
  private dSub = 0;
  private dSubT = 0;
  private dDur = 0;
  private lying = false;
  // Carried things.
  private carry: 'mug' | 'book' | null = null;
  private wantMug = false;
  private book = -1; // shelf book instance index in hand / on the table
  private bookOpen = 0;
  private bookOnTable = -1;
  // Timing.
  private reactAt = -1;
  private nextBlink = 0;
  // Seated micro behaviours.
  private micro: SeatedMicro | null = null;
  private microStart = 0;
  private microDur = 0;
  private nextMicro = 0;
  private forced: LabAction | null = null;
  // Pose.
  private pose = makePose();
  private goalPose = makePose();
  private snap = new UpperSnapshot();
  private kPose = 10;
  private pen: THREE.Object3D | null = null;
  private bookHome = new THREE.Vector3();
  private bookHomeRot = new THREE.Euler();
  pendingDt = 0;
  far = false;

  constructor(slot: number, seat: Seat, ctx: Ctx) {
    this.slot = slot;
    this.seat = seat;
    this.ctx = ctx;
    if (seat.book) { this.bookHome.copy(seat.book.position); this.bookHomeRot.copy(seat.book.rotation); }
  }

  // ---- occupancy -------------------------------------------------------------------

  setOccupant(o: Occupant | null, instant: boolean, now: number) {
    const prev = this.occ;
    if (o && (!prev || prev.key !== o.key || prev.avatar !== o.avatar)) {
      if (this.char && prev) { this.vanish(); }
      this.spawn(o, now);
      this.occ = o;
      this.goal = goalOf(o.status);
      if (instant || this.ctx.reduced) this.place(this.goal, now);
      else if (this.goal === 'gone') this.place('gone', now);
      else {
        this.mode = 'gone';
        if (this.char) this.char.root.visible = false;
        this.reactAt = now + this.slot * 0.4 + this.rand() * 0.2;
        if (!this.doorwayBusy() && !this.ctx.agents.some((a) => a !== this && a.occ && a.goal !== 'gone' && a.mode === 'gone' && a.slot < this.slot)) {
          this.enterByDoor(now);
        }
      }
      return;
    }
    if (!o) {
      if (this.occ) {
        this.goal = 'gone';
        this.occ = null;
        if (instant || this.ctx.reduced || this.mode === 'gone') this.vanish();
        else this.reactAt = now + 0.2 + this.rand() * 1.2;
      }
      return;
    }
    this.occ = o;
    const g = goalOf(o.status);
    if (g !== this.goal) {
      this.goal = g;
      if (instant || this.ctx.reduced) this.place(g, now);
      else this.reactAt = now + 0.3 + this.rand() * 3.2;
    }
  }

  private spawn(o: Occupant, now: number) {
    const c = new Character(avatar(o.avatar), { seed: this.slot * 31 + o.avatar });
    c.focusAct = this.seat.focusAct;
    c.attach({ tableMug: this.seat.mug, page: this.seat.page ?? undefined });
    c.root.position.y = CHAIR_ROOT_Y;
    this.seat.anchor.add(c.root);
    this.char = c;
    let s = ((this.slot + 1) * 2654435761 + o.avatar * 97) >>> 0 || 1;
    this.rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
    this.ph = this.rand() * 10;
    this.maxSpeed = 0.68 + this.rand() * 0.16;
    this.stride = 0.72 + this.rand() * 0.12;
    this.nextMicro = now + 8 + this.rand() * 20;
    this.nextBlink = now + this.rand() * 3;
    this.pen = c.rig.bones.handR.children.find((ch) => (ch as THREE.Mesh).isMesh) ?? null;
    const bag = this.seat.bag;
    const wearsBag = avatar(o.avatar).spec.accessories.includes('backpack');
    if (bag) bag.visible = !wearsBag;
    this.side = bag ? (bag.position.x > 0 ? -1 : 1) : (this.slot % 2 ? 1 : -1);
  }

  /** Remove the person entirely (seat empties). */
  private vanish() {
    if (this.char) { this.char.park(); this.seat.anchor.remove(this.char.root); this.char.dispose(); this.char = null; }
    this.ctx.spots.release(this.slot);
    this.dropHeld(true);
    this.mode = 'gone';
    this.spot = null;
    this.u = 0;
    if (!this.occ) {
      this.chairOff = CHAIR_IN; this.chairYaw = 0;
      this.seat.kitTarget = 0;
      if (this.seat.bag) this.seat.bag.visible = false;
    }
  }

  /** Jump straight into a state (first load, reduced motion). */
  private place(g: Goal, now: number) {
    this.dropHeld(false);
    this.ctx.spots.release(this.slot);
    this.spot = null;
    this.lieQ = null; this.lieW = 0;
    if (!this.char) return;
    this.char.root.visible = g !== 'gone';
    this.seat.kitTarget = 1;
    if (g === 'seat' || (g === 'break' && !this.pickSpot(true))) {
      this.toSeated(now);
      if (g === 'break') this.goal = 'break';
      return;
    }
    if (g === 'gone') {
      this.mode = 'gone';
      this.char.park();
      this.chairOff = CHAIR_BACK; this.chairYaw = this.side * 0.22;
      return;
    }
    // Break: appear at the destination, already settled.
    const sp = this.spot!;
    this.char.park();
    this.chairOff = CHAIR_BACK; this.chairYaw = this.side * 0.22;
    this.u = 1;
    this.mode = 'dest';
    this.dPhase = 'loop';
    this.dT = 0; this.dSub = 0; this.dSubT = now;
    this.wantMug = sp.kind === 'window' || sp.kind === 'sofa';
    if (this.wantMug) this.carry = 'mug';
    if (sp.kind === 'shelf') this.takeBook(sp, true);
    this.pos.set(sp.x, sp.z);
    this.heading = sp.face;
    this.settleDest(1);
  }

  private toSeated(_now: number) {
    this.mode = 'seated';
    this.u = 0;
    this.chairOff = 0; this.chairYaw = 0;
    this.pos.set(this.seat.anchor.position.x, this.seat.anchor.position.z);
    this.heading = this.seat.anchor.rotation.y;
    this.rootY = CHAIR_ROOT_Y;
    this.lieQ = null; this.lieW = 0;
    if (this.char) { this.char.root.visible = true; this.char.status = 'focusing'; }
  }

  private doorwayBusy(): boolean {
    for (const a of this.ctx.agents) {
      if (a === this || !a.char?.root.visible || a.mode !== 'walk') continue;
      if (a.pos.y < -3.8 && Math.abs(a.pos.x - DOOR.x) < 1.0) return true;
    }
    return false;
  }

  private enterByDoor(now: number) {
    if (!this.char) return;
    this.char.park();
    this.chairOff = CHAIR_IN; this.chairYaw = 0;
    const d = this.ctx.nav.node('dout');
    this.pos.set(d.x, d.y);
    this.heading = 0;
    this.rootY = STAND_ROOT_Y;
    this.worldToRoot(this.pos.x, this.rootY, this.pos.y, this.heading);
    this.char.root.visible = true;
    this.u = 1;
    this.mode = 'walk';
    standPose(this.pose, now, this.ph);
    this.planForGoal(now);
  }

  // ---- seat geometry -------------------------------------------------------------------

  private seatToWorld(lx: number, lz: number, out: THREE.Vector2) {
    const a = this.seat.anchor, r = a.rotation.y;
    return out.set(a.position.x + lx * Math.cos(r) + lz * Math.sin(r), a.position.z - lx * Math.sin(r) + lz * Math.cos(r));
  }
  private aisleNode(side: number): string {
    const w = this.seatToWorld(side * GAP_X, AISLE_L, new THREE.Vector2());
    const k = Math.round((w.x + 2.76) / 1.38);
    return (this.slot < 4 ? 'b' : 'f') + Math.max(0, Math.min(4, k));
  }

  // ---- planning ---------------------------------------------------------------------------

  private pickSpot(instant = false): boolean {
    const { spots } = this.ctx;
    const r = this.rand();
    const order: DestKind[] = r < 0.32 ? ['shelf', 'window', 'sofa'] : r < 0.62 ? ['window', 'sofa', 'shelf'] : r < 0.86 ? ['sofa', 'shelf', 'window'] : ['stretch'];
    if (this.forced && this.forced !== 'stretch' && (this.forced === 'shelf' || this.forced === 'window' || this.forced === 'sofa')) order.unshift(this.forced);
    if (this.forced === 'stretch') order.unshift('stretch');
    for (const kind of order) {
      if (kind === 'stretch') break;
      const cands = SPOTS.filter((s) => s.kind === kind && spots.free(s.id));
      if (!cands.length) continue;
      const s = cands[Math.floor(this.rand() * cands.length)];
      spots.take(s.id, this.slot);
      this.lying = false;
      if (kind === 'sofa') {
        const other = SPOTS.find((o) => o.kind === 'sofa' && o.id !== s.id)!;
        if (spots.free(other.id) && this.rand() < 0.45) { spots.take(other.id, this.slot); this.lying = true; }
      }
      this.spot = s;
      return true;
    }
    // In-place stretch: just behind their own chair, out of the aisle.
    const w = this.seatToWorld(this.side * 0.42, -0.86, new THREE.Vector2());
    this.spot = { kind: 'stretch', id: `stretch${this.slot}`, x: w.x, z: w.y, face: this.seat.anchor.rotation.y, node: this.aisleNode(this.side), k: 0 };
    void instant;
    return true;
  }

  /** Path for the current goal from wherever the person is now. */
  private planForGoal(now: number) {
    const nav = this.ctx.nav;
    const P = this.path;
    const isChair = this.mode === 'chair';
    const isDoor = this.pos.y <= -5.8 && Math.abs(this.pos.x - DOOR.x) < 0.4;

    if (isChair) {
      const gap = this.seatToWorld(this.side * GAP_X, -0.12, new THREE.Vector2());
      const aisle = this.seatToWorld(this.side * GAP_X, AISLE_L, new THREE.Vector2());
      let tgt: string;
      if (this.goal === 'seat') {
        tgt = this.aisleNode(this.side);
      } else if (this.goal === 'break') {
        if (!this.spot) this.pickSpot();
        tgt = this.spot!.node;
      } else {
        tgt = 'dout';
      }
      nav.pathFrom(aisle.x, aisle.y, tgt, P);
      if (P.length && P[0].distanceTo(aisle) < 0.25) P.shift();
      P.unshift(gap, aisle);

      if (this.goal === 'seat') {
        P.push(gap, this.seatToWorld(0, STAND_Z, new THREE.Vector2()));
        this.arrive = 'seat';
        this.faceEnd = this.seat.anchor.rotation.y;
      } else if (this.goal === 'break') {
        const sp = this.spot!;
        if (sp.kind === 'stretch' || sp.kind === 'shelf') P.push(new THREE.Vector2(sp.x, sp.z));
        this.arrive = 'dest';
        this.faceEnd = sp.kind === 'sofa' ? 0 : sp.face;
      } else {
        this.arrive = 'door';
        this.faceEnd = null;
      }
    } else if (isDoor) {
      let tgt: string;
      if (this.goal === 'seat') {
        tgt = this.aisleNode(this.side);
      } else if (this.goal === 'break') {
        if (!this.spot) this.pickSpot();
        tgt = this.spot!.node;
      } else {
        tgt = 'dout';
      }
      P.length = 0;
      for (const nm of nav.route('dout', tgt)) P.push(nav.node(nm).clone());
      if (P.length && P[0].distanceTo(this.pos) < 0.25) P.shift();

      if (this.goal === 'seat') {
        P.push(this.seatToWorld(this.side * GAP_X, -0.12, new THREE.Vector2()), this.seatToWorld(0, STAND_Z, new THREE.Vector2()));
        this.arrive = 'seat';
        this.faceEnd = this.seat.anchor.rotation.y;
      } else if (this.goal === 'break') {
        const sp = this.spot!;
        if (sp.kind === 'stretch' || sp.kind === 'shelf') P.push(new THREE.Vector2(sp.x, sp.z));
        this.arrive = 'dest';
        this.faceEnd = sp.kind === 'sofa' ? 0 : sp.face;
      } else {
        this.arrive = 'door';
        this.faceEnd = null;
      }
    } else {
      if (this.goal === 'seat') {
        const node = this.aisleNode(this.side);
        nav.pathFrom(this.pos.x, this.pos.y, node, P);
        P.push(this.seatToWorld(this.side * GAP_X, -0.12, new THREE.Vector2()), this.seatToWorld(0, STAND_Z, new THREE.Vector2()));
        this.arrive = 'seat';
        this.faceEnd = this.seat.anchor.rotation.y;
      } else if (this.goal === 'break') {
        if (!this.spot) this.pickSpot();
        const sp = this.spot!;
        nav.pathFrom(this.pos.x, this.pos.y, sp.node, P);
        if (sp.kind === 'stretch' || sp.kind === 'shelf') P.push(new THREE.Vector2(sp.x, sp.z));
        this.arrive = 'dest';
        this.faceEnd = sp.kind === 'sofa' ? 0 : sp.face;
      } else {
        nav.pathFrom(this.pos.x, this.pos.y, 'dout', P);
        this.arrive = 'door';
        this.faceEnd = null;
      }
    }
    this.pi = 0;
    this.mode = 'walk';
    this.blocked = 0;
    void now;
  }

  // ---- behaviour (fixed step) ----------------------------------------------------------------

  step(t: number, dt: number) {
    if (!this.char) return;
    const busy = this.char.gesturing;
    switch (this.mode) {
      case 'gone':
        if (this.occ && this.goal !== 'gone' && t >= this.reactAt && !this.doorwayBusy()) this.enterByDoor(t);
        break;
      case 'seated':
        if (this.micro && t > this.microStart + this.microDur) { this.micro = null; this.nextMicro = t + (14 + this.rand() * 34) / Math.max(0.15, this.ctx.micro); }
        // Getting up for something: wind a running seated pose down first.
        if (this.goal !== 'seat' && this.micro && this.microStart + this.microDur - t > 0.9) this.microDur = Math.max(t - this.microStart, 0.9) + 0.9;
        if (this.goal !== 'seat' && t >= this.reactAt && !busy && !this.micro) {
          if (this.goal === 'break') this.pickSpot();
          this.wantMug = !!this.spot && (this.spot.kind === 'window' || this.spot.kind === 'sofa');
          this.mode = 'chair';
          this.uDir = 1;
          this.char.quietUntil = t + 1e9;
        } else if (this.goal === 'seat') this.stepMicro(t);
        break;
      case 'chair': {
        this.u = clamp01(this.u + (this.uDir * dt) / CHAIR_T);
        const wantUp = this.goal !== 'seat';
        if (wantUp !== this.uDir > 0) this.uDir = wantUp ? 1 : -1; // reverse mid-way
        if (this.u >= 1 && this.uDir > 0) {
          if (!this.occ) this.planPushIn(); else this.planForGoal(t);
        } else if (this.u <= 0 && this.uDir < 0) {
          this.finishSit(t);
        }
        break;
      }
      case 'pushIn':
        this.dT += dt;
        if (this.dT > 1.1) this.planForGoal(t);
        break;
      case 'walk':
        this.stepWalk(t, dt);
        break;
      case 'dest':
        this.stepDest(t, dt);
        break;
    }
  }

  /** Leaving for good: round to the back of the chair to push it in. */
  private planPushIn() {
    const P = this.path;
    P.length = 0;
    P.push(this.seatToWorld(this.side * GAP_X, -0.12, new THREE.Vector2()), this.seatToWorld(this.side * GAP_X, -0.95, new THREE.Vector2()), this.seatToWorld(0, -0.98, new THREE.Vector2()));
    this.pi = 0;
    this.arrive = 'push';
    this.faceEnd = this.seat.anchor.rotation.y;
    this.mode = 'walk';
  }

  private finishSit(t: number) {
    if (!this.char) return;
    // Hand back to the seated act system with everything where it belongs.
    this.putHeldOnTable();
    this.carry = null;
    this.wantMug = false;
    this.seat.kitTarget = 1;
    this.char.park();
    this.char.quietUntil = t + 2;
    this.toSeated(t);
    this.nextMicro = t + 10 + this.rand() * 20;
  }

  private stepWalk(t: number, dt: number) {
    if (this.goalChanged()) this.planForGoal(t);
    const P = this.path;
    if (this.pi >= P.length) {
      // Turn on the spot to face the way the arrival wants, then arrive.
      if (this.faceEnd !== null && Math.abs(wrap(this.faceEnd - this.heading)) > 0.06) {
        const e = wrap(this.faceEnd - this.heading);
        this.heading = wrap(this.heading + THREE.MathUtils.clamp(e, -3.6 * dt, 3.6 * dt));
        this.speed = 0;
        this.gait += dt * 6;
        return;
      }
      this.arrived(t);
      return;
    }
    const tgt = P[this.pi];
    const dx = tgt.x - this.pos.x, dz = tgt.y - this.pos.y;
    const d = Math.hypot(dx, dz);
    const last = this.pi === P.length - 1;
    // A chair that was pushed in gets pulled out before stepping in front of it.
    this.pulling = false;
    if (last && this.arrive === 'seat' && this.chairOff > CHAIR_BACK + 0.02) {
      this.pulling = true;
      this.speed = 0;
      this.chairOff = Math.max(CHAIR_BACK, this.chairOff - 0.75 * dt);
      this.chairYaw += (this.side * 0.18 - this.chairYaw) * Math.min(1, dt * 4);
      this.heading = wrap(this.heading + THREE.MathUtils.clamp(wrap(this.seat.anchor.rotation.y + this.side * 0.9 - this.heading), -3 * dt, 3 * dt));
      return;
    }
    if (d < (last ? 0.04 : 0.22)) { this.pi++; return; }
    // Turn toward the target; slow down for sharp turns so nobody slides.
    const want = Math.atan2(dx, dz);
    const err = wrap(want - this.heading);
    this.heading = wrap(this.heading + THREE.MathUtils.clamp(err, -4.2 * dt, 4.2 * dt));
    let vmax = this.maxSpeed * (1 - 0.85 * smooth(Math.abs(err) / 1.6));
    if (last) vmax = Math.min(vmax, 0.25 + d * 1.6);
    // Yield to people ahead.
    const ahead = this.blockerAhead();
    if (ahead) {
      vmax = 0;
      this.blocked += dt;
      if (this.blocked > 1.0 && ahead.slot < this.slot && this.pos.y > -3.5) {
        // Step aside to the right and let them pass (aisles only, not in narrow doorway).
        const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
        P.splice(this.pi, 0, new THREE.Vector2(this.pos.x + rx * 0.45 + Math.sin(this.heading) * 0.1, this.pos.y + rz * 0.45 + Math.cos(this.heading) * 0.1));
        this.blocked = -1.5;
      }
    } else if (this.blocked > 0) this.blocked = 0; else this.blocked = Math.min(0, this.blocked + dt);
    const acc = vmax > this.speed ? 1.6 : 3.2;
    this.speed += THREE.MathUtils.clamp(vmax - this.speed, -acc * dt, acc * dt);
    const step = this.speed * dt;
    this.pos.x += Math.sin(this.heading) * step;
    this.pos.y += Math.cos(this.heading) * step;
    this.gait += (step / this.stride) * Math.PI * 2;
    if (this.speed < 0.05 && Math.abs(err) > 0.3) this.gait += dt * 5; // turning on the spot: step in place
  }

  private blockerAhead(): Agent | null {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (const o of this.ctx.agents) {
      if (o === this || !o.char || (o.mode !== 'walk' && !(o.mode === 'dest' && o.spot?.kind === 'stretch'))) continue;
      const dx = o.pos.x - this.pos.x, dz = o.pos.y - this.pos.y;
      const d = Math.hypot(dx, dz);
      if (d > 0.72 || d < 1e-3) continue;
      if ((dx * fx + dz * fz) / d > 0.55) return o;
    }
    return null;
  }

  private goalChanged(): boolean {
    return (this.arrive === 'seat' && this.goal !== 'seat') || (this.arrive === 'dest' && this.goal !== 'break') || ((this.arrive === 'door' || this.arrive === 'push') && this.goal !== 'gone' && !!this.occ);
  }

  private arrived(t: number) {
    this.speed = 0;
    if (this.arrive === 'push') {
      this.mode = 'pushIn';
      this.dT = 0;
      this.seat.kitTarget = 0;
    } else if (this.arrive === 'seat') {
      this.mode = 'chair';
      this.uDir = -1;
      this.u = 1;
    } else if (this.arrive === 'door') {
      this.mode = 'gone';
      if (this.char) this.char.root.visible = false;
      this.dropHeld(false);
      if (!this.occ) this.vanish();
    } else if (this.arrive === 'dest' && this.spot) {
      this.mode = 'dest';
      this.dPhase = 'enter';
      this.dT = 0; this.dSub = 0; this.dSubT = t;
      this.dDur = this.spot.kind === 'shelf' ? 2.2 : this.spot.kind === 'stretch' ? 0.6 : 1.3;
    } else this.mode = 'dest';
  }

  private stepDest(t: number, dt: number) {
    const sp = this.spot!;
    this.dT += dt;
    if (this.goal !== 'break' && this.dPhase !== 'exit') {
      this.dPhase = 'exit'; this.dT = 0;
      this.dDur = sp.kind === 'window' || sp.kind === 'sofa' ? (this.lying ? 1.8 : 1.2) : sp.kind === 'shelf' ? 0.8 : 0.4;
    }
    // Turn to face the spot's way while entering (sofa: back to the cushion).
    const face = sp.kind === 'sofa' ? 0 : sp.face;
    if (this.dPhase === 'enter') {
      this.heading = wrap(this.heading + THREE.MathUtils.clamp(wrap(face - this.heading), -3.5 * dt, 3.5 * dt));
      if (this.dT >= this.dDur) { this.dPhase = 'loop'; this.dT = 0; this.dSub = 0; this.dSubT = t; }
    } else if (this.dPhase === 'exit') {
      if (this.dT >= this.dDur) {
        if (sp.kind === 'shelf' && this.book >= 0 && this.goal !== 'break') this.bookOpen = 0;
        this.ctx.spots.release(this.slot);
        if (this.goal !== 'break') this.spot = null;
        this.lieQ = null; this.lieW = 0;
        // Back at the approach point, then off.
        if (sp.kind === 'window' || sp.kind === 'sofa') this.pos.copy(this.ctx.nav.node(sp.node));
        this.planForGoal(t);
      }
    } else if (sp.kind === 'shelf') this.stepShelf(t);
  }

  /** Shelf loop: read a while, sometimes put it back and choose another. */
  private stepShelf(t: number) {
    const local = t - this.dSubT;
    if (this.dSub === 0 && local > 6 + this.rand() * 0.02 && this.rand() < 0.004) { this.dSub = 1; this.dSubT = t; }
    else if (this.dSub === 1 && local > 1.3) { this.restoreBook(); this.dSub = 2; this.dSubT = t; }
    else if (this.dSub === 2 && local > 1.6) { this.dSub = 3; this.dSubT = t; }
    else if (this.dSub === 3 && local > 1.3) { this.dSub = 0; this.dSubT = t; }
  }

  // ---- seated micro behaviours --------------------------------------------------------------

  private stepMicro(t: number) {
    const c = this.char!;
    if (this.micro) return;
    const forced = this.forced && SEATED_MICROS.includes(this.forced as SeatedMicro) ? (this.forced as SeatedMicro) : null;
    if (!forced && (this.ctx.micro <= 0 || t < this.nextMicro || this.ctx.reduced)) return;
    if (c.gesturing) { c.quietUntil = t + 1; return; }
    const act = this.seat.focusAct;
    const opts: [SeatedMicro, number][] = [
      ['leanBack', 1.2], ['restHead', 0.7], ['rubEyes', 0.8], ['yawn', 0.9], ['glance', 1.4], ['stretchUp', 0.8],
      ['raiseBook', act === 'read' ? 2.2 : 0], ['penTwirl', act === 'write' ? 1.8 : 0],
    ];
    let m = forced;
    if (!m) {
      const total = opts.reduce((s, o) => s + o[1], 0);
      let r = this.rand() * total;
      for (const [k, w] of opts) { if ((r -= w) <= 0) { m = k; break; } }
    }
    this.forced = null;
    if (!m) return;
    this.micro = m;
    this.microStart = t;
    this.microDur = { leanBack: 7, restHead: 9, raiseBook: 10, penTwirl: 5, rubEyes: 3.6, yawn: 3.4, glance: 3, stretchUp: 4.8 }[m] + this.rand() * 2;
    c.quietUntil = t + this.microDur + 1;
  }

  // ---- held things --------------------------------------------------------------------------

  /** Pick a reachable shelf book near the spot. */
  private takeBook(sp: Spot, instant: boolean) {
    const list = this.ctx.shelfBooks.get(sp.id) ?? [];
    const free = list.filter((i) => !this.ctx.borrowed.has(i));
    if (!free.length) return;
    this.book = free[Math.floor(this.rand() * free.length)];
    this.ctx.borrowed.add(this.book);
    this.ctx.room.books.getColorAt(this.book, _c);
    const held = this.ctx.room.held;
    held.closed.setColorAt(this.slot, _c);
    held.covers.setColorAt(this.slot, _c);
    if (held.closed.instanceColor) held.closed.instanceColor.needsUpdate = true;
    if (held.covers.instanceColor) held.covers.instanceColor.needsUpdate = true;
    hideBook(this.ctx.room.books, this.book, true);
    this.carry = 'book';
    this.bookOpen = instant ? 1 : 0;
  }

  /** Put the book in hand back on its shelf. */
  private restoreBook() {
    if (this.book < 0) return;
    hideBook(this.ctx.room.books, this.book, false);
    this.ctx.borrowed.delete(this.book);
    this.book = -1;
    this.bookOpen = 0;
    if (this.carry === 'book') this.carry = null;
  }

  private putHeldOnTable() {
    if (this.book >= 0 && this.carry === 'book') {
      if (this.bookOnTable >= 0 && this.bookOnTable !== this.book) { hideBook(this.ctx.room.books, this.bookOnTable, false); this.ctx.borrowed.delete(this.bookOnTable); }
      this.bookOnTable = this.book;
      this.book = -1;
    }
    this.bookOpen = 0;
  }

  /** Forget held things; books go back on the shelf (nobody leaves with library books). */
  private dropHeld(_all: boolean) {
    if (this.book >= 0) this.restoreBook();
    if (this.bookOnTable >= 0) { hideBook(this.ctx.room.books, this.bookOnTable, false); this.ctx.borrowed.delete(this.bookOnTable); this.bookOnTable = -1; }
    this.carry = null;
    this.wantMug = false;
    this.bookOpen = 0;
  }

  // ---- poses (per rendered frame) ---------------------------------------------------------------

  update(t: number, dt: number) {
    const c = this.char;
    if (!c || !c.root.visible) { this.syncChair(); return; }
    const rig = c.rig;
    const g = this.goalPose;
    let useChar = 0; // share of the seated act system
    let expr: Expression | null = null;
    this.kPose = 10;
    let lz = 0, ly = CHAIR_ROOT_Y;
    this.lieW += ((this.lieQ ? 1 : 0) - this.lieW) * (1 - Math.exp(-4 * dt));

    switch (this.mode) {
      case 'seated': {
        useChar = 1;
        const mw = this.micro ? win(t - this.microStart, 0, 0.9, this.microDur - 0.9, this.microDur) : 0;
        if (mw > 0) { useChar = 1 - mw; expr = this.seatedMicro(t, g); } else seatedBase(g, t, this.ph);
        this.chairOff = 0; this.chairYaw = 0;
        break;
      }
      case 'chair': {
        this.chairPose(t, g);
        lz = this.chairLz; ly = this.chairLy;
        useChar = 1 - seg(this.u, 0.02, 0.22);
        expr = this.goal === 'seat' ? null : 'smile';
        break;
      }
      case 'pushIn': {
        standPose(g, t, this.ph);
        const k = win(this.dT, 0, 0.3, 0.8, 1.1);
        const slide = seg(this.dT, 0.25, 0.85);
        this.chairOff = THREE.MathUtils.lerp(CHAIR_BACK, CHAIR_IN, slide);
        this.chairYaw = this.side * 0.22 * (1 - slide);
        lz = -0.98 + 0.5 * slide; ly = STAND_ROOT_Y;
        // Hands on the chair's top rail (seat space z = chair - 0.2, height 0.62).
        const rz = this.chairOff - 0.2 - lz;
        g.armL.lerp(_a.set(-0.2, 0.62 - STAND_ROOT_Y, rz), k); g.armR.lerp(_a.set(0.2, 0.62 - STAND_ROOT_Y, rz), k);
        g.lean = 0.25 * k;
        walkPose(g, this.dT * 7, slide * (1 - slide) * 3, t, this.ph);
        break;
      }
      case 'walk': {
        this.gaitAmt += ((this.speed > 0.04 || this.speed > 0.01 ? 1 : 0) - this.gaitAmt) * (1 - Math.exp(-8 * dt));
        standPose(g, t, this.ph);
        const bob = walkPose(g, this.gait, Math.max(this.gaitAmt, Math.min(1, this.speed * 4)), t, this.ph);
        this.rootY = STAND_ROOT_Y + bob;
        this.carryPose(g, t);
        if (this.pulling) {
          // Reach down for the chair's top rail beside them.
          g.armL.set(-0.22, 0.24, 0.3); g.armR.set(0.22, 0.24, 0.3);
          g.lean = 0.22;
        }
        this.kPose = 22;
        expr = this.goal === 'seat' ? 'focused' : 'smile';
        break;
      }
      case 'dest':
        expr = this.destPose(t, g);
        break;
    }

    // Blend: run the seated system first and keep its result to blend toward.
    if (useChar > 0) {
      c.update(t, dt);
      this.snap.capture(rig);
    }
    if (useChar < 1) {
      if (this.mode === 'walk') dampPose(this.pose, g, this.kPose, dt);
      else dampPose(this.pose, g, this.kPose, dt);
      applyPose(rig, this.pose);
      if (useChar > 0) this.snap.blend(rig, useChar);
      // Glancing at a neighbour: hands keep doing what they were doing.
      if (this.mode === 'seated' && this.micro === 'glance') this.snap.restoreArms(rig);
    } else {
      copyPose(this.pose, g);
      seatedLegs(this.pose);
      if (this.mode === 'seated') { rig.bones.hipL.rotation.set(SEAT_HIP, 0, 0); rig.bones.hipR.rotation.set(SEAT_HIP, 0, 0); rig.bones.kneeL.rotation.set(SEAT_KNEE, 0, 0); rig.bones.kneeR.rotation.set(SEAT_KNEE, 0, 0); }
    }

    // Expression: blink over whatever face the moment wants.
    if (useChar < 0.5 && expr) {
      let e = expr;
      if (t > this.nextBlink) { if (t - this.nextBlink < 0.14) e = 'blink'; else this.nextBlink = t + 2 + this.rand() * 4.5; }
      rig.setExpression(e);
    }

    // Root transform.
    const root = c.root;
    if (this.mode === 'seated') {
      root.position.set(0, CHAIR_ROOT_Y, 0);
      root.quaternion.identity();
    } else if (this.mode === 'chair' || this.mode === 'pushIn') {
      root.position.set(0, ly, lz);
      root.quaternion.identity();
      this.seatToWorld(0, lz, this.pos as THREE.Vector2);
      this.heading = this.seat.anchor.rotation.y;
    } else {
      this.worldToRoot(this.pos.x, this.rootY, this.pos.y, this.heading);
    }
    this.syncChair();
    this.syncPen(t);
    this.syncHeld(t);
    this.syncBag();
  }

  /** Root from a world position and heading (plus the lying blend), in seat-anchor space. */
  private worldToRoot(x: number, y: number, z: number, heading: number) {
    const a = this.seat.anchor, root = this.char!.root;
    const r = a.rotation.y;
    const dx = x - a.position.x, dz = z - a.position.z;
    root.position.set(dx * Math.cos(r) - dz * Math.sin(r), y, dx * Math.sin(r) + dz * Math.cos(r));
    _q.setFromAxisAngle(_Y, heading);
    if (this.lieW > 0.001 && this.lieQ) _q.slerp(this.lieQ, this.lieW);
    _q2.setFromAxisAngle(_Y, -r);
    root.quaternion.copy(_q2.multiply(_q));
  }

  private syncChair() {
    this.seat.chair.offset = this.chairOff;
    this.seat.chair.yaw = this.chairYaw;
  }

  // ---- pose builders -------------------------------------------------------------------------------

  private chairLz = 0;
  private chairLy = CHAIR_ROOT_Y;

  /** Getting up / sitting down; sets the root's seat-space z and height. */
  private chairPose(_t: number, g: Pose) {
    const u = this.u;
    const a = seg(u, 0, 0.25), b = seg(u, 0.25, 0.55), c = seg(u, 0.55, 1);
    // Seated base → hands to the table edge → push back with the chair → rise.
    g.lean = 0.1 + 0.22 * a - 0.27 * c; g.yaw = 0; g.sway = 0;
    g.hp = 0.15 - 0.1 * c; g.hy = 0.12 * this.side * a * (1 - c); g.hr = 0;
    const edge = 0.35 - SCOOT * b; // hands stay on the table edge as the body moves back
    g.armL.set(-0.2, TY - 0.01, 0.42 + (edge - 0.42) * a); g.armR.set(0.2, TY - 0.01, 0.42 + (edge - 0.42) * a);
    _a.set(-0.27, 0.16, 0.06); _b.set(0.27, 0.16, 0.06);
    g.armL.lerp(_a, c); g.armR.lerp(_b, c);
    g.poleL.set(-0.9, -0.6, -0.5); g.poleR.set(0.9, -0.6, -0.5);
    g.hipL = g.hipR = SEAT_HIP * (1 - c); g.kneeL = g.kneeR = SEAT_KNEE * (1 - c);
    g.splay = 0.03 * c; g.breath = 1;
    // The mug hand fetches the mug first (going) or sets it down last (coming back).
    if (this.wantMug) {
      const home = (this.seat.mug.userData.home as { p: THREE.Vector3 } | undefined)?.p;
      const mx = home ? home.x : 0.32;
      const hand = mx >= 0 ? g.armR : g.armL;
      const grab = seg(u, 0.02, 0.2);
      _a.set(mx + Math.sign(mx || 1) * 0.1, TY + 0.06, 0.42 - 0); // mug handle, seated root space
      hand.lerp(_a, grab * (1 - b));
      _b.set(Math.sign(mx || 1) * 0.06, 0.4 + 0.1 * c, 0.3);
      hand.lerp(_b, b);
      this.carry = u > 0.15 ? 'mug' : this.uDir > 0 ? null : this.carry;
    }
    if (this.carry === 'book' && this.book >= 0) { _b.set(this.side * 0.24, 0.24, 0.12); (this.side > 0 ? g.armR : g.armL).lerp(_b, b); }
    // Chair follows the scoot, then nudges back with a twist as they rise.
    this.chairOff = SCOOT * b + (CHAIR_BACK - SCOOT) * c;
    this.chairYaw = this.side * 0.22 * c;
    this.chairLz = SCOOT * b + (STAND_Z - SCOOT) * c;
    this.chairLy = CHAIR_ROOT_Y + (STAND_ROOT_Y - CHAIR_ROOT_Y) * c;
    this.kPose = 14;
  }

  /** Arms while walking with something. */
  private carryPose(g: Pose, t: number) {
    if (this.carry === 'mug') {
      const right = this.mugRight();
      const hand = right ? g.armR : g.armL;
      hand.set(right ? 0.07 : -0.07, 0.4 + 0.006 * Math.sin(this.gait * 2), 0.3);
      (right ? g.poleR : g.poleL).set(right ? 0.9 : -0.9, -0.8, -0.2);
    } else if (this.carry === 'book') {
      const hand = this.side > 0 ? g.armR : g.armL;
      hand.set(this.side * 0.25, 0.22, 0.12 - 0.02 * Math.sin(this.gait));
    }
    void t;
  }

  private mugRight() {
    const home = (this.seat.mug.userData.home as { p: THREE.Vector3 } | undefined)?.p;
    return !home || home.x >= 0;
  }

  /** Destination poses; returns the face to wear. */
  private destPose(t: number, g: Pose): Expression {
    const sp = this.spot!;
    const k = this.dPhase === 'enter' ? smooth(this.dT / this.dDur) : this.dPhase === 'exit' ? 1 - smooth(this.dT / this.dDur) : 1;
    standPose(g, t, this.ph);
    this.rootY = STAND_ROOT_Y;
    switch (sp.kind) {
      case 'shelf': return this.shelfPose(t, g, k);
      case 'window': return this.windowPose(t, g, k);
      case 'sofa': return this.sofaPose(t, g, k);
      default: return this.stretchPose(t, g, k);
    }
  }

  private shelfPose(t: number, g: Pose, k: number): Expression {
    const lt = t - this.dSubT;
    // Scan the spines while arriving and while choosing another.
    const scanning = this.dPhase === 'enter' || this.dSub === 2;
    g.hp = -0.18; g.hy = scanning ? 0.45 * Math.sin(lt * 1.3 + this.ph) : 0;
    if (this.dPhase === 'enter' && this.dT > 1.2 && this.book < 0) { this.takeBookFromShelf(); }
    if (this.dSub === 3 && this.book < 0) this.takeBookFromShelf();
    // Reaching to the spine (taking or returning) vs reading with the book open.
    const reaching = (this.dPhase === 'enter' && this.dT > 0.9) || this.dSub === 1 || this.dSub === 3;
    if (this.book >= 0 && reaching) {
      this.ctx.room.books.getMatrixAt(this.book, _m);
      _v.setFromMatrixPosition(_m);
      this.worldToRootSpace(_v, _a);
      const r = this.dSub === 1 ? seg(lt, 0, 0.8) : this.dSub === 3 ? 1 - seg(lt, 0.5, 1.3) : seg(this.dT, 0.9, 1.6) * (1 - seg(this.dT, 1.7, 2.2));
      g.armR.lerp(_a, r);
      g.poleR.set(0.7, -0.5, -0.9);
      g.hp = -0.25; g.hy = 0;
      g.lean = 0.06;
      this.bookOpen = 0;
      return 'focused';
    }
    if (this.book >= 0) {
      // Book open at chest height, both hands, head down; a page every few seconds.
      const open = this.dPhase === 'exit' ? 1 - seg(this.dT, 0, 0.5) : seg(lt, 0, 0.6) * (this.dPhase === 'enter' ? seg(this.dT, 1.6, 2.2) : 1);
      this.bookOpen = open;
      const flick = win((lt + this.ph) % 4.2, 0, 0.25, 0.45, 0.7);
      _a.set(-0.12, 0.47, 0.3); _b.set(0.12, 0.47 + 0.03 * flick, 0.3 - 0.02 * flick);
      g.armL.lerp(_a, open * k); g.armR.lerp(_b, open * k);
      g.poleL.set(-0.9, -0.7, -0.2); g.poleR.set(0.9, -0.7, -0.2);
      g.hp = 0.38 * open; g.hy = 0.04 * Math.sin(t * 0.4 + this.ph); g.lean = 0.05;
      if (this.dPhase === 'exit') { _b.set(this.side * 0.25, 0.22, 0.12); (this.side > 0 ? g.armR : g.armL).lerp(_b, seg(this.dT, 0.3, 0.8)); }
      return Math.sin(t * 0.25 + this.ph) > 0.6 ? 'smile' : 'focused';
    }
    return 'smile';
  }

  private takeBookFromShelf() {
    if (this.spot) this.takeBook(this.spot, false);
  }

  private windowPose(t: number, g: Pose, k: number): Expression {
    const sp = this.spot!;
    // Climb onto the stool: from the approach point to sitting over the stool.
    const ap = this.ctx.nav.node(sp.node);
    const sx = sp.x + 0.06, sz = sp.z;
    this.pos.set(THREE.MathUtils.lerp(ap.x, sx, k), THREE.MathUtils.lerp(ap.y, sz, k));
    this.heading = wrap(this.heading + wrap(sp.face - this.heading) * Math.min(1, k * 4));
    const hop = Math.sin(Math.PI * k) * 0.09;
    this.rootY = THREE.MathUtils.lerp(STAND_ROOT_Y, STOOL_TOP - 0.1, smooth(k)) + hop;
    g.hipL = g.hipR = -1.45 * k; g.kneeL = g.kneeR = 1.3 * k; g.splay = 0.05;
    const lt = t - this.dSubT + this.ph * 3;
    // Loop: hold the mug, look out, sip, sometimes lean on the counter.
    const lean = this.dPhase === 'loop' ? win(lt % 22, 12, 13.2, 18.5, 19.8) : 0;
    const sip = this.dPhase === 'loop' ? win(lt % 7.5, 3.0, 3.8, 4.8, 5.6) * (1 - lean) : 0;
    this.mugHold(g, sip, k);
    g.hp = -0.06 - 0.12 * sip + 0.12 * lean; g.hy = 0.22 * Math.sin(lt * 0.13) * (1 - sip); g.lean = 0.05 + 0.2 * lean;
    if (lean > 0) {
      const free = this.mugRight() ? g.armL : g.armR;
      headPoint(g, CHIN, _a); _a.x += this.mugRight() ? -0.05 : 0.05;
      free.lerp(_a, lean);
    }
    this.kPose = 8;
    return sip > 0.6 ? 'blink' : lean > 0.5 ? 'sleepy' : 'smile';
  }

  private sofaPose(t: number, g: Pose, k: number): Expression {
    const sp = this.spot!;
    const ap = this.ctx.nav.node(sp.node);
    const hipX = this.lying ? SOFA.x - SOFA.len / 2 + 1.12 : sp.x;
    const sit = this.lying ? seg(k, 0, 0.55) : k;
    const lie = this.lying ? seg(k, 0.5, 1) : 0;
    this.pos.set(THREE.MathUtils.lerp(ap.x, hipX, this.lying ? seg(k, 0.3, 1) : 0) + (this.lying ? 0 : 0), THREE.MathUtils.lerp(ap.y, SOFA.z + 0.02, sit));
    if (!this.lying) this.pos.x = sp.x;
    this.rootY = THREE.MathUtils.lerp(STAND_ROOT_Y, SOFA.seat - 0.1, smooth(sit)) + 0.2 * lie;
    if (this.dPhase !== 'enter' || this.dT > 0.4) this.heading = wrap(this.heading + wrap(0 - this.heading) * 0.2);
    this.lieQ = this.lying && lie > 0 ? LIE_Q : null;
    if (this.lying) this.lieW = lie;
    const lt = t - this.dSubT + this.ph * 3;
    if (lie > 0) {
      g.hipL = 0.1 * lie + SEAT_HIP * 0.95 * (1 - lie); g.hipR = -0.25 * lie + SEAT_HIP * 0.95 * (1 - lie); g.kneeL = 0.08 * lie + 1.4 * (1 - lie); g.kneeR = 0.55 * lie + 1.4 * (1 - lie); g.splay = 0.02;
      g.lean = 0.36 * lie; g.hp = 0.1 * lie; g.hy = 0.35 * lie; g.hr = 0.1 * lie;
    } else {
      g.hipL = g.hipR = SEAT_HIP * 0.95 * sit; g.kneeL = g.kneeR = 1.45 * sit; g.splay = 0.06 * sit;
      g.lean = -0.2 * sit; g.hp = 0.02;
    }
    const yawn = this.dPhase === 'loop' ? win(lt % 26, 14, 14.6, 16.6, 17.4) : 0;
    const sip = this.dPhase === 'loop' ? win(lt % 9, 4, 4.8, 5.8, 6.6) * (1 - yawn) * (1 - lie) : 0;
    this.mugHold(g, sip, Math.max(sit, lie));
    if (yawn > 0) {
      const free = this.mugRight() ? g.armL : g.armR;
      headPoint(g, MOUTH, _a); _a.z += 0.05; _a.x += this.mugRight() ? -0.02 : 0.02;
      free.lerp(_a, yawn);
      g.hp -= 0.22 * yawn;
    }
    g.breath = 1 + 0.02 * Math.sin(t * 1.1 + this.ph);
    this.kPose = 7;
    return yawn > 0.3 ? 'blink' : sip > 0.6 ? 'blink' : Math.sin(lt * 0.2) > 0.2 ? 'sleepy' : 'smile';
  }

  /** Mug in the mug hand, cradled with the other; sip lifts it to the mouth. */
  private mugHold(g: Pose, sip: number, k: number) {
    if (this.carry !== 'mug') return;
    const right = this.mugRight(), s = right ? 1 : -1;
    const hand = right ? g.armR : g.armL, other = right ? g.armL : g.armR;
    bodyPoint(g, s * 0.03, 0.34, 0.3, _a);
    headPoint(g, MOUTH, _b); _b.z += 0.07; _b.y -= 0.06; _b.x += s * 0.1;
    _a.lerp(_b, sip);
    hand.lerp(_a, k);
    _b.copy(_a); _b.x -= s * 0.15; _b.y -= 0.02;
    other.lerp(_b, k * (1 - sip));
    (right ? g.poleR : g.poleL).set(s * 0.9, -0.8, -0.2);
    (right ? g.poleL : g.poleR).set(-s * 0.9, -0.8, -0.2);
  }

  private stretchPose(t: number, g: Pose, k: number): Expression {
    const lt = (t - this.dSubT + this.ph * 2) % 16;
    const up = win(lt, 0.2, 1.2, 3.0, 3.8) * k;
    const side = win(lt, 3.8, 4.4, 6.8, 7.4) * k;
    const neck = win(lt, 7.4, 7.9, 10.4, 10.9) * k;
    _a.set(-0.42, 0.98, -0.02); g.armL.lerp(_a, up);
    _a.set(0.42, 0.98, -0.02); g.armR.lerp(_a, up);
    g.lean -= 0.15 * up; g.hp -= 0.3 * up;
    // Side bends: one arm up and over, hip out.
    const sb = Math.sin((lt - 3.8) * 1.3);
    g.sway = 0.22 * side * sb;
    _a.set(-0.12 * sb, 0.95, 0.02); (sb > 0 ? g.armL : g.armR).lerp(_a, side * Math.abs(sb));
    _b.set(sb > 0 ? 0.27 : -0.27, 0.32, 0.12); (sb > 0 ? g.armR : g.armL).lerp(_b, side * Math.abs(sb));
    // Neck roll.
    g.hr += 0.32 * Math.sin((lt - 7.4) * 2.2) * neck; g.hp += 0.12 * Math.cos((lt - 7.4) * 2.2) * neck;
    // Idle: look around, shift weight.
    const idle = 1 - Math.max(up, side, neck);
    g.hy += 0.4 * Math.sin(lt * 0.5 + this.ph) * idle * k;
    this.kPose = 7;
    return up > 0.5 || neck > 0.5 ? 'blink' : 'smile';
  }

  /** New seated poses, built on the seated root; returns the face. */
  private seatedMicro(t: number, g: Pose): Expression | null {
    const lt = t - this.microStart;
    seatedBase(g, t, this.ph);
    this.kPose = 6;
    switch (this.micro) {
      case 'leanBack':
        g.lean = -0.2; g.hp = -0.16; g.hr = 0.06 * Math.sin(lt * 0.4);
        headPoint(g, BACK_OF_HEAD, _a);
        g.armL.set(_a.x - 0.16, _a.y + 0.02, _a.z - 0.02); g.armR.set(_a.x + 0.16, _a.y + 0.02, _a.z - 0.02);
        g.poleL.set(-1, 0.55, 0.15); g.poleR.set(1, 0.55, 0.15);
        g.breath = 1 + 0.022 * Math.sin(t * 1.0);
        return Math.sin(lt * 0.5) > 0.3 ? 'blink' : 'sleepy';
      case 'restHead':
        g.lean = 0.5; g.hp = 0.42; g.hr = 0.18 * (this.slot % 2 ? 1 : -1);
        g.armL.set(0.07, TY + 0.03, 0.4); g.armR.set(-0.07, TY + 0.05, 0.38);
        g.poleL.set(-1, 0.1, 0.2); g.poleR.set(1, 0.1, 0.2);
        g.breath = 1 + 0.026 * Math.sin(t * 0.85);
        return lt > 1.4 ? 'blink' : 'sleepy';
      case 'raiseBook': {
        const r = win(lt, 0.2, 1.4, this.microDur - 1.4, this.microDur - 0.3);
        const bk = this.seat.book;
        if (bk) {
          bk.position.set(this.bookHome.x, this.bookHome.y + 0.32 * r, this.bookHome.z - 0.04 * r);
          bk.rotation.set(this.bookHomeRot.x - 1.05 * r, this.bookHomeRot.y, this.bookHomeRot.z);
          bk.updateMatrix();
          _a.set(-0.21, 0, -0.04).applyMatrix4(bk.matrix); _b.set(0.21, 0, -0.04).applyMatrix4(bk.matrix);
          // Book space → seat space → root space (seated root sits at the seat origin, raised).
          _a.y -= CHAIR_ROOT_Y; _b.y -= CHAIR_ROOT_Y;
          g.armL.copy(_a); g.armR.copy(_b);
          g.poleL.set(-0.9, -0.7, -0.3); g.poleR.set(0.9, -0.7, -0.3);
        }
        g.lean = 0.04; g.hp = 0.05 + 0.05 * Math.sin(lt * 0.3);
        this.kPose = 9;
        return 'focused';
      }
      case 'penTwirl':
        headPoint(g, CHIN, _a); _a.x += 0.1; _a.z += 0.06; _a.y -= 0.04;
        g.armR.copy(_a); g.armL.set(-0.17, TY, 0.44);
        g.hy = -0.18; g.hp = 0.05; g.hr = -0.08;
        return 'focused';
      case 'rubEyes': {
        headPoint(g, EYES, _a);
        const wig = 0.012 * Math.sin(lt * 9);
        g.armL.set(_a.x - 0.06 + wig, _a.y - 0.01, _a.z + 0.05); g.armR.set(_a.x + 0.06 - wig, _a.y - 0.01, _a.z + 0.05);
        g.poleL.set(-0.6, -0.8, 0.1); g.poleR.set(0.6, -0.8, 0.1);
        g.lean = 0.16; g.hp = 0.2;
        return 'blink';
      }
      case 'yawn': {
        const y = win(lt, 0.4, 1.2, 2.4, 3.2);
        headPoint(g, MOUTH, _a);
        g.armR.copy(_a).add(_b.set(0.02, 0, 0.05));
        g.armR.lerp(_v.set(0.17, TY, 0.44), 1 - y);
        g.poleR.set(0.8, -0.7, -0.2);
        g.hp = 0.1 - 0.28 * y; g.lean = 0.02 - 0.08 * y;
        g.armL.set(-0.25, 0.4 + 0.05 * y, 0.25);
        return y > 0.3 ? 'blink' : 'sleepy';
      }
      case 'glance': {
        const d = this.slot % 2 ? 1 : -1;
        const gw = win(lt, 0.3, 0.8, 2.2, 2.7);
        g.hy = 0.55 * d * gw; g.yaw = 0.08 * d * gw; g.hp = 0.06;
        // Arms keep doing what they were doing: copy them from the act system's result.
        return gw > 0.5 ? 'smile' : null;
      }
      case 'stretchUp': {
        const up = win(lt, 0.3, 1.4, 3.4, 4.6);
        _a.set(-0.5, 0.98, -0.02); g.armL.lerp(_a, up);
        _a.set(0.5, 0.98, -0.02); g.armR.lerp(_a, up);
        g.lean = 0.1 - 0.24 * up; g.hp = 0.12 - 0.36 * up; g.sway = 0.08 * Math.sin(lt * 1.5) * up;
        return up > 0.5 ? 'blink' : 'smile';
      }
    }
    return null;
  }

  // ---- props that follow the hands ----------------------------------------------------------------

  private worldToRootSpace(w: THREE.Vector3, out: THREE.Vector3) {
    const root = this.char!.root;
    root.updateWorldMatrix(true, false);
    return out.copy(w).applyMatrix4(_m2.copy(root.matrixWorld).invert());
  }

  private handWorld(right: boolean, out: THREE.Vector3) {
    const b = this.char!.rig.bones;
    return (right ? b.handR : b.handL).getWorldPosition(out);
  }

  private syncHeld(t: number) {
    const c = this.char!;
    const room = this.ctx.room;
    c.root.updateMatrixWorld(true);
    // Mug: carried in the mug hand (kit space position, upright, handle toward the hand).
    if (this.carry === 'mug' && this.mode !== 'seated') {
      const right = this.mugRight();
      this.handWorld(right, _v);
      _w.set(right ? -0.1 : 0.1, -0.055, 0).applyAxisAngle(_Y, this.heading);
      _v.add(_w);
      const kit = this.seat.kit;
      kit.updateWorldMatrix(true, false);
      this.seat.mug.position.copy(_v.applyMatrix4(_m2.copy(kit.matrixWorld).invert()));
      this.seat.mug.rotation.set(0, this.heading - kit.parent!.rotation.y + (right ? Math.PI : 0), 0);
    }
    // Book: closed in one hand, or open in both.
    const s = this.slot;
    const hc = room.held.closed, hcv = room.held.covers, hp = room.held.pages;
    if (this.book >= 0 && this.carry === 'book') {
      if (this.bookOpen > 0.5) {
        this.handWorld(false, _a); this.handWorld(true, _b);
        _v.addVectors(_a, _b).multiplyScalar(0.5);
        _v.y += 0.08;
        // Face the reader: pages toward the head, tipped back.
        _q.setFromAxisAngle(_Y, this.heading);
        _q2.setFromEuler(_e.set(-0.85, 0, 0));
        _q.multiply(_q2);
        _m.compose(_v, _q, _s.set(1, 1, 1));
        hcv.setMatrixAt(s, _m); hp.setMatrixAt(s, _m); hc.setMatrixAt(s, ZERO);
      } else {
        const right = this.mode === 'dest' && this.spot?.kind === 'shelf' ? true : this.side > 0;
        this.handWorld(right, _v);
        _q.setFromAxisAngle(_Y, this.heading + Math.PI / 2);
        _v.y -= 0.06;
        _m.compose(_v, _q, _s.set(1, 1, 1));
        hc.setMatrixAt(s, _m); hcv.setMatrixAt(s, ZERO); hp.setMatrixAt(s, ZERO);
      }
    } else if (this.bookOnTable >= 0 && this.seat.kit.visible) {
      // The book brought back lies open on the table at their seat.
      _v.set(0.06, TABLE_TOP + 0.012, 0.8);
      this.seat.anchor.localToWorld(_v);
      _q.setFromAxisAngle(_Y, this.seat.anchor.rotation.y + Math.PI + (this.slot % 3 - 1) * 0.12);
      _q2.setFromEuler(_e.set(-Math.PI / 2, 0, 0));
      _q.multiply(_q2);
      _m.compose(_v, _q, _s.set(1.15, 1.15, 0.5));
      hcv.setMatrixAt(s, _m); hp.setMatrixAt(s, _m); hc.setMatrixAt(s, ZERO);
    } else { hc.setMatrixAt(s, ZERO); hcv.setMatrixAt(s, ZERO); hp.setMatrixAt(s, ZERO); }
    hc.instanceMatrix.needsUpdate = hcv.instanceMatrix.needsUpdate = hp.instanceMatrix.needsUpdate = true;
    void t;
  }

  private syncPen(t: number) {
    if (!this.pen) return;
    const twirl = this.mode === 'seated' && this.micro === 'penTwirl';
    if (twirl) {
      const lt = t - this.microStart;
      this.pen.visible = true;
      this.pen.rotation.set(0, 0, lt * 9 * win(lt, 0.6, 1, this.microDur - 1.2, this.microDur - 0.8));
    } else if (this.pen.rotation.z !== 0) this.pen.rotation.set(0, 0, 0);
  }

  /** A worn backpack stays hung on the chair back whenever its owner is up. */
  private syncBag() {
    const c = this.char!;
    const bag = c.rig.bones.bag;
    const hips = c.rig.bones.hips;
    const a = this.seat.anchor;
    // Chair space → world: the anchor, then the chair's slide and twist.
    _q.setFromAxisAngle(_Y, a.rotation.y + this.chairYaw);
    _v.set(Math.sin(a.rotation.y) * this.chairOff, 0, Math.cos(a.rotation.y) * this.chairOff).add(a.position);
    _m.compose(_v, _q, _s.set(1, 1, 1));
    _w.set(0, CHAIR_ROOT_Y + 0.25, -0.31).applyMatrix4(_m);
    hips.updateWorldMatrix(true, false);
    _m2.copy(hips.matrixWorld).invert();
    bag.position.copy(_w.applyMatrix4(_m2));
    hips.getWorldQuaternion(_q2).invert();
    bag.quaternion.copy(_q2.multiply(_q));
  }

  /** Settle instantly into a destination's loop (first load / reduced motion). */
  private settleDest(k: number) {
    if (!this.spot) return;
    if (this.spot.kind === 'sofa' && this.lying) this.lieW = k;
  }

  // ---- lab ----------------------------------------------------------------------------------------

  lab(a: LabAction, t: number) {
    if (!this.char || !this.occ) return;
    if (SEATED_MICROS.includes(a as SeatedMicro)) {
      if (this.mode === 'seated') { this.forced = a; this.nextMicro = 0; this.micro = null; }
      return;
    }
    if (a === 'stand') { this.goal = 'break'; this.forced = 'stretch'; this.reactAt = t; this.spot = null; return; }
    if (a === 'sit') { this.goal = 'seat'; this.reactAt = t; return; }
    if (a === 'leave' || a === 'join') return; // the lab drives these through the seat status
    // A destination: go there now.
    this.forced = a;
    this.ctx.spots.release(this.slot);
    this.spot = null;
    this.goal = 'break';
    this.reactAt = t;
    if (this.mode === 'walk' || this.mode === 'dest') { this.pickSpot(); if (this.mode === 'dest') { this.dPhase = 'exit'; this.dT = 0; this.dDur = 0.8; } else this.planForGoal(t); }
  }

  info(): string {
    return `${this.occ?.name ?? '-'} ${this.goal}/${this.mode}${this.spot ? ' @' + this.spot.id : ''}${this.micro ? ' ~' + this.micro : ''} u=${this.u.toFixed(2)}`;
  }
}

const _c = new THREE.Color();

function goalOf(s: SlotStatus): Goal { return s === 'focus' ? 'seat' : s === 'break' ? 'break' : 'gone'; }

function seatedLegs(p: Pose) { p.hipL = p.hipR = SEAT_HIP; p.kneeL = p.kneeR = SEAT_KNEE; p.splay = 0; }

/** Neutral seated pose (the act system's resting pose), the base for blends. */
function seatedBase(g: Pose, t: number, ph: number) {
  g.lean = 0.1; g.yaw = 0; g.sway = 0; g.hp = 0.12; g.hy = 0; g.hr = 0;
  g.armL.set(-0.17, TY, 0.44); g.armR.set(0.17, TY, 0.44);
  g.poleL.set(-0.9, -0.6, -0.5); g.poleR.set(0.9, -0.6, -0.5);
  seatedLegs(g);
  g.breath = 1 + 0.012 * Math.sin(t * 1.7 + ph);
}

function hideBook(books: THREE.InstancedMesh, i: number, hide: boolean) {
  books.getMatrixAt(i, _m);
  const ud = books.userData as { stash?: Map<number, THREE.Matrix4> };
  ud.stash ??= new Map();
  if (hide) { if (!ud.stash.has(i)) ud.stash.set(i, _m.clone()); books.setMatrixAt(i, ZERO); }
  else { const m = ud.stash.get(i); if (m) { books.setMatrixAt(i, m); ud.stash.delete(i); } }
  books.instanceMatrix.needsUpdate = true;
}

/** Shelf books within reach of each shelf spot (spines at hand height). */
function reachableBooks(books: THREE.InstancedMesh): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const s of SPOTS) {
    if (s.kind !== 'shelf') continue;
    const list: number[] = [];
    for (let i = 0; i < books.count; i++) {
      books.getMatrixAt(i, _m);
      _v.setFromMatrixPosition(_m);
      _s.setFromMatrixScale(_m);
      if (Math.abs(_v.z - s.z) < 0.4 && _v.y > 0.62 && _v.y < 1.25 && _v.x < WALL_X + 0.5 && _s.y > 0.2) list.push(i);
    }
    out.set(s.id, list);
  }
  return out;
}

export function createCrowd(room: RoomBuild): Crowd {
  const nav = new Nav();
  const ctx: Ctx = { room, nav, spots: new Spots(), agents: [], reduced: false, micro: 1, shelfBooks: reachableBooks(room.books), borrowed: new Set() };
  const agents = room.seats.map((s, i) => new Agent(i, s, ctx));
  ctx.agents = agents;
  let now = 0;
  let halfRate = false;
  let frame = 0;
  const movers: (THREE.Vector3 | null)[] = agents.map(() => null);
  const moverVecs = agents.map(() => new THREE.Vector3());
  const guests: THREE.Vector3[] = [];
  const guestVecs = agents.map(() => new THREE.Vector3());
  const camDist = new Float32Array(MAX_SLOTS);
  const sorted = new Float32Array(MAX_SLOTS);
  const door = room.door;
  let doorOpen = 0;

  return {
    set(slots, instant) {
      for (let i = 0; i < MAX_SLOTS; i++) agents[i].setOccupant(slots[i] ?? null, instant, now);
      if (instant) for (const s of room.seats) { s.kitShown = s.kitTarget; s.lamp.level = s.lamp.target; }
    },
    step(t, dt) {
      now = t;
      for (const a of agents) a.step(t, dt);
      // Lamps follow the person: lit only once they're seated and focusing.
      for (const a of agents) {
        const st: SlotStatus = !a.occ ? 'empty' : a.mode === 'seated' && a.goal === 'seat' ? 'focus' : a.occ.status === 'focus' ? 'break' : a.occ.status;
        a.seat.lamp.target = LAMP_LEVEL[st];
      }
      // The door swings open for anyone close to it or when opened manually.
      let near = false;
      const din = nav.node('din');
      for (const a of agents) if (a.char?.root.visible && a.mode === 'walk' && Math.hypot(a.pos.x - din.x, a.pos.y - din.y) < 2.0) near = true;
      const targetOpen = near || door.userData.manualOpen ? 1 : 0;
      doorOpen += (targetOpen - doorOpen) * (1 - Math.exp(-(targetOpen ? 6 : 2.5) * dt));
      const eased = doorOpen * doorOpen * (3 - 2 * doorOpen);
      door.rotation.y = 1.36 * eased;
      if (door.userData.lever) {
        const latchFactor = doorOpen > 0.005 && doorOpen < 0.22 ? Math.sin((doorOpen / 0.22) * Math.PI) : 0;
        (door.userData.lever as THREE.Group).rotation.z = latchFactor * 0.42;
      }
    },
    update(t, dt, camPos) {
      frame++;
      for (let i = 0; i < MAX_SLOTS; i++) camDist[i] = camPos.distanceToSquared(room.seats[i].anchor.position);
      let median = 0;
      if (halfRate) { sorted.set(camDist); sorted.sort(); median = sorted[MAX_SLOTS >> 1]; }
      for (let i = 0; i < MAX_SLOTS; i++) {
        const a = agents[i];
        // Low tier: the far half of the room animates at half rate.
        if (halfRate && camDist[i] > median && a.mode === 'seated') {
          a.pendingDt += dt;
          if ((frame + i) % 2) continue;
          const d = a.pendingDt;
          a.pendingDt = 0;
          a.update(t, d);
          continue;
        }
        a.update(t, dt);
      }
      guests.length = 0;
      for (let i = 0; i < MAX_SLOTS; i++) {
        const a = agents[i];
        const vis = !!a.char?.root.visible;
        movers[i] = vis && a.mode !== 'seated' && a.mode !== 'gone' ? moverVecs[i].set(a.pos.x, 0, a.pos.y) : null;
        if (vis && a.mode === 'dest' && a.spot?.kind === 'sofa') guests.push(guestVecs[i].set(a.pos.x, SOFA.seat, a.pos.y));
      }
    },
    labelPoint(i, out) {
      const a = agents[i];
      if (!a.occ) return false;
      if (a.char && a.char.root.visible) {
        a.char.head.updateWorldMatrix(true, false);
        out.setFromMatrixPosition(a.char.head.matrixWorld);
        out.y += 0.42;
        return true;
      }
      const s = room.seats[i];
      out.set(0, 0.95, -0.35).applyMatrix4(s.anchor.matrixWorld);
      return true;
    },
    movers: () => movers,
    sofaGuests: () => guests,
    setMicroRate(k, half) { ctx.micro = k; halfRate = half; },
    setReducedMotion(on) { ctx.reduced = on; },
    lab(slot, a) { agents[slot]?.lab(a, now); },
    debug(slot) { return agents[slot]?.info() ?? ''; },
    dispose() {
      for (const a of agents) {
        const c = a.char;
        if (c) { a.seat.anchor.remove(c.root); c.dispose(); }
      }
    },
  };
}

export { DOOR };
