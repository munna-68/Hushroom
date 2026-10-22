import type { Backend } from './types';

let backend: Promise<Backend> | null = null;

export const HAS_SUPABASE = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

/** Demo mode switches on automatically when Supabase env vars are missing. */
export function getBackend(): Promise<Backend> {
  if (!backend) {
    backend = HAS_SUPABASE
      ? import('./supabase').then((m) => m.createSupabaseBackend())
      : import('./demo').then((m) => m.createDemoBackend());
  }
  return backend;
}
