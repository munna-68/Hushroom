// Demo backend: no network. Rooms and bots are deterministic from the clock so
// every tab agrees; real tabs see each other through BroadcastChannel.
import { load, save } from '../lib/storage';
import { timerAt } from '../lib/timer';
import { ROOM_CAP } from '../lib/seats';
import {
  BackendError, CHAT_MAX, CHAT_RATE, KICK_MINUTES,
  type Backend, type ChatMessage, type PresenceMeta, type Room, type RoomSession, type RoomSummary,
} from './types';

const EPOCH = Date.UTC(2026, 0, 1);
const SEEDED: (Room & { bots: number })[] = [
  { id: 'night-owls', name: 'Night owls', focusMin: 25, breakMin: 5, startedAt: EPOCH, isPublic: true, createdBy: 'bot', bots: 6 },
  { id: 'deep-work', name: 'Deep work hall', focusMin: 50, breakMin: 10, startedAt: EPOCH + 17 * 60_000, isPublic: true, createdBy: 'bot', bots: 4 },
  { id: 'med-prep', name: 'Med prep', focusMin: 25, breakMin: 5, startedAt: EPOCH + 11 * 60_000, isPublic: true, createdBy: 'bot', bots: 9 },
];

const BOT_NAMES = ['Mina', 'Arjun', 'Sofia', 'Kenji', 'Lea', 'Omar', 'Priya', 'Noah', 'Hana', 'Tariq', 'Yuki', 'Zara'];
const FOCUS_LINES = [
  'cardio chapter again, wish me luck',
  'flashcards round 3',
  '40 more pages tonight',
  'this rain is perfect for studying',
  'pharm is brutal today',
  'anyone else doing anatomy?',
  'finally understood renal physiology',
  'one more pomodoro then sleep',
];
const BREAK_LINES = [
  'water break, brb',
  'stretching rn, my back says thanks',
  'how many sessions is everyone on?',
  'snack time',
  'good luck everyone',
  'back in 5',
  'that focus block went fast',
];

