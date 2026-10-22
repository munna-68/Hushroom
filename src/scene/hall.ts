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
export const WALL_H = 5.6;
/** Far edges of the floor on the open sides. */
export const FLOOR_X1 = 9;
export const FLOOR_Z1 = 7.5;
/** Stairwell opening at the near-right (x beyond, z beyond). */
export const WELL = { x: 3.55, z: -0.6 };

export const WINDOW = { z0: -0.85, z1: 2.55, y0: 1.08, y1: 4.0, cols: 4, rows: 4, mull: 0.06 };
export const COUNTER = { top: 0.96, depth: 0.62, z0: -1.15, z1: 2.85 };
export const SHELF = { z0: -5.0, bay: 1.05, bays: 3, depth: 0.44, h: 2.78 };
export const DOOR = { x: 2.55, w: 1.06, h: 2.26 };
export const PENDANT = { x: 0.15, y: 3.7, z: -0.25 };

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

// ---- break destinations ----------------------------------------------------

export type DestKind = 'shelf' | 'window' | 'sofa' | 'stretch';

export interface Spot {
  kind: DestKind;
  /** Where the person stands (or sits) and the direction they face (radians, 0 = +z). */
  x: number; z: number; face: number;
  /** Waypoint node the spot is reached from. */
  node: string;
  /** Extra data for the pose (stool index, sofa end). */
  k?: number;
}

export const SPOTS: Spot[] = [
  { kind: 'shelf', x: -4.62, z: -2.95, face: -Math.PI / 2, node: 'shelfA', k: 0 },
  { kind: 'shelf', x: -4.62, z: -1.55, face: -Math.PI / 2, node: 'shelfB', k: 2 },
  { kind: 'window', x: -4.95, z: 0.85, face: -Math.PI / 2, node: 'winA', k: 0 },
  { kind: 'window', x: -4.95, z: 2.55, face: -Math.PI / 2, node: 'winC', k: 2 },
  { kind: 'sofa', x: -4.45, z: 3.55, face: Math.PI, node: 'sofaA', k: 0 },
  { kind: 'sofa', x: -3.35, z: 3.55, face: Math.PI, node: 'sofaB', k: 1 },
];

/** Stool positions along the window counter (x, z). */
export const STOOLS: [number, number][] = [[-4.16, 0.2], [-4.16, 1.1], [-4.16, 2.0]];

/** Sofa runs along x with its back toward the table (−z), facing the camera side. */
export const SOFA = { x: -3.05, z: 3.3, len: 2.7, seat: 0.33 };
export const COFFEE = { x: -2.2, z: 4.45, r: 0.5 };
