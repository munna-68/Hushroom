// Dev-only Scene Lab (/scene-lab): mounts the real scene with controls for time,
// weather, quality, every slot state and animation, camera presets, speed and
// overlays, plus an FPS / draw-call readout. main.tsx loads it behind
// import.meta.env.DEV, so it never ships.
import { AVATARS } from '../lib/avatars';
import { MAX_SLOTS, createStudyScene, type Participant, type SlotStatus, type StudySceneHandle, type TierChoice } from '../scene';
import type { LabAction } from '../scene/agents';

const NAMES = ['Mina', 'Arjun', 'Sofia', 'Kenji', 'Lea', 'Omar', 'Priya', 'Noah'];

export function mountSceneLab(el: HTMLElement) {
  document.title = 'Scene Lab (dev)';
  document.body.style.cssText = 'margin:0;background:#0b1322;color:#e8e2d8;font:13px/1.4 Manrope,system-ui,sans-serif;overflow:hidden';
  el.innerHTML = '';
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;display:flex';
  el.appendChild(root);
  const stage = document.createElement('div');
  stage.style.cssText = 'flex:1;position:relative;display:grid;place-items:center;overflow:hidden;background:#05080f';
  const host = document.createElement('div');
  host.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden';
  stage.appendChild(host);
  const panel = document.createElement('div');
  panel.style.cssText = 'width:300px;flex:none;overflow:auto;padding:12px;background:#111a2c;border-left:1px solid #26334d;box-sizing:border-box';
  root.append(stage, panel);

  const params = new URLSearchParams(location.search);
  const scene: StudySceneHandle = createStudyScene(host, {
    timeOfDay: params.get('time') === 'night' ? 'night' : 'day',
    weather: params.get('weather') === 'rain' ? 'rain' : 'clear',
  });
  const people: Participant[] = Array.from({ length: MAX_SLOTS }, (_, i) => ({ slot: i, name: NAMES[i], status: 'focus' as SlotStatus, avatar: (i * 3 + 1) % AVATARS.length, id: `lab-${i}`, isMe: i === 2 }));
  const push = () => scene.setParticipants(people.map((p) => ({ ...p })));
  push();

  // ---- ui helpers ----
  const h = (t: string) => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'margin:14px 0 6px;font-weight:700;color:#9fb2d6;font-size:11px;letter-spacing:.06em;text-transform:uppercase'; panel.appendChild(d); };
  const row = () => { const d = document.createElement('div'); d.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px'; panel.appendChild(d); return d; };
  const btn = (r: HTMLElement, label: string, on: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'background:#1d2a44;color:inherit;border:1px solid #33456b;border-radius:6px;padding:4px 8px;cursor:pointer;font:inherit';
    b.onclick = on;
    r.appendChild(b);
    return b;
  };
  const readout = document.createElement('pre');
  readout.style.cssText = 'margin:0;padding:8px;background:#0b1322;border-radius:6px;font:11px/1.45 ui-monospace,monospace;white-space:pre-wrap';
  panel.appendChild(readout);

  h('Time and weather');
  let r = row();
  btn(r, 'Day', () => scene.setTimeOfDay('day'));
  btn(r, 'Night', () => scene.setTimeOfDay('night'));
  btn(r, 'Clear', () => scene.setWeather('clear'));
  btn(r, 'Rain', () => scene.setWeather('rain'));

  h('Quality');
  r = row();
  (['auto', 'high', 'medium', 'low'] as TierChoice[]).forEach((t) => btn(r, t, () => scene.setQuality(t)));

  h('Room');
  r = row();
  btn(r, 'Fill (all focus)', () => { people.forEach((p) => { p.status = 'focus'; }); push(); });
  btn(r, 'Empty', () => { people.forEach((p) => { p.status = 'empty'; }); push(); });
  btn(r, 'Reference moment', () => refMoment());

  h('Slot');
  let slot = 0;
  r = row();
  const slotBtns: HTMLButtonElement[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) slotBtns.push(btn(r, String(i + 1), () => { slot = i; mark(); }));
  const mark = () => slotBtns.forEach((b, i) => { b.style.background = i === slot ? '#3a5a8c' : '#1d2a44'; });
  mark();
  r = row();
  (['focus', 'break', 'away', 'empty'] as SlotStatus[]).forEach((s) => btn(r, s, () => { people[slot].status = s; push(); }));
  r = row();
  const act = (a: LabAction) => () => scene.debug.lab(slot, a);
  btn(r, 'stand (stretch)', act('stand'));
  btn(r, 'sit', act('sit'));
  btn(r, 'bookshelf', act('shelf'));
  btn(r, 'window', act('window'));
  btn(r, 'sofa', act('sofa'));
  btn(r, 'in-place stretch', act('stretch'));
  r = row();
  btn(r, 'join (door)', () => { if (people[slot].status !== 'empty') { people[slot].status = 'empty'; push(); } setTimeout(() => { people[slot].status = 'focus'; people[slot].id = `lab-${slot}-${Date.now()}`; push(); }, 50); });
  btn(r, 'leave (door)', () => { people[slot].status = 'empty'; push(); });
  btn(r, 'away', () => { people[slot].status = 'away'; push(); });
  r = row();
  (['leanBack', 'restHead', 'raiseBook', 'penTwirl', 'rubEyes', 'yawn', 'glance', 'stretchUp'] as LabAction[]).forEach((m) => btn(r, m, act(m)));
  r = row();
  btn(r, 'next avatar', () => { people[slot].avatar = ((people[slot].avatar ?? 0) + 1) % AVATARS.length; people[slot].id = `lab-${slot}-${people[slot].avatar}`; push(); });

  h('Camera');
  r = row();
  const size = (w: number | null, hh: number | null) => {
    host.style.width = w ? `${w}px` : '100%';
    host.style.height = hh ? `${hh}px` : '100%';
    host.style.aspectRatio = '';
  };
  btn(r, 'Reference 16:9', () => { host.style.width = '100%'; host.style.height = 'auto'; host.style.aspectRatio = '1672 / 941'; scene.resetView(); });
  btn(r, 'Portrait phone', () => { size(390, 844); scene.resetView(); });
  btn(r, 'Fill window', () => { size(null, null); scene.resetView(); });
  btn(r, 'Reset view', () => scene.resetView());

  h('Overlays');
  r = row();
  let g = false, l = false;
  btn(r, 'waypoint graph', () => { g = !g; scene.debug.overlay('graph', g); });
  btn(r, 'lamp states', () => { l = !l; scene.debug.overlay('lamps', l); });

  h('Speed');
  const sp = document.createElement('input');
  sp.type = 'range'; sp.min = '0'; sp.max = '4'; sp.step = '0.25'; sp.value = '1';
  sp.oninput = () => scene.debug.setSpeed(Number(sp.value));
  panel.appendChild(sp);

  h('Capture');
  r = row();
  const shot = async (name: string, w: number, hh: number) => {
    const url = scene.debug.capture(w, hh);
    await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url }).catch(() => {});
  };
  btn(r, 'Save 1672×941', () => void shot(`lab-${Date.now()}`, 1672, 941));
  btn(r, 'Save 390×844', () => void shot(`lab-portrait-${Date.now()}`, 390, 844));

  const tick = () => {
    const s = scene.debug.stats();
    const v = scene.debug.view();
    const ag = scene.debug.agents().map((x, i) => `${i + 1} ${x}`).join('\n');
    readout.textContent = `tier ${s.tier} (${s.choice})\n${s.fps.toFixed(0)} fps  p95 ${s.p95.toFixed(1)} ms\n${s.calls} draw calls  ${(s.triangles / 1000).toFixed(1)}k tris\n${s.geometries} geos  ${s.textures} textures\nyaw ${(v.yaw * 57.3).toFixed(0)}°  pitch ${(v.pitch * 57.3).toFixed(0)}°  zoom ${v.zoom.toFixed(2)}\n${ag}`;
  };
  setInterval(tick, 500);
  const closeup = async (name: string, eye: [number, number, number], target: [number, number, number], fov = 40, w = 900, hh = 600) => {
    const url = scene.debug.captureFrom(eye, target, fov, w, hh);
    await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url }).catch(() => {});
  };
  /** The reference moment: three people on breaks (shelf, window stool, sofa), the rest at the table. */
  const refMoment = () => {
    people.forEach((p) => { p.status = 'focus'; });
    push();
    scene.debug.step(0.5);
    scene.debug.lab(3, 'shelf'); scene.debug.lab(4, 'window'); scene.debug.lab(6, 'sofa');
    for (let k = 0; k < 40; k++) scene.debug.step(0.5);
  };
  /** Reference pair: day/clear and night/rain at the reference size in the reference moment. */
  const pair = async (name: string, w = 1672, hh = 941) => {
    refMoment();
    scene.setTimeOfDay('day'); scene.setWeather('clear');
    await shot(`${name}-day`, w, hh);
    scene.setTimeOfDay('night'); scene.setWeather('rain');
    await shot(`${name}-night`, w, hh);
  };
  (window as unknown as { __lab: unknown }).__lab = { scene, people, push, shot, pair, closeup, refMoment, setSlot: (i: number) => { slot = i; mark(); } };
}
