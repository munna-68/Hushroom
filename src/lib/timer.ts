export type Phase = 'focus' | 'break';

export interface TimerConfig {
  startedAt: number; // ms epoch (server clock)
  focusMin: number;
  breakMin: number;
}

export interface TimerState {
  phase: Phase;
  remainingSec: number;
  phaseLengthSec: number;
  cycle: number;
}

/** Derive the phase purely from elapsed time; no per-phase writes needed. */
export function timerAt(cfg: TimerConfig, serverNowMs: number): TimerState {
  const focus = cfg.focusMin * 60;
  const brk = cfg.breakMin * 60;
  const cycleLen = focus + brk;
  const elapsed = Math.max(0, (serverNowMs - cfg.startedAt) / 1000);
  const cycle = Math.floor(elapsed / cycleLen);
  const t = elapsed - cycle * cycleLen;
  if (t < focus) return { phase: 'focus', remainingSec: focus - t, phaseLengthSec: focus, cycle };
  return { phase: 'break', remainingSec: cycleLen - t, phaseLengthSec: brk, cycle };
}

export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const PRESETS = [
  { id: '25/5', focusMin: 25, breakMin: 5 },
  { id: '50/10', focusMin: 50, breakMin: 10 },
] as const;
