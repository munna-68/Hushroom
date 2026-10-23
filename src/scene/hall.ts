// The study hall as data (PROJECT.md §12): seats, kits, lamps, lamp-as-status,
// break destinations and the walk graph. Everything that places something in the
// room reads it from here, so the layout can be tuned in one file.
import type { FocusAct } from './character';

/** Seats at the table; also the room's capacity in the scene. */
export const MAX_SLOTS = 8;

export type SlotStatus = 'focus' | 'break' | 'away' | 'empty';

/**
 * Seat lamp brightness per status (PROJECT.md §6): lit while focusing, off on break
 * (the person is visibly elsewhere), off when away or empty. 1 = fully lit; a low glow
 * would be ~0.15. The lamp follows the person: it comes on once they are seated.
 */
export const LAMP_LEVEL: Record<SlotStatus, number> = { focus: 1, break: 0, away: 0, empty: 0 };
/** Seconds for a lamp to fade between levels. */
export const LAMP_FADE = 0.5;

// ---- room shell ------------------------------------------------------------

export const TABLE_TOP = 0.69;
export const TABLE = { len: 5.6, depth: 1.36 };
/** Inner faces of the two walls: the window/bookshelf wall (−x) and the door wall (−z). */
export const WALL_X = -4.9;
export const WALL_Z = -5.2;
export const WALL_H = 6.8;
/** Far edges of the floor on the open sides. */
export const FLOOR_X1 = 11.2;
export const FLOOR_Z1 = 8.6;
/** Stairwell opening at the near-right (x: [3.68..5.63], z: [-1.65..2.60]). */
export const WELL = { x: 3.68, z: -0.6, x1: 5.63, z0: -1.65, z1: 2.60 };

export const WINDOW = { z0: -0.85, z1: 2.55, y0: 1.08, y1: 4.0, cols: 4, rows: 4, mull: 0.06 };
export const COUNTER = { top: 0.96, depth: 0.62, z0: -1.15, z1: 2.85 };
export const SHELF = { z0: -5.0, bay: 1.05, bays: 3, depth: 0.44, h: 2.78 };
export const DOOR = { x: 2.55, w: 1.06, h: 2.26 };
export const PENDANT = { x: 0.6, y: 3.45, z: -0.6 };

// ---- seats -----------------------------------------------------------------

export const SEAT_X = [-2.07, -0.69, 0.69, 2.07];
export const SEAT_Z = 0.98;
/** Character root height on a chair (character.ts CHAIR_ROOT_Y) and the cushion top. */
export const SEAT_TOP = 0.27;

/** Chair offset along the seat's facing axis (+ = toward the table). */
export const CHAIR_IN = 0.17;
export const CHAIR_BACK = -0.38;

/** Slots 0–3 sit on the back side facing +z (toward the camera); 4–7 face them. */
export function seatPose(slot: number): { x: number; z: number; rotY: number } {
  const back = slot < 4;
  return { x: SEAT_X[slot % 4], z: back ? -SEAT_Z : SEAT_Z, rotY: back ? 0 : Math.PI };
}

export type LampKind = 'banker' | 'swing' | 'amber' | 'drum' | 'cone' | 'gooseneck' | 'mushroom' | 'dome';

/** Warm tints so neighbouring lamps read differently even when all are lit. */
export const LAMP_TINT: Record<LampKind, string> = {
  banker: '#ffd79a', swing: '#ffcf86', amber: '#ffb35c', drum: '#fff0c8',
  cone: '#ffd9a0', gooseneck: '#ffcf86', mushroom: '#ffe2b8', dome: '#ffd9b0',
};

export type KitItem =
  | 'mug' | 'bottle' | 'bottleBlue' | 'bottleGrey' | 'bottleCream' | 'sticky' | 'phone' | 'pencilCase' | 'pencil'
  | 'bookStack' | 'notepad';

export interface SeatKit {
  act: FocusAct;
  lamp: LampKind;
  mug: string;
  items: KitItem[];
  /** Floor backpack leaning on the chair (hidden for avatars that wear one). */
  bag?: string;
}

/** One kit per slot; neighbours never match. Matches the lamp order in the references. */
export const KITS: SeatKit[] = [
  { act: 'write', lamp: 'banker', mug: '#f4efe4', items: ['sticky', 'pencil', 'bookStack'] },
  { act: 'type', lamp: 'swing', mug: '#3f8f8a', items: ['phone', 'notepad'], bag: '#33507a' },
  { act: 'read', lamp: 'amber', mug: '#d97a76', items: ['bottleBlue', 'sticky'] },
  { act: 'write', lamp: 'gooseneck', mug: '#e3a948', items: ['bookStack', 'bottleGrey'], bag: '#5b6168' },
  { act: 'write', lamp: 'cone', mug: '#f4efe4', items: ['pencilCase', 'bottleCream'], bag: '#3a3d47' },
  { act: 'type', lamp: 'drum', mug: '#9a86c4', items: ['bottleCream', 'sticky'] },
  { act: 'write', lamp: 'dome', mug: '#f4efe4', items: ['bottleBlue', 'phone'], bag: '#22252c' },
  { act: 'read', lamp: 'mushroom', mug: '#3f8f8a', items: ['bottleGrey', 'notepad'] },
];

