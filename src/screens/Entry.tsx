import { useEffect, useState, type FormEvent } from 'react';
import { AVATARS } from '../lib/avatars';
import { PROFILE_KEY, cleanNickname, save, type Profile } from '../lib/storage';
import { getBackend, HAS_SUPABASE } from '../data';
import { Turnstile } from '../components/Turnstile';
import { useAvatarThumbs } from '../components/useAvatarThumbs';
import { Avatar } from '../components/Avatar';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

export function Entry({ initial, onDone }: { initial: Profile | null; onDone: (p: Profile) => void }) {
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [av, setAv] = useState(initial?.avatar ?? Math.floor(Math.random() * AVATARS.length));
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hasSession, setHasSession] = useState(false);
  const thumbs = useAvatarThumbs();
  const needCaptcha = HAS_SUPABASE && !!SITE_KEY && !hasSession;

  useEffect(() => {
    getBackend().then((b) => setHasSession(!!b.userId())).catch(() => {});
  }, []);

  const name = cleanNickname(nickname);
  const canGo = name.length >= 2 && !busy && (!needCaptcha || !!token);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canGo) return;
    setBusy(true); setError('');
    try {
      const b = await getBackend();
      if (!b.userId()) await b.signIn(token ?? undefined);
      const p = { nickname: name, avatar: av };
      save(PROFILE_KEY, p);
      onDone(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in. Try again.');
      setToken(null);
      setBusy(false);
    }
  }

  return (
    <main className="entry">
      <div className="entry-glow" aria-hidden="true" />
      <section className="entry-card">
        <header className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Study Together</span>
        </header>
        <h1>Study with strangers on a rainy night.</h1>
        <p className="lede">Shared Pomodoro rooms for up to 10 people. Free, no signup.</p>
        <form onSubmit={submit} className="entry-form">
          <label className="field">
            <span>Nickname</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={20}
              placeholder="What should we call you?"
              autoComplete="nickname"
              autoFocus={!initial}
              required
            />
          </label>
          <fieldset className="avatar-pick">
            <legend>Pick your character</legend>
            <div className="avatar-grid">
              {AVATARS.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  className={`avatar-opt${v.id === av ? ' on' : ''}`}
                  aria-pressed={v.id === av}
                  aria-label={v.label}
                  onClick={() => setAv(v.id)}
                >
                  <Avatar id={v.id} thumbs={thumbs} size={56} />
                </button>
              ))}
            </div>
          </fieldset>
          {needCaptcha && <Turnstile siteKey={SITE_KEY!} onToken={setToken} />}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary big" disabled={!canGo}>
            {busy ? 'Opening the door…' : 'Find a table'}
          </button>
        </form>
        {!HAS_SUPABASE && <p className="demo-note">Demo mode: no backend connected. The other students are friendly bots.</p>}
      </section>
    </main>
  );
}
