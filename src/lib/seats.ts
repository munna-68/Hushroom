export const ROOM_CAP = 10;

export interface SeatClaim {
  userId: string;
  joinedAt: number;
  seat: number; // preferred seat, -1 for none
}

/**
 * Deterministic, conflict-safe seat assignment. Every client runs this on the
 * same presence set and gets the same answer: earlier joiners keep their
 * claimed seat, later conflicting joiners move to the lowest free seat.
 */
export function assignSeats(claims: SeatClaim[]): Map<string, number> {
  const sorted = [...claims].sort((a, b) => a.joinedAt - b.joinedAt || (a.userId < b.userId ? -1 : 1));
  const taken = new Array<boolean>(ROOM_CAP).fill(false);
  const out = new Map<string, number>();
  const pending: SeatClaim[] = [];
  for (const c of sorted) {
    if (c.seat >= 0 && c.seat < ROOM_CAP && !taken[c.seat]) {
      taken[c.seat] = true;
      out.set(c.userId, c.seat);
    } else pending.push(c);
  }
  for (const c of pending) {
    const free = SEAT_FILL_ORDER.find((s) => !taken[s]);
    if (free === undefined) continue; // over cap: not seated
    taken[free] = true;
    out.set(c.userId, free);
  }
  return out;
}

// Fill from the middle of the table outward so small rooms look gathered.
export const SEAT_FILL_ORDER = [2, 7, 1, 6, 3, 8, 0, 5, 4, 9];
