import { useEffect, useRef, useState } from 'react';

/**
 * Provider-agnostic ad slot. Shown only during breaks.
 * PLACEHOLDER: to integrate a real network, render its tag inside `.ad-frame`
 * based on `slot` (e.g. AdSense <ins>, or a direct-sold creative). Keep the
 * fixed aspect ratio so layout doesn't shift.
 */
export function BreakAd({ slot }: { slot: 'break-card' | 'interstitial' }) {
  const bait = useRef<HTMLDivElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      const b = bait.current;
      if (b && (b.offsetHeight === 0 || getComputedStyle(b).display === 'none')) setBlocked(true);
    }, 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`break-ad slot-${slot}`}>
      <div ref={bait} className="adsbox ad-banner ad-placement" aria-hidden="true" style={{ height: 1, width: 1, position: 'absolute', opacity: 0 }} />
      <div className="ad-frame" data-slot={slot}>
        <span className="ad-tag">Ad</span>
        <span className="ad-placeholder">Ad slot placeholder · {slot === 'interstitial' ? 'full screen' : '300×250'}</span>
      </div>
      {blocked && <p className="ad-note">Looks like an ad blocker is on. No problem. Ads only show on breaks and help keep this free.</p>}
    </div>
  );
}
