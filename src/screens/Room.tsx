import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBackend } from '../data';
import { BackendError, type ChatMessage, type PresenceMeta, type RoomSession } from '../data/types';
import { navigate } from '../lib/router';
import { assignSeats, ROOM_CAP } from '../lib/seats';
import { fmtClock, timerAt } from '../lib/timer';
import { useNow } from '../lib/useNow';
import type { Profile } from '../lib/storage';
import type { SeatOccupant } from '../scene';
import * as sound from '../audio/engine';
import { StudyScene } from '../components/StudyScene';
import { SidePanel, type Participant } from '../components/SidePanel';
import { BreakOverlay, Interstitial, interstitialDue } from '../components/BreakOverlay';
import { Icon } from '../components/Icon';
import { useAvatarThumbs } from '../components/useAvatarThumbs';

const AUTO_AWAY_MS = 2 * 60_000;
const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;

export function Room({ roomId, profile }: { roomId: string; profile: Profile; onProfile: (p: Profile) => void }) {
  const [session, setSession] = useState<RoomSession | null>(null);
  const [error, setError] = useState('');
  const [members, setMembers] = useState<PresenceMeta[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [offset, setOffset] = useState(0);
  const [panel, setPanel] = useState(() => matchMedia('(min-width: 1024px)').matches);
  const [uiHidden, setUiHidden] = useState(false);
  const [manualAway, setManualAway] = useState(false);
  const [autoAway, setAutoAway] = useState(false);
  const [breakDismissed, setBreakDismissed] = useState(-1);
  const [ad, setAd] = useState(false);
  const [volOpen, setVolOpen] = useState(false);
  const [, force] = useState(0);
  const [hasMusic, setHasMusic] = useState(false);
  const [fs, setFs] = useState(false);
  const meId = useRef('');
  const thumbs = useAvatarThumbs();
  const now = useNow(250) + offset;

  // Join / leave. Realtime connections live only while this screen is mounted.
  useEffect(() => {
    let alive = true;
    let s: RoomSession | null = null;
    const unsubs: (() => void)[] = [];
    (async () => {
      try {
        const b = await getBackend();
        const off = await b.serverOffset();
        if (!alive) return;
        setOffset(off);
        s = await b.joinRoom(roomId, { nickname: profile.nickname, avatar: profile.avatar, away: false, seat: -1 });
        if (!alive) { void s.leave(); return; }
        meId.current = b.userId() ?? '';
        let first = true;
        let prev = new Map<string, string>();
        unsubs.push(s.onPresence((m) => {
          setMembers(m);
          const cur = new Map(m.map((x) => [x.userId, x.nickname]));
          if (!first) {
            const sys: ChatMessage[] = [];
            cur.forEach((n, id) => { if (!prev.has(id)) sys.push({ id: `j-${id}-${Date.now()}`, userId: id, nickname: n, text: `${n} sat down`, at: Date.now(), system: true }); });
            prev.forEach((n, id) => { if (!cur.has(id)) sys.push({ id: `l-${id}-${Date.now()}`, userId: id, nickname: n, text: `${n} left`, at: Date.now(), system: true }); });
            if (sys.length) setMessages((x) => [...x, ...sys].slice(-150));
          }
          first = false;
          prev = cur;
        }));
        unsubs.push(s.onChat((msg) => setMessages((x) => (x.some((y) => y.id === msg.id) ? x : [...x, msg].slice(-150)))));
        unsubs.push(s.onKicked(() => { sessionStorage.setItem('st.flash', 'You were removed from that room for a while.'); navigate('/lobby', true); }));
        setSession(s);
      } catch (e) {
        if (alive) setError(e instanceof BackendError || e instanceof Error ? e.message : 'Could not join this room.');
      }
    })();
    return () => { alive = false; unsubs.forEach((u) => u()); void s?.leave(); };
  }, [roomId, profile.nickname, profile.avatar]);

  // Sound: restore saved prefs (context resumes on the first gesture if needed).
  useEffect(() => {
    void sound.loadManifest().then((t) => setHasMusic(t.length > 0));
    const off = sound.onPrefs(() => force((n) => n + 1));
    if (sound.prefs.rain || sound.prefs.room || sound.prefs.music) sound.unlock();
    const g = () => sound.unlock();
    window.addEventListener('pointerdown', g, { once: true });
    window.addEventListener('keydown', g, { once: true });
    return () => { off(); window.removeEventListener('pointerdown', g); window.removeEventListener('keydown', g); sound.stopAll(); };
  }, []);

  // Auto-away after the tab has been hidden for a while.
  useEffect(() => {
    let t = 0;
    const on = () => {
      clearTimeout(t);
      if (document.hidden) t = window.setTimeout(() => setAutoAway(true), AUTO_AWAY_MS);
      else setAutoAway(false);
    };
    document.addEventListener('visibilitychange', on);
    return () => { document.removeEventListener('visibilitychange', on); clearTimeout(t); };
  }, []);
  const away = manualAway || autoAway;
  useEffect(() => { session?.updateMe({ away }); }, [session, away]);

  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const room = session?.room;
  const timer = room ? timerAt(room, now) : null;
  const phase = timer?.phase ?? 'focus';

  // Phase transitions: chime, interstitial at break start (never during focus).
  const lastPhase = useRef<string | null>(null);
  useEffect(() => {
    if (!timer) return;
    const prev = lastPhase.current;
    lastPhase.current = timer.phase;
    if (prev && prev !== timer.phase) {
      sound.chime();
      if (timer.phase === 'break' && interstitialDue()) setAd(true);
      if (timer.phase === 'focus') setAd(false);
    }
  }, [timer?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seats: deterministic from presence; adopt our assigned seat as our claim.
  const seatMap = useMemo(() => assignSeats(members.map((m) => ({ userId: m.userId, joinedAt: m.joinedAt, seat: m.seat }))), [members]);
  useEffect(() => {
    const mine = seatMap.get(meId.current);
    const me = members.find((m) => m.userId === meId.current);
    if (session && mine !== undefined && me && me.seat !== mine) session.updateMe({ seat: mine });
  }, [seatMap, members, session]);

  const people: Participant[] = useMemo(
    () => members.map((m) => ({ ...m, status: m.away ? 'away' : phase === 'focus' ? 'focusing' : 'break' })),
    [members, phase],
  );
  const seats = useMemo(() => {
    const arr: (SeatOccupant | null)[] = new Array(ROOM_CAP).fill(null);
    for (const p of people) {
      const s = seatMap.get(p.userId);
      if (s !== undefined) arr[s] = { userId: p.userId, nickname: p.nickname, avatar: p.avatar, status: p.status, isMe: p.userId === meId.current };
    }
    return arr;
  }, [people, seatMap]);

  const send = useCallback(async (t: string) => { await session?.sendChat(t); }, [session]);

  // Keyboard shortcuts: H toggles UI, Escape restores it.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'h' || e.key === 'H') setUiHidden((v) => !v);
      if (e.key === 'Escape') setUiHidden(false);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  if (error) {
    return (
      <main className="room-error">
        <h1>Can't join this room</h1>
        <p className="lede">{error}</p>
        <button className="btn primary" onClick={() => navigate('/lobby')}>Back to the lobby</button>
      </main>
    );
  }

  const showBreak = phase === 'break' && timer && breakDismissed !== timer.cycle && !uiHidden && !ad;
  const pr = sound.prefs;
  return (
    <main className={`room phase-${phase}${panel ? ' panel-open' : ''}${uiHidden ? ' ui-hidden' : ''}`}>
      <div className="scene-wrap"><StudyScene seats={seats} labels={!uiHidden} /></div>
      {!session && <div className="joining" role="status">Finding your cushion…</div>}

      <header className="room-top ui">
        <button className="pill-btn" onClick={() => navigate('/lobby')} aria-label="Leave room">
          <Icon name="back" size={18} /><span className="room-title">{room?.name ?? 'Room'}</span>
        </button>
        {timer && (
          <div className={`timer-pill ${phase}`} role="timer" aria-live="off" aria-label={`${fmtClock(timer.remainingSec)} left in ${phase}`}>
            <span className="t-clock">{fmtClock(timer.remainingSec)}</span>
            <span className="t-sep">·</span>
            <span className="t-phase">{phase}</span>
            <span className="t-bar" style={{ transform: `scaleX(${1 - timer.remainingSec / timer.phaseLengthSec})` }} />
          </div>
        )}
        <span className="top-spacer" />
      </header>

      <nav className="controls ui" aria-label="Room controls">
        <button className={`ctl${pr.rain ? ' on' : ''}`} aria-pressed={pr.rain} onClick={() => sound.setPref('rain', !pr.rain)} title="Rain"><Icon name="rain" /><span className="sr">Rain</span></button>
        <button className={`ctl${pr.room ? ' on' : ''}`} aria-pressed={pr.room} onClick={() => sound.setPref('room', !pr.room)} title="Room ambience"><Icon name="room" /><span className="sr">Room ambience</span></button>
        {hasMusic && <button className={`ctl${pr.music ? ' on' : ''}`} aria-pressed={pr.music} onClick={() => sound.setPref('music', !pr.music)} title="Music"><Icon name="music" /><span className="sr">Music</span></button>}
        <span className="ctl-wrap">
          <button className="ctl" aria-expanded={volOpen} onClick={() => setVolOpen((v) => !v)} title="Volume"><Icon name="volume" /><span className="sr">Volume</span></button>
          {volOpen && (
            <span className="vol-pop">
              <input type="range" min={0} max={1} step={0.05} value={pr.volume} onChange={(e) => sound.setPref('volume', Number(e.target.value))} aria-label="Volume" />
            </span>
          )}
        </span>
        <span className="ctl-div" aria-hidden="true" />
        <button className={`ctl${away ? ' on' : ''}`} aria-pressed={away} onClick={() => { setManualAway(!away); setAutoAway(false); }} title="Away"><Icon name="away" /><span className="sr">Away</span></button>
        {canFullscreen && (
          <button className="ctl desk" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})} title="Fullscreen">
            <Icon name={fs ? 'shrink' : 'expand'} /><span className="sr">Fullscreen</span>
          </button>
        )}
        <button className="ctl" onClick={() => setUiHidden(true)} title="Hide interface (H)"><Icon name="eyeOff" /><span className="sr">Hide interface</span></button>
        <button className={`ctl people-btn${panel ? ' on' : ''}`} aria-pressed={panel} onClick={() => setPanel((v) => !v)} title="People and chat">
          <Icon name="people" /><span className="count">{members.length}</span><span className="sr">People and chat</span>
        </button>
      </nav>

      {session && (
        <SidePanel
          open={panel && !uiHidden}
          onClose={() => setPanel(false)}
          people={people}
          meId={meId.current}
          isHost={session.isHost}
          away={away}
          onAway={(v) => { setManualAway(v); setAutoAway(false); }}
          messages={messages}
          onSend={send}
          onReport={(u, r, t) => session.report(u, r, t)}
          onKick={(u) => session.kick(u)}
          thumbs={thumbs}
        />
      )}

      {showBreak && <BreakOverlay remaining={timer.remainingSec} cycle={timer.cycle} onClose={() => setBreakDismissed(timer.cycle)} />}
      {ad && phase === 'break' && <Interstitial onDone={() => setAd(false)} />}

      {uiHidden && (
        <button className="restore-ui" onClick={() => setUiHidden(false)} aria-label="Show interface">
          <Icon name="eye" size={18} />
        </button>
      )}
    </main>
  );
}
