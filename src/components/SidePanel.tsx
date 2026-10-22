import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, PresenceMeta } from '../data/types';
import { CHAT_MAX, KICK_MINUTES } from '../data/types';
import type { Status } from '../scene';
import { ROOM_CAP } from '../lib/seats';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

export interface Participant extends PresenceMeta { status: Status }

const STATUS_LABEL: Record<Status, string> = { focusing: 'Focusing', break: 'On break', away: 'Away' };
const REASONS = ['Spam', 'Harassment or hate', 'Inappropriate name', 'Something else'];

interface Props {
  open: boolean;
  onClose: () => void;
  people: Participant[];
  meId: string;
  isHost: boolean;
  away: boolean;
  onAway: (v: boolean) => void;
  messages: ChatMessage[];
  onSend: (t: string) => Promise<void>;
  onReport: (userId: string, reason: string, text?: string) => Promise<void>;
  onKick: (userId: string) => Promise<void>;
  thumbs: string[] | null;
}

export function SidePanel(p: Props) {
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [report, setReport] = useState<{ userId: string; name: string; text?: string } | null>(null);
  const [toast, setToast] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const s = scroller.current;
    if (s && stick.current) s.scrollTop = s.scrollHeight;
  }, [p.messages, p.open]);
  useEffect(() => { if (p.open) closeBtn.current?.focus({ preventScroll: true }); }, [p.open]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    try { await p.onSend(t); setText(''); setErr(''); stick.current = true; } catch (x) { setErr(x instanceof Error ? x.message : 'Message not sent.'); }
  }

  const sorted = [...p.people].sort((a, b) => (a.userId === p.meId ? -1 : b.userId === p.meId ? 1 : a.joinedAt - b.joinedAt));
  return (
    <aside className={`panel${p.open ? ' open' : ''}`} aria-label="People and chat" aria-hidden={!p.open} {...(p.open ? {} : ({ inert: '' } as object))} onKeyDown={(e) => e.key === 'Escape' && (menu ? setMenu(null) : p.onClose())}>
      <div className="panel-grip" aria-hidden="true" />
      <div className="panel-head">
        <h2>Here now <span className="muted">{p.people.length}/{ROOM_CAP}</span></h2>
        <button ref={closeBtn} className="icon-btn" onClick={p.onClose} aria-label="Close panel"><Icon name="close" /></button>
      </div>
      <div
        className="panel-scroll"
        ref={scroller}
        onScroll={(e) => { const s = e.currentTarget; stick.current = s.scrollHeight - s.scrollTop - s.clientHeight < 40; }}
      >
        <label className="away-toggle">
          <input type="checkbox" checked={p.away} onChange={(e) => p.onAway(e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          <span>I'm away <span className="muted">· your seat stays saved</span></span>
        </label>
        <ul className="people">
          {sorted.map((m) => (
            <li key={m.userId} className="person">
              <Avatar id={m.avatar} thumbs={p.thumbs} size={34} />
              <span className="person-name">{m.nickname}{m.userId === p.meId && <span className="you">you</span>}</span>
              <span className={`status ${m.status}`}><span className="dot" />{STATUS_LABEL[m.status]}</span>
              {m.userId !== p.meId && (
                <span className="menu-wrap">
                  <button className="icon-btn sm" aria-label={`Options for ${m.nickname}`} aria-expanded={menu === m.userId} onClick={() => setMenu(menu === m.userId ? null : m.userId)}><Icon name="more" /></button>
                  {menu === m.userId && (
                    <span className="menu" role="menu">
                      <button role="menuitem" onClick={() => { setMenu(null); setReport({ userId: m.userId, name: m.nickname }); }}>Report</button>
                      {p.isHost && <button role="menuitem" onClick={async () => { setMenu(null); try { await p.onKick(m.userId); setToast(`${m.nickname} removed for ${KICK_MINUTES} minutes.`); } catch (x) { setToast(x instanceof Error ? x.message : 'Could not remove.'); } }}>Remove for {KICK_MINUTES} min</button>}
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
        <h3 className="chat-h">Chat</h3>
        <ol className="chat" aria-live="polite">
          {p.messages.length === 0 && <li className="muted chat-empty">Say hi, or just study. Both are fine.</li>}
          {p.messages.map((m) => m.system ? (
            <li key={m.id} className="msg system">{m.text}</li>
          ) : (
            <li key={m.id} className={`msg${m.userId === p.meId ? ' mine' : ''}`}>
              <span className="msg-name">{m.nickname}</span>
              <span className="msg-text">{m.text}</span>
              {m.userId !== p.meId && (
                <button className="msg-report" aria-label={`Report message from ${m.nickname}`} onClick={() => setReport({ userId: m.userId, name: m.nickname, text: m.text })}>Report</button>
              )}
            </li>
          ))}
        </ol>
      </div>
      <form className="composer" onSubmit={send}>
        <input value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} maxLength={CHAT_MAX} placeholder="Message the room" aria-label="Chat message" enterKeyHint="send" />
        <button className="icon-btn send" disabled={!text.trim()} aria-label="Send"><Icon name="send" /></button>
        {(err || text.length > CHAT_MAX - 40) && <span className={`composer-note${err ? ' err' : ''}`}>{err || `${CHAT_MAX - text.length} left`}</span>}
      </form>
      {toast && <div className="toast" role="status">{toast}</div>}
      {report && (
        <div className="dialog-back" onClick={() => setReport(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="rep-h" onClick={(e) => e.stopPropagation()}>
            <h3 id="rep-h">Report {report.name}</h3>
            {report.text && <blockquote>{report.text}</blockquote>}
            <div className="reasons">
              {REASONS.map((r) => (
                <button key={r} className="btn" onClick={async () => {
                  const rep = report; setReport(null);
                  try { await p.onReport(rep.userId, r, rep.text); setToast('Thanks. The report was saved for review.'); } catch { setToast('Could not send the report.'); }
                }}>{r}</button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setReport(null)}>Cancel</button>
          </div>
        </div>
      )}
    </aside>
  );
}
