import { useEffect, useState } from 'react';
import { fmtClock } from '../lib/timer';
import { load, save } from '../lib/storage';
import { BreakAd } from './BreakAd';

const PROMPTS = [
  'Stand up and roll your shoulders back a few times.',
  'Refill your water and drink half of it.',
  'Look at something far away for twenty seconds.',
  'Stretch your arms overhead and take three slow breaths.',
  'Loosen your neck: ear to shoulder, both sides.',
];

export function BreakOverlay({ remaining, cycle, onClose }: { remaining: number; cycle: number; onClose: () => void }) {
  const [firstNotice, setFirstNotice] = useState(() => !load<boolean>('st.adsNoticeSeen', false));
  useEffect(() => { if (firstNotice) save('st.adsNoticeSeen', true); }, [firstNotice]);
  return (
    <div className="break-layer" role="dialog" aria-modal="false" aria-labelledby="break-h">
      <section className="break-card">
        <p className="eyebrow break">Break</p>
        <h2 id="break-h" className="break-clock">{fmtClock(remaining)}</h2>
        <p className="break-prompt">{PROMPTS[cycle % PROMPTS.length]}</p>
        <BreakAd slot="break-card" />
        {firstNotice && (
          <p className="ads-notice">
            Ads only appear on breaks, never while you focus. They keep Study Together free.
            <button className="link" onClick={() => setFirstNotice(false)}>Got it</button>
          </p>
        )}
        <button className="btn" onClick={onClose}>Back to the room</button>
      </section>
    </div>
  );
}

const AD_KEY = 'st.lastInterstitial';
const AD_GAP_MS = 35 * 60_000;
export function interstitialDue(): boolean { return Date.now() - load<number>(AD_KEY, 0) > AD_GAP_MS; }

export function Interstitial({ onDone }: { onDone: () => void }) {
  const [left, setLeft] = useState(5);
  useEffect(() => { save(AD_KEY, Date.now()); }, []);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <div className="interstitial" role="dialog" aria-modal="true" aria-label="Advertisement">
      <BreakAd slot="interstitial" />
      <button className="btn skip" disabled={left > 0} onClick={onDone} autoFocus>
        {left > 0 ? `Skip in ${left}` : 'Skip'}
      </button>
    </div>
  );
}
