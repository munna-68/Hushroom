import type { TimerConfig } from '../lib/timer';

export interface Room extends TimerConfig {
  id: string;
  name: string;
  isPublic: boolean;
  createdBy: string;
}

export interface RoomSummary extends Room {
  participants: number;
}

/** What each client publishes about itself via presence. */
export interface PresenceMeta {
  userId: string;
  nickname: string;
  avatar: number;
  away: boolean;
  seat: number;
  joinedAt: number; // server-clock ms
  isBot?: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  at: number;
  system?: boolean;
}

export type Unsub = () => void;

export class BackendError extends Error {
  constructor(public code: 'full' | 'banned' | 'rate_limited' | 'too_long' | 'not_found' | 'auth' | 'unknown', message: string) {
    super(message);
  }
}

export interface RoomSession {
  room: Room;
  isHost: boolean;
  onPresence(cb: (members: PresenceMeta[]) => void): Unsub;
  onChat(cb: (msg: ChatMessage) => void): Unsub;
  onKicked(cb: () => void): Unsub;
  updateMe(patch: Partial<Pick<PresenceMeta, 'away' | 'seat' | 'nickname' | 'avatar'>>): void;
  sendChat(text: string): Promise<void>;
  report(targetUserId: string, reason: string, messageText?: string): Promise<void>;
  kick(targetUserId: string): Promise<void>;
  leave(): Promise<void>;
}

export interface Backend {
  mode: 'demo' | 'supabase';
  needsCaptcha: boolean;
  /** Anonymous sign-in; returns the stable anonymous user id. */
  signIn(captchaToken?: string): Promise<string>;
  userId(): string | null;
  /** serverNow - Date.now(), measured once. */
  serverOffset(): Promise<number>;
  listRooms(): Promise<RoomSummary[]>;
  quickJoin(): Promise<string>;
  createRoom(opts: { name: string; focusMin: number; breakMin: number; isPublic: boolean }): Promise<string>;
  joinRoom(roomId: string, me: Omit<PresenceMeta, 'userId' | 'joinedAt' | 'seat'> & { seat: number }): Promise<RoomSession>;
}

export const CHAT_MAX = 280;
export const CHAT_RATE = { count: 5, windowMs: 10_000 };
export const KICK_MINUTES = 30;