/** Lamp spot in seat space (character faces +z): ahead and to the reader's right. */
export const LAMP_AT = { x: -0.46, z: 0.8 };

// ---- break destinations and the walk graph -----------------------------------------

export type DestKind = 'shelf' | 'window' | 'sofa' | 'stretch';

/** Aisles behind each row of chairs, clear of chairs pushed back. */
export const AISLE_Z = 2.22;

export interface Spot {
  kind: DestKind;
  id: string;
  /** Where the person ends up and the way they face (radians, 0 = +z). */
  x: number; z: number; face: number;
  /** Walk-graph node the spot is reached from. */
  node: string;
  /** Stool index, sofa cushion, shelf bay. */
  k: number;
}

/** Stool positions along the window counter (x, z); the stool top is at 0.56. */
export const STOOLS: [number, number][] = [[-4.16, 0.2], [-4.16, 1.1], [-4.16, 2.0]];
export const STOOL_TOP = 0.56;

/** L-shaped corner sofa: main section hugs the left wall (running along z, facing +x toward the coffee table); second section sits at the lower-left (running along x, facing -z toward the coffee table). */
export const SOFA = { x: -4.32, z: 3.66, len: 1.72, seat: 0.45 };
export const COFFEE = { x: -2.82, z: 3.84, r: 0.5 };

export const SPOTS: Spot[] = [
  { kind: 'shelf', id: 'shelfA', x: -4.1, z: -3.43, face: -Math.PI / 2, node: 'shA', k: 1 },
  { kind: 'shelf', id: 'shelfB', x: -4.1, z: -2.38, face: -Math.PI / 2, node: 'shB', k: 2 },
  { kind: 'window', id: 'win0', x: STOOLS[0][0], z: STOOLS[0][1], face: -Math.PI / 2, node: 'wn0', k: 0 },
  { kind: 'window', id: 'win2', x: STOOLS[2][0], z: STOOLS[2][1], face: -Math.PI / 2, node: 'wn2', k: 2 },
  { kind: 'sofa', id: 'sofaA', x: SOFA.x + 0.14, z: 4.02, face: Math.PI / 2, node: 'sA', k: 0 },
  { kind: 'sofa', id: 'sofaB', x: -3.14, z: 5.10, face: Math.PI, node: 'sB', k: 1 },
];

/** Walk graph: nodes (x, z) and the edges between them. Paths stay clear of furniture. */
export const NAV_NODES: Record<string, [number, number]> = {
  b0: [-2.76, -AISLE_Z], b1: [-1.38, -AISLE_Z], b2: [0, -AISLE_Z], b3: [1.38, -AISLE_Z], b4: [2.76, -AISLE_Z], be: [3.22, -AISLE_Z],
  f0: [-2.76, AISLE_Z], f1: [-1.38, AISLE_Z], f2: [0, AISLE_Z], f3: [1.38, AISLE_Z], f4: [2.76, AISLE_Z], fe: [3.2, AISLE_Z],
  e0: [3.2, 0],
  bw: [-3.55, -AISLE_Z], w0: [-3.55, 0], fw: [-3.55, AISLE_Z],
  c0: [-3.55, -0.9], wn0: [-3.55, STOOLS[0][1]], wn1: [-3.55, STOOLS[1][1]], wn2: [-3.55, STOOLS[2][1]],
  shA: [-3.75, -3.43], shB: [-3.75, -2.6],
  s0: [-1.65, 2.75], s1: [-1.65, 3.85], sB: [-3.14, 4.45], sA: [-3.65, 4.02],
  dmid: [2.3, -3.4], din: [DOOR.x, -4.6], dout: [DOOR.x, -6.1],
};

export const NAV_EDGES: [string, string][] = [
  ['b0', 'b1'], ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'], ['b4', 'be'], ['be', 'e0'], ['e0', 'fe'], ['fe', 'f4'],
  ['f4', 'f3'], ['f3', 'f2'], ['f2', 'f1'], ['f1', 'f0'], ['f0', 'fw'], ['fw', 'w0'], ['w0', 'bw'], ['bw', 'b0'],
  ['bw', 'c0'], ['c0', 'wn0'], ['wn0', 'wn1'], ['wn1', 'wn2'], ['wn2', 'fw'],
  ['bw', 'shB'], ['shB', 'shA'], ['b0', 'shB'],
  ['f1', 's0'], ['f0', 's0'], ['s0', 's1'], ['s1', 'sB'], ['sB', 'sA'],
  ['b3', 'dmid'], ['b4', 'dmid'], ['b2', 'dmid'], ['dmid', 'din'], ['din', 'dout'],
];
