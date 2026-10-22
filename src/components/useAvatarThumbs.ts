import { useEffect, useState } from 'react';

export function useAvatarThumbs(): string[] | null {
  const [thumbs, setThumbs] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    const run = () => import('../scene').then((m) => m.renderAvatarThumbs()).then((t) => alive && setThumbs(t)).catch(() => {});
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(run); else setTimeout(run, 50);
    return () => { alive = false; };
  }, []);
  return thumbs;
}