function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    h = Math.imul(h ^ 0x9e37, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

interface StoredRoom extends Room { bots: number }
const ROOMS_KEY = 'st.demo.rooms';
const BANS_KEY = 'st.demo.bans';

function allRooms(): StoredRoom[] {
  const mine = load<StoredRoom[]>(ROOMS_KEY, []).filter((r) => Date.now() - r.startedAt < 24 * 3600_000);
  return [...SEEDED, ...mine];
}

function botsFor(room: StoredRoom): PresenceMeta[] {
  const out: PresenceMeta[] = [];
  const now = Date.now();
  const t = timerAt(room, now);
  for (let i = 0; i < room.bots; i++) {
    const name = BOT_NAMES[Math.floor(hash(room.id, i, 'n') * BOT_NAMES.length + i) % BOT_NAMES.length];
    const awayBucket = Math.floor(now / (6 * 60_000));
    const awayChance = t.phase === 'break' ? 0.3 : 0.1;
    out.push({
      userId: `bot-${room.id}-${i}`,
      nickname: name,
      avatar: Math.floor(hash(room.id, i, 'a') * 10),
      away: hash(room.id, i, awayBucket) < awayChance,
      seat: -1,
      joinedAt: room.startedAt + i,
      isBot: true,
    });
  }
  return out;
}

type Wire =
  | { type: 'presence'; roomId: string; meta: PresenceMeta }
  | { type: 'leave'; roomId: string; userId: string }
  | { type: 'hello'; roomId: string }
  | { type: 'chat'; roomId: string; msg: ChatMessage }
  | { type: 'kick'; roomId: string; userId: string };

export function createDemoBackend(): Backend {
  let uid: string | null = null;
  try { uid = sessionStorage.getItem('st.demo.uid'); } catch { /* ignore */ }

  const createRoom: Backend['createRoom'] = async (opts) => {
    const id = `room-${Math.random().toString(36).slice(2, 8)}`;
    const rooms = load<StoredRoom[]>(ROOMS_KEY, []);
    rooms.push({ ...opts, id, startedAt: Date.now(), createdBy: uid ?? '', bots: 2 });
    save(ROOMS_KEY, rooms);
    return id;
  };

  return {
    mode: 'demo',
    needsCaptcha: false,
    async signIn() {
      if (!uid) {
        uid = `demo-${crypto.randomUUID().slice(0, 8)}`;
        try { sessionStorage.setItem('st.demo.uid', uid); } catch { /* ignore */ }
      }
      return uid;
    },
    userId: () => uid,
    async serverOffset() { return 0; },
    async listRooms(): Promise<RoomSummary[]> {
      return allRooms().filter((r) => r.isPublic).map((r) => ({ ...r, participants: Math.min(ROOM_CAP, r.bots) }));
    },
    async quickJoin() {
      const free = allRooms().find((r) => r.isPublic && r.bots < ROOM_CAP - 1);
      if (free) return free.id;
      return createRoom({ name: 'Study hall', focusMin: 25, breakMin: 5, isPublic: true });
    },
    createRoom,
    async joinRoom(roomId, meIn) {
      const room = allRooms().find((r) => r.id === roomId);
      if (!room || !uid) throw new BackendError('not_found', 'That room no longer exists.');
      const bans = load<Record<string, number>>(BANS_KEY, {});
      if ((bans[`${roomId}:${uid}`] ?? 0) > Date.now()) throw new BackendError('banned', 'You were removed from this room for a while.');
      return demoSession(room, { ...meIn, userId: uid, joinedAt: Date.now(), seat: meIn.seat });
    },
  };
}

function demoSession(room: StoredRoom, meStart: PresenceMeta): RoomSession {
  const me = { ...meStart };
  const ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('st-demo') : null;
  const peers = new Map<string, { meta: PresenceMeta; seen: number }>();
  const kickedBots = new Set<string>();
  const presenceCbs = new Set<(m: PresenceMeta[]) => void>();
  const chatCbs = new Set<(m: ChatMessage) => void>();
  const kickCbs = new Set<() => void>();
  const sent: number[] = [];
  const joinedBucket = Math.floor(Date.now() / 40_000);
  let lastBucket = joinedBucket;

  const members = (): PresenceMeta[] => {
    const bots = botsFor(room).filter((b) => !kickedBots.has(b.userId));
    return [...bots, ...[...peers.values()].map((p) => p.meta), me];
  };
  const emitPresence = () => { const m = members(); presenceCbs.forEach((cb) => cb(m)); };
  const post = (w: Wire) => ch?.postMessage(w);
  const announce = () => post({ type: 'presence', roomId: room.id, meta: me });

  if (ch) ch.onmessage = (e: MessageEvent<Wire>) => {
    const w = e.data;
    if (w.roomId !== room.id) return;
    if (w.type === 'hello') announce();
    else if (w.type === 'presence' && w.meta.userId !== me.userId) { peers.set(w.meta.userId, { meta: w.meta, seen: Date.now() }); emitPresence(); }
    else if (w.type === 'leave') { peers.delete(w.userId); emitPresence(); }
    else if (w.type === 'chat') chatCbs.forEach((cb) => cb(w.msg));
    else if (w.type === 'kick' && w.userId === me.userId) kickCbs.forEach((cb) => cb());
  };
  post({ type: 'hello', roomId: room.id });
  announce();

  // Heartbeat, stale-peer cleanup, bot status refresh and scripted bot chat.
  const tick = setInterval(() => {
    announce();
    const now = Date.now();
    for (const [id, p] of peers) if (now - p.seen > 15_000) peers.delete(id);
    emitPresence();
    const bucket = Math.floor(now / 40_000);
    while (lastBucket < bucket) {
      lastBucket++;
      const phase = timerAt(room, lastBucket * 40_000).phase;
      if (hash(room.id, lastBucket, 'c') < (phase === 'break' ? 0.55 : 0.18)) {
        const bots = botsFor(room).filter((b) => !b.away && !kickedBots.has(b.userId));
        if (!bots.length) continue;
        const bot = bots[Math.floor(hash(room.id, lastBucket, 'b') * bots.length)];
        const lines = phase === 'break' ? BREAK_LINES : FOCUS_LINES;
        const text = lines[Math.floor(hash(room.id, lastBucket, 'l') * lines.length)];
        const msg = { id: `bot-${room.id}-${lastBucket}`, userId: bot.userId, nickname: bot.nickname, text, at: lastBucket * 40_000 };
        chatCbs.forEach((cb) => cb(msg));
      }
    }
  }, 5000);

  const leaveNow = () => post({ type: 'leave', roomId: room.id, userId: me.userId });
  window.addEventListener('pagehide', leaveNow);

  return {
    room,
    isHost: room.createdBy === me.userId,
    onPresence(cb) { presenceCbs.add(cb); queueMicrotask(() => cb(members())); return () => presenceCbs.delete(cb); },
    onChat(cb) { chatCbs.add(cb); return () => chatCbs.delete(cb); },
    onKicked(cb) { kickCbs.add(cb); return () => kickCbs.delete(cb); },
    updateMe(patch) { Object.assign(me, patch); announce(); emitPresence(); },
    async sendChat(raw) {
      const text = raw.trim();
      if (!text) return;
      if (text.length > CHAT_MAX) throw new BackendError('too_long', `Keep it under ${CHAT_MAX} characters.`);
      const now = Date.now();
      while (sent.length && now - sent[0] > CHAT_RATE.windowMs) sent.shift();
      if (sent.length >= CHAT_RATE.count) throw new BackendError('rate_limited', 'Slow down a little.');
      sent.push(now);
      const msg: ChatMessage = { id: crypto.randomUUID(), userId: me.userId, nickname: me.nickname, text, at: now };
      chatCbs.forEach((cb) => cb(msg));
      post({ type: 'chat', roomId: room.id, msg });
    },
    async report(targetUserId, reason, messageText) {
      const reports = load<unknown[]>('st.demo.reports', []);
      reports.push({ room: room.id, targetUserId, reason, messageText, at: Date.now() });
      save('st.demo.reports', reports.slice(-50));
    },
    async kick(targetUserId) {
      if (room.createdBy !== me.userId) throw new BackendError('unknown', 'Only the room creator can remove people.');
      const bans = load<Record<string, number>>(BANS_KEY, {});
      bans[`${room.id}:${targetUserId}`] = Date.now() + KICK_MINUTES * 60_000;
      save(BANS_KEY, bans);
      if (targetUserId.startsWith('bot-')) kickedBots.add(targetUserId);
      else { post({ type: 'kick', roomId: room.id, userId: targetUserId }); peers.delete(targetUserId); }
      emitPresence();
    },
    async leave() {
      clearInterval(tick);
      leaveNow();
      window.removeEventListener('pagehide', leaveNow);
      ch?.close();
      presenceCbs.clear(); chatCbs.clear(); kickCbs.clear();
    },
  };
}
