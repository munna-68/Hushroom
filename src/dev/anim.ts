// Dev-only animation viewer (/dev/anim): the real room with every seat filled and a
// close-up camera per seat, plus buttons to trigger each act. Never in production.
import * as THREE from 'three';
import { AVATARS } from '../lib/avatars';
import { Character, CHAIR_ROOT_Y } from '../scene/character';
import { buildRoom } from '../scene/room';
import { createAtmo, blendAtmo } from '../scene/atmosphere';
import { stUniforms } from '../scene/envMaterial';
import { MAX_SLOTS } from '../scene/hall';

const ACTS = ['write', 'read', 'type', 'sip', 'think', 'neck', 'page', 'stretch', 'drink', 'phone', 'nap', 'gaze', 'recline', 'chat'];

export function mountAnim(el: HTMLElement) {
  document.title = 'Animation viewer (dev)';
  document.body.style.cssText = 'margin:0;background:#0b1322;color:#e8e2d8;font:13px/1.4 Manrope,system-ui,sans-serif;overflow:hidden';
  el.innerHTML = '';
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  el.appendChild(renderer.domElement);
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:4px';
  el.appendChild(bar);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1322');
  scene.add(new THREE.HemisphereLight('#6d82c4', '#2a1d26', 1.25));
  const fill = new THREE.DirectionalLight('#ffd9b0', 0.9);
  fill.position.set(5, 6, 6);
  scene.add(fill);
  // Plain studio light here: switch the room's window/lamp lighting off.
  stUniforms.stOn.value = 0;
  const atmo = blendAtmo(createAtmo(), 1, 0);
  const room = buildRoom();
  scene.add(room.group);
  const chars = room.seats.map((slot) => {
    const c = new Character(AVATARS[slot.slot % AVATARS.length], { seed: slot.slot * 31 + 5 });
    c.focusAct = slot.focusAct;
    c.attach({ tableMug: slot.mug, page: slot.page ?? undefined });
    c.root.position.y = CHAIR_ROOT_Y;
    slot.anchor.add(c.root);
    slot.kitTarget = slot.kitShown = 1;
    slot.chair.offset = 0;
    return c;
  });

  let clock = 0;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  let view = Number(new URLSearchParams(location.search).get('seat') ?? 1);
  const eye = new THREE.Vector3(), look = new THREE.Vector3();
  function aim() {
    if (view < 0) { cam.position.set(-1.6, 2.6, 6.4); cam.lookAt(-3.9, 0.5, 3.6); return; }
    const a = room.seats[view].anchor;
    eye.set(1.1, 1.75, 2.35); look.set(0, 0.75, 0.3);
    cam.position.copy(a.localToWorld(eye));
    cam.lookAt(a.localToWorld(look));
  }
  const btn = (label: string, on: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'background:#1d2a44;color:inherit;border:1px solid #33456b;border-radius:6px;padding:4px 8px;cursor:pointer';
    b.onclick = on;
    bar.appendChild(b);
    return b;
  };
  for (let i = -1; i < MAX_SLOTS; i++) btn(i < 0 ? 'sofa' : `seat ${i}`, () => { view = i; aim(); });
  for (const a of ACTS) btn(a, () => (view < 0 ? null : chars[view].play(a)));
  btn('all break', () => chars.forEach((c) => (c.status = 'break')));
  btn('all focus', () => chars.forEach((c) => (c.status = 'focusing')));
  let paused = false;
  const tick = (dt: number) => {
    clock += dt;
    room.update(clock, dt, atmo);
    for (const c of chars) c.update(clock, dt);
  };
  // Console hooks for frame-exact inspection: __anim.pause(); __anim.step(1.2)
  (window as unknown as { __anim: unknown }).__anim = {
    chars, room,
    setView: (i: number) => { view = i; aim(); renderer.render(scene, cam); },
    pause: (p = true) => { paused = p; },
    step: (sec: number) => { for (let k = 0; k < Math.round(sec * 60); k++) tick(1 / 60); renderer.render(scene, cam); },
  };

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    cam.aspect = innerWidth / innerHeight;
    cam.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();
  aim();
  let last = 0;
  renderer.setAnimationLoop((ts) => {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 1 / 60;
    last = ts;
    if (paused) return;
    tick(dt);
    renderer.render(scene, cam);
  });
}
