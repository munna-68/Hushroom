// Supabase backend: anonymous auth, SECURITY DEFINER RPCs for anything that
// must be enforced server-side (cap, bans, chat limits, kicks), and a private
// Realtime channel per room (Presence for who's here, Broadcast for chat).
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import {
  BackendError, KICK_MINUTES,
  type Backend, type ChatMessage, type PresenceMeta, type Room, type RoomSession, type RoomSummary,
} from './types';

interface RoomRow {
  id: string; name: string; is_public: boolean; focus_min: number; break_min: number;
  started_at: string; created_by: string; participants?: number;
}

const toRoom = (r: RoomRow): Room => ({
  id: r.id, name: r.name, isPublic: r.is_public, focusMin: r.focus_min, breakMin: r.break_min,
  startedAt: Date.parse(r.started_at), createdBy: r.created_by,
});

const ERRORS: Record<string, [BackendError['code'], string]> = {
  room_full: ['full', 'This room is full. Try quick join.'],
  banned: ['banned', 'You were removed from this room for a while.'],
  not_found: ['not_found', 'That room no longer exists.'],
  rate_limited: ['rate_limited', 'Slow down a little.'],
  too_long: ['too_long', 'That message is too long.'],
  not_member: ['not_found', 'You are no longer in this room.'],
  not_authenticated: ['auth', 'Please sign in again.'],
  too_many_rooms: ['rate_limited', 'You have created a lot of rooms recently. Try joining one.'],
};

function fail(e: { message?: string } | null): never {
  const msg = e?.message ?? '';
  const key = Object.keys(ERRORS).find((k) => msg.includes(k));
  if (key) throw new BackendError(ERRORS[key][0], ERRORS[key][1]);
  throw new BackendError('unknown', 'Something went wrong. Please try again.');
}

export async function createSupabaseBackend(): Promise<Backend> {
  const sb: SupabaseClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  const { data } = await sb.auth.getSession();
  let uid: string | null = data.session?.user.id ?? null;
  sb.auth.onAuthStateChange((_e, s) => {
    uid = s?.user.id ?? null;
    if (s) sb.realtime.setAuth(s.access_token);
  });
  let offset: Promise<number> | null = null;

  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args);
    if (error) fail(error);
    return data as T;
  }

  const backend: Backend = {
    mode: 'supabase',
    needsCaptcha: true,
    userId: () => uid,
    async signIn(captchaToken) {
      const { data, error } = await sb.auth.signInAnonymously({ options: captchaToken ? { captchaToken } : undefined });
      if (error || !data.user) throw new BackendError('auth', error?.message.includes('captcha') ? 'Verification failed. Please try again.' : 'Could not sign in. Please try again.');
      uid = data.user.id;
      return uid;
    },
    serverOffset() {
      offset ??= (async () => {
        const t0 = Date.now();
        const s = await rpc<string>('server_now');
        const t1 = Date.now();
        return Date.parse(s) - (t0 + t1) / 2;
      })().catch(() => 0);
      return offset;
    },
    async listRooms(): Promise<RoomSummary[]> {
      const rows = await rpc<RoomRow[]>('list_rooms');
      return rows.map((r) => ({ ...toRoom(r), participants: r.participants ?? 0 }));
    },
    quickJoin: () => rpc<string>('quick_join'),
    createRoom: (o) => rpc<string>('create_room', { p_name: o.name, p_focus: o.focusMin, p_break: o.breakMin, p_public: o.isPublic }),
    async joinRoom(roomId, meIn) {
      if (!uid) throw new BackendError('auth', 'Please sign in again.');
      const row = await rpc<RoomRow>('join_room', { p_room: roomId });
      const off = await backend.serverOffset();
      const { data: s } = await sb.auth.getSession();
      if (s.session) sb.realtime.setAuth(s.session.access_token);
      return session(sb, rpc, toRoom(row), { ...meIn, userId: uid, joinedAt: Date.now() + off });
    },
  };
  return backend;
}

function session(
  sb: SupabaseClient,
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<T>,
  room: Room,
  meStart: PresenceMeta,
): RoomSession {
  const me = { ...meStart };
  const presenceCbs = new Set<(m: PresenceMeta[]) => void>();
  const chatCbs = new Set<(m: ChatMessage) => void>();
  const kickCbs = new Set<() => void>();
  let members: PresenceMeta[] = [me];
  let subscribed = false;
  let trackTimer = 0;

  const ch: RealtimeChannel = sb.channel(`room:${room.id}`, { config: { private: true, presence: { key: me.userId } } });
  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState<PresenceMeta>();
    const list: PresenceMeta[] = [];
    for (const key of Object.keys(state)) {
      const m = state[key][0];
      if (m && typeof m.userId === 'string') list.push({ userId: m.userId, nickname: String(m.nickname).slice(0, 20), avatar: Number(m.avatar) || 0, away: !!m.away, seat: Number.isInteger(m.seat) ? m.seat : -1, joinedAt: Number(m.joinedAt) || 0 });
    }
    if (!list.some((m) => m.userId === me.userId)) list.push(me);
    members = list;
    presenceCbs.forEach((cb) => cb(members));
  });
  ch.on('broadcast', { event: 'chat' }, ({ payload }) => {
    const p = payload as ChatMessage;
    if (p && typeof p.text === 'string') chatCbs.forEach((cb) => cb({ id: String(p.id), userId: String(p.userId), nickname: String(p.nickname), text: p.text, at: Number(p.at) }));
  });
  ch.on('broadcast', { event: 'kick' }, ({ payload }) => {
    if ((payload as { userId?: string })?.userId === me.userId) kickCbs.forEach((cb) => cb());
  });
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') { subscribed = true; void ch.track(me); }
  });

  // Keep our membership row fresh so the server-side cap ignores stale seats.
  const heartbeat = window.setInterval(async () => {
    try {
      const ok = await rpc<boolean>('touch_member', { p_room: room.id });
      if (!ok) await rpc('join_room', { p_room: room.id });
    } catch {
      kickCbs.forEach((cb) => cb());
    }
  }, 60_000);
  const onHide = () => { void rpc('leave_room', { p_room: room.id }).catch(() => {}); };
  window.addEventListener('pagehide', onHide);

  return {
    room,
    isHost: room.createdBy === me.userId,
    onPresence(cb) { presenceCbs.add(cb); queueMicrotask(() => cb(members)); return () => presenceCbs.delete(cb); },
    onChat(cb) { chatCbs.add(cb); return () => chatCbs.delete(cb); },
    onKicked(cb) { kickCbs.add(cb); return () => kickCbs.delete(cb); },
    updateMe(patch) {
      Object.assign(me, patch);
      clearTimeout(trackTimer);
      trackTimer = window.setTimeout(() => { if (subscribed) void ch.track(me); }, 150);
    },
    async sendChat(text) {
      await rpc('send_message', { p_room: room.id, p_nickname: me.nickname, p_body: text.trim() });
    },
    async report(target, reason, messageText) {
      await rpc('report_user', { p_room: room.id, p_target: target, p_reason: reason, p_message: messageText ?? null });
    },
    async kick(target) {
      await rpc('kick_user', { p_room: room.id, p_target: target, p_minutes: KICK_MINUTES });
    },
    async leave() {
      clearInterval(heartbeat);
      clearTimeout(trackTimer);
      window.removeEventListener('pagehide', onHide);
      presenceCbs.clear(); chatCbs.clear(); kickCbs.clear();
      try { await ch.untrack(); } catch { /* ignore */ }
      await sb.removeChannel(ch);
      await rpc('leave_room', { p_room: room.id }).catch(() => {});
    },
  };
}
