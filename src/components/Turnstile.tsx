import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render(el: HTMLElement, opts: Record<string, unknown>): string;
      reset(id?: string): void;
      remove(id?: string): void;
    };
  }
}

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptP: Promise<void> | null = null;
function loadScript(): Promise<void> {
  scriptP ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => res(); s.onerror = () => rej(new Error('turnstile'));
    document.head.appendChild(s);
  });
  return scriptP;
}

export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string | null) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    let id: string | undefined;
    let alive = true;
    loadScript().then(() => {
      if (!alive || !el.current || !window.turnstile) return;
      id = window.turnstile.render(el.current, {
        sitekey: siteKey, theme: 'dark', size: 'flexible', appearance: 'interaction-only',
        callback: (t: string) => cb.current(t),
        'expired-callback': () => cb.current(null),
        'error-callback': () => cb.current(null),
      });
    }).catch(() => cb.current(null));
    return () => { alive = false; if (id) window.turnstile?.remove(id); };
  }, [siteKey]);
  return <div className="turnstile" ref={el} />;
}
