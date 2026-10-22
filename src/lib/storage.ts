export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: ignore */
  }
}

export interface Profile {
  nickname: string;
  avatar: number;
}

export const PROFILE_KEY = 'st.profile';
export function loadProfile(): Profile | null {
  const p = load<Profile | null>(PROFILE_KEY, null);
  return p && typeof p.nickname === 'string' && p.nickname.trim() ? p : null;
}

export function cleanNickname(s: string): string {
  return s.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}
