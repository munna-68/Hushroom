import { useCallback, useEffect, useState } from 'react';
import { getBackend, HAS_SUPABASE } from '../data';
import type { RoomSummary } from '../data/types';
import { navigate } from '../lib/router';
import { fmtClock, PRESETS, timerAt } from '../lib/timer';
import { ROOM_CAP } from '../lib/seats';
import { useNow } from '../lib/useNow';
import type { Profile } from '../lib/storage';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useAvatarThumbs } from '../components/useAvatarThumbs';

export function Lobby({ profile }: { profile: Profile }) {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => { const f = sessionStorage.getItem('st.flash'); sessionStorage.removeItem('st.flash'); return f ?? ''; });
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<string>('25/5');
  const [listed, setListed] = useState(true);
  const now = useNow(1000) + offset;
  const thumbs = useAvatarThumbs();

  const refresh = useCallback(async () => {
    try {
      const b = await getBackend();
      setOffset(await b.serverOffset());
      setRooms(await b.listRooms());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load rooms.');
      setRooms([]);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function run(fn: () => Promise<string>) {
    setBusy(true); setError('');
    try { navigate(`/room/${await fn()}`); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); setBusy(false); }
  }

  const p = PRESETS.find((x) => x.id === preset)!;
  return (
    <main className="lobby">
      <header className="lobby-top">
        <div className="brand"><span className="brand-mark" aria-hidden="true" /><span>Study Together</span></div>
        <button className="chip" onClick={() => navigate('/')} aria-label="Change nickname or character">
          <Avatar id={profile.avatar} thumbs={thumbs} size={30} />
          <span>{profile.nickname}</span>
        </button>
      </header>

      <section className="quick">
        <div>
          <h1>Find a seat at the table.</h1>
          <p className="lede">Join the first room with a free cushion. Everyone shares one timer.</p>
        </div>
        <button className="btn primary big" disabled={busy} onClick={() => run(async () => (await getBackend()).quickJoin())}>
          Quick join
        </button>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="rooms" aria-labelledby="rooms-h">
        <div className="section-head">
          <h2 id="rooms-h">Open rooms</h2>
          <button className="icon-btn" onClick={() => { setRooms(null); void refresh(); }} aria-label="Refresh rooms"><Icon name="refresh" /></button>
        </div>
        {rooms === null && <p className="muted">Looking for rooms…</p>}
        {rooms?.length === 0 && <p className="muted">No open rooms right now. Quick join will start one.</p>}
        <ul className="room-list">
          {rooms?.map((r) => {
            const t = timerAt(r, now);
            const full = r.participants >= ROOM_CAP;
            return (
              <li key={r.id} className="room-row">
                <div className="room-main">
                  <span className="room-name">{r.name}</span>
                  <span className="room-meta">
                    <span className="tag">{r.focusMin}/{r.breakMin}</span>
                    <span className={`phase-dot ${t.phase}`} />
                    <span>{t.phase === 'focus' ? 'Focus' : 'Break'} · {fmtClock(t.remainingSec)} left</span>
                  </span>
                </div>
                <span className="seats" aria-label={`${r.participants} of ${ROOM_CAP} seats taken`}>
                  {r.participants}/{ROOM_CAP}
                </span>
                <button className="btn" disabled={busy || full} onClick={() => run(async () => r.id)}>{full ? 'Full' : 'Join'}</button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="create" aria-labelledby="create-h">
        <h2 id="create-h">Start your own room</h2>
        <form className="create-form" onSubmit={(e) => { e.preventDefault(); void run(async () => (await getBackend()).createRoom({ name: name.trim().slice(0, 40) || `${profile.nickname}'s table`, focusMin: p.focusMin, breakMin: p.breakMin, isPublic: listed })); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={`${profile.nickname}'s table`} aria-label="Room name" />
          <div className="seg" role="radiogroup" aria-label="Timer preset">
            {PRESETS.map((x) => (
              <button type="button" key={x.id} role="radio" aria-checked={preset === x.id} className={preset === x.id ? 'on' : ''} onClick={() => setPreset(x.id)}>{x.id}</button>
            ))}
          </div>
          <label className="check"><input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} /> Show in lobby</label>
          <button className="btn" disabled={busy}><Icon name="plus" size={18} /> Create</button>
        </form>
      </section>
      {!HAS_SUPABASE && <p className="demo-note">Demo mode: rooms and students are simulated in your browser.</p>}
    </main>
  );
}
