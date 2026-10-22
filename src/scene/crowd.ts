// People at the table: one character per occupied slot, its lamp, kit and chair.
import * as THREE from 'three';
import { avatar } from '../lib/avatars';
import { Character, CHAIR_ROOT_Y } from './character';
import { CHAIR_BACK, CHAIR_IN, LAMP_LEVEL, MAX_SLOTS, type SlotStatus } from './hall';
import type { RoomBuild } from './room';

export interface Occupant {
  /** Stable id (user id) so the same person keeps their character. */
  key: string;
  name: string;
  avatar: number;
  status: SlotStatus;
  isMe: boolean;
}

export interface Crowd {
  set(slots: (Occupant | null)[], instant: boolean): void;
  update(t: number, dt: number): void;
  /** World point to hang the name label on; false when nobody is there. */
  labelPoint(slot: number, out: THREE.Vector3): boolean;
  characters(): (Character | null)[];
  dispose(): void;
}

interface Agent {
  occ: Occupant | null;
  char: Character | null;
}

export function createCrowd(room: RoomBuild): Crowd {
  const agents: Agent[] = Array.from({ length: MAX_SLOTS }, () => ({ occ: null, char: null }));

  function apply(i: number, o: Occupant | null) {
    const a = agents[i];
    const seat = room.seats[i];
    const prev = a.occ;
    if (!o || !prev || prev.key !== o.key || prev.avatar !== o.avatar) {
      if (a.char) { seat.anchor.remove(a.char.root); a.char.dispose(); a.char = null; }
      if (o) {
        const c = new Character(avatar(o.avatar), { seed: i * 31 + o.avatar });
        c.focusAct = seat.focusAct;
        c.attach({ tableMug: seat.mug, page: seat.page ?? undefined });
        c.root.position.y = CHAIR_ROOT_Y;
        seat.anchor.add(c.root);
        a.char = c;
      }
    }
    a.occ = o;
    const st: SlotStatus = o ? o.status : 'empty';
    seat.kitTarget = st === 'empty' ? 0 : 1;
    seat.chair.offset = st === 'empty' ? CHAIR_IN : st === 'away' ? CHAIR_BACK : 0;
    seat.chair.yaw = st === 'away' ? (i % 2 ? 0.22 : -0.22) : 0;
    seat.lamp.target = LAMP_LEVEL[st];
    if (seat.bag) seat.bag.visible = st !== 'empty' && !(o && avatar(o.avatar).spec.accessories.includes('backpack'));
    if (a.char && o) {
      a.char.status = o.status === 'break' ? 'break' : 'focusing';
      a.char.root.visible = o.status !== 'away';
      if (o.status === 'away') a.char.park();
    }
  }

  return {
    set(slots, instant) {
      for (let i = 0; i < MAX_SLOTS; i++) apply(i, slots[i] ?? null);
      if (instant) for (const s of room.seats) { s.kitShown = s.kitTarget; s.lamp.level = s.lamp.target; }
    },
    update(t, dt) {
      for (const a of agents) a.char?.update(t, dt);
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
    characters: () => agents.map((a) => a.char),
    dispose() {
      for (let i = 0; i < MAX_SLOTS; i++) { const c = agents[i].char; if (c) { room.seats[i].anchor.remove(c.root); c.dispose(); } }
    },
  };
}
