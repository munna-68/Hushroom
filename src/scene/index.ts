// Imperative scene entry point. Mounted by components/StudyScene.tsx and
// code-split so the entry screen never waits on three.js.
import * as THREE from 'three';
import { AVATARS, avatar } from '../lib/avatars';
import { Character, CHAIR_ROOT_Y, disposeCharacterCache, type Status } from './character';
import { buildRoom, type SeatSlot } from './room';
import { glowPoints } from './ambient';
import { materials } from './toon';

export type { Status } from './character';

export interface SeatOccupant {
  userId: string;
  nickname: string;
  avatar: number;
  status: Status;
  isMe: boolean;
}

export interface StudySceneHandle {
  setSeats(seats: (SeatOccupant | null)[]): void;
  setLabelsVisible(v: boolean): void;
  dispose(): void;
}

type Tier = 'high' | 'medium' | 'low';
const TIERS: Tier[] = ['high', 'medium', 'low'];
const TIER_CFG: Record<Tier, { dpr: number; shadows: boolean; motes: boolean; fps: number }> = {
  high: { dpr: 2, shadows: true, motes: true, fps: 60 },
  medium: { dpr: 1.5, shadows: false, motes: true, fps: 60 },
  low: { dpr: 1, shadows: false, motes: false, fps: 30 },
};

function detectTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory ?? 4;
  const q = new URLSearchParams(location.search).get('quality');
  if (q === 'high' || q === 'medium' || q === 'low') return q;
  if (!coarse && cores >= 8) return 'high';
  if (!coarse) return 'medium';
  if (cores >= 8 && mem >= 6) return 'medium';
  return 'low';
}

export function createStudyScene(container: HTMLElement): StudySceneHandle {
  let tier = detectTier();
  const renderer = new THREE.WebGLRenderer({ antialias: tier !== 'low', powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'scene-canvas';
  container.appendChild(renderer.domElement);
  const labelLayer = document.createElement('div');
  labelLayer.className = 'scene-labels';
  container.appendChild(labelLayer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0b1322');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 60);

  scene.add(new THREE.HemisphereLight('#6d82c4', '#2a1d26', 1.25));
  const moon = new THREE.DirectionalLight('#9cb8ff', 1.1);
  moon.position.set(-2.5, 7, -7);
  moon.target.position.set(0, 0, 0);
  moon.shadow.mapSize.set(1024, 1024);
  Object.assign(moon.shadow.camera, { left: -6.5, right: 6.5, top: 6, bottom: -4, near: 1, far: 22 });
  moon.shadow.bias = -0.0008;
  moon.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight('#ffd9b0', 0.7);
  fill.position.set(5, 6, 6);
  scene.add(moon, moon.target, fill);

  if (import.meta.env.DEV) (window as unknown as { __st: unknown }).__st = { renderer, get tier() { return tier; } };
  const room = buildRoom();
  scene.add(room.group);

  // Ambient particles.
  const motePos = new Float32Array(70 * 3);
  for (let i = 0; i < 70; i++) motePos.set([(Math.random() - 0.5) * 9, 0.7 + Math.random() * 3, -4 + Math.random() * 5.5], i * 3);
  const motes = glowPoints(motePos, 1, '#ffd9a0', 0.12, 0.35);
  const steamPos = new Float32Array(30 * 3);
  const steam = glowPoints(steamPos, 2, '#fff4e6', 0.32, 0.18);
  const fairyPos: number[] = [];
  for (let k = 0; k < 26; k++) { const a = (k / 25) * Math.PI; fairyPos.push(Math.cos(a) * 1.82, 0.83 + 2.15 + Math.sin(a) * 1.82, -4.36); }
  for (let k = 0; k < 7; k++) [-1, 1].forEach((sd) => fairyPos.push(sd * 1.82, 0.83 + 2.15 - k * 0.3, -4.36));
  const fairy = glowPoints(new Float32Array(fairyPos), 0, '#ffc46b', 0.6, 0.9);
  scene.add(motes, steam, fairy);
  const pointMats = [motes, steam, fairy].map((p) => p.material as THREE.ShaderMaterial);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const labels: HTMLDivElement[] = room.seats.map(() => {
    const d = document.createElement('div');
    d.className = 'seat-label';
    d.hidden = true;
    labelLayer.appendChild(d);
    return d;
  });
  let labelsVisible = true;

  // ---- quality ---------------------------------------------------------
  let width = 1, height = 1;
  function applyTier() {
    const cfg = TIER_CFG[tier];
    const dpr = Math.min(window.devicePixelRatio || 1, cfg.dpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    if (renderer.shadowMap.enabled !== cfg.shadows) {
      renderer.shadowMap.enabled = cfg.shadows;
      moon.castShadow = cfg.shadows;
      materials().toon.needsUpdate = true;
    }
    motes.visible = cfg.motes;
    for (const m of pointMats) m.uniforms.uPx.value = dpr * height * 0.9;
  }

  // ---- camera ----------------------------------------------------------
  const target = new THREE.Vector3();
  const base = { theta: 0.5, phi: 0.5, dist: 14, fov: 30 };
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const drag = { theta: 0, phi: 0, active: false, lastX: 0, lastY: 0, releasedAt: 0 };
  function frame() {
    const a = width / height;
    const t = THREE.MathUtils.clamp((a - 0.5) / 1.0, 0, 1);
    const lerp = THREE.MathUtils.lerp;
    base.theta = lerp(0.78, 0.42, t);
    base.phi = lerp(0.52, 0.42, t);
    base.fov = lerp(40, 30, t);
    target.set(lerp(-0.15, 0, t), lerp(0.7, 0.75, t), lerp(-0.2, -0.35, t));
    const vf = THREE.MathUtils.degToRad(base.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * a);
    const rw = lerp(2.05, 4.1, t), rh = 2.3;
    base.dist = Math.max(rw / Math.tan(hf), rh / Math.tan(vf));
    camera.fov = base.fov;
    camera.aspect = a;
    camera.updateProjectionMatrix();
  }
  function placeCamera(now: number) {
    const still = reduced.matches;
    par.x += (par.tx - par.x) * 0.05;
    par.y += (par.ty - par.y) * 0.05;
    if (!drag.active && now - drag.releasedAt > 4) { drag.theta *= 0.985; drag.phi *= 0.985; }
    const th = base.theta + drag.theta + (still ? 0 : 0.035 * Math.sin(now * 0.07) + par.x * 0.06);
    const ph = base.phi + drag.phi + (still ? 0 : 0.018 * Math.sin(now * 0.05 + 1) + par.y * 0.03);
    const d = base.dist;
    camera.position.set(target.x + d * Math.cos(ph) * Math.sin(th), target.y + d * Math.sin(ph), target.z + d * Math.cos(ph) * Math.cos(th));
    camera.lookAt(target);
  }

  const canvas = renderer.domElement;
  const onDown = (e: PointerEvent) => { drag.active = true; drag.lastX = e.clientX; drag.lastY = e.clientY; canvas.setPointerCapture(e.pointerId); };
  const onMove = (e: PointerEvent) => {
    if (drag.active) {
      drag.theta = THREE.MathUtils.clamp(drag.theta - (e.clientX - drag.lastX) * 0.004, -0.45, 0.45);
      drag.phi = THREE.MathUtils.clamp(drag.phi + (e.clientY - drag.lastY) * 0.003, -0.15, 0.22);
      drag.lastX = e.clientX; drag.lastY = e.clientY;
    } else if (e.pointerType === 'mouse') {
      par.tx = (e.clientX / width - 0.5) * 2;
      par.ty = (e.clientY / height - 0.5) * 2;
    }
  };
  const onUp = () => { drag.active = false; drag.releasedAt = clock; };
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    par.tx = THREE.MathUtils.clamp(e.gamma / 25, -1, 1);
    par.ty = THREE.MathUtils.clamp((e.beta - 45) / 30, -1, 1);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  window.addEventListener('deviceorientation', onTilt);

  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    applyTier();
    frame();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---- seats -----------------------------------------------------------
  const occ: (SeatOccupant | null)[] = new Array(10).fill(null);
  function setSeat(slot: SeatSlot, o: SeatOccupant | null) {
    const prev = occ[slot.index];
    if (!o || !prev || prev.avatar !== o.avatar || prev.userId !== o.userId) {
      if (slot.character) { slot.anchor.remove(slot.character.root); slot.character.dispose(); slot.character = null; }
      if (o) {
        const c = new Character(avatar(o.avatar), { seed: slot.index * 31 + o.avatar });
        c.focusAct = slot.focusAct;
        c.hooks = { tableMug: slot.tableMug, page: slot.page ?? undefined };
        c.setHandMug(slot.handMug);
        c.root.position.y = CHAIR_ROOT_Y;
        slot.anchor.add(c.root);
        slot.character = c;
      }
    }
    occ[slot.index] = o;
    slot.props.visible = !!o;
    slot.emptyGlow.visible = !o;
    slot.meRing.visible = !!o?.isMe;
    if (slot.character && o) {
      slot.character.status = o.status;
      slot.character.root.visible = o.status !== 'away';
      if (o.status === 'away') slot.tableMug.visible = true;
    }
    for (let k = 0; k < 3; k++) {
      const i = (slot.index * 3 + k) * 3;
      if (o) steamPos.set([slot.mugWorld.x + (k - 1) * 0.015, slot.mugWorld.y, slot.mugWorld.z], i);
      else steamPos.set([0, -50, 0], i);
    }
    steam.geometry.attributes.position.needsUpdate = true;
    const label = labels[slot.index];
    if (o) {
      label.textContent = o.nickname + (o.status === 'away' ? ' · away' : '');
      label.className = 'seat-label' + (o.isMe ? ' me' : '') + (o.status === 'away' ? ' away' : '');
    }
    label.hidden = !o || !labelsVisible;
  }

  // ---- loop ------------------------------------------------------------
  let raf = 0;
  let clock = 0;
  let last = 0;
  let acc = 0, frames = 0, sinceTierChange = 0;
  const v = new THREE.Vector3();
  function tick(ts: number) {
    raf = requestAnimationFrame(tick);
    const nowS = ts / 1000;
    const rawDt = last ? nowS - last : 1 / 60;
    if (rawDt < 1 / TIER_CFG[tier].fps - 0.004) return;
    last = nowS;
    const dt = Math.min(rawDt, 0.1);
    clock += dt;
    // Adaptive downgrade when frame time stays poor.
    acc += rawDt; frames++; sinceTierChange += rawDt;
    if (frames >= 90) {
      const avg = acc / frames;
      const limit = tier === 'low' ? Infinity : tier === 'high' ? 1 / 45 : 1 / 32;
      if (avg > limit && sinceTierChange > 3 && clock > 4) {
        tier = TIERS[TIERS.indexOf(tier) + 1];
        sinceTierChange = 0;
        applyTier();
      }
      acc = 0; frames = 0;
    }
    const ambientT = reduced.matches ? clock * 0.3 : clock;
    room.update(clock, dt);
    room.window.uniforms.uTime.value = ambientT;
    for (const m of pointMats) m.uniforms.uTime.value = ambientT;
    for (const s of room.seats) s.character?.update(clock, dt);
    placeCamera(clock);
    renderer.render(scene, camera);
    if (labelsVisible) {
      for (const s of room.seats) {
        const l = labels[s.index];
        if (l.hidden) continue;
        v.copy(s.headWorld);
        if (occ[s.index]?.status === 'away') v.y -= 0.7;
        v.project(camera);
        const x = (v.x * 0.5 + 0.5) * width, y = (-v.y * 0.5 + 0.5) * height;
        l.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    }
  }
  const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  start();

  return {
    setSeats(seats) { room.seats.forEach((slot, i) => setSeat(slot, seats[i] ?? null)); },
    setLabelsVisible(vis) {
      labelsVisible = vis;
      labels.forEach((l, i) => { l.hidden = !vis || !occ[i]; });
    },
    dispose() {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('deviceorientation', onTilt);
      ro.disconnect();
      room.dispose();
      [motes, steam, fairy].forEach((p) => { p.geometry.dispose(); (p.material as THREE.Material).dispose(); });
      disposeCharacterCache();
      materials().dispose();
      renderer.dispose();
      canvas.remove();
      labelLayer.remove();
    },
  };
}

let thumbs: Promise<string[]> | null = null;

/** Avatar picker images, rendered by the same character builder as the scene. */
export function renderAvatarThumbs(size = 144): Promise<string[]> {
  if (thumbs) return thumbs;
  thumbs = new Promise((resolve) => {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#8fa2dc', '#3a2a30', 1.4));
    const key = new THREE.DirectionalLight('#ffd6a0', 1.6);
    key.position.set(2, 3, 4);
    scene.add(key);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    cam.position.set(0.55, 1.35, 2.6);
    cam.lookAt(0, 0.82, 0);
    const out: string[] = [];
    for (const v of AVATARS) {
      const c = new Character(v, { seed: v.id });
      c.posePortrait();
      c.root.rotation.y = 0.18;
      scene.add(c.root);
      renderer.render(scene, cam);
      out.push(renderer.domElement.toDataURL('image/png'));
      scene.remove(c.root);
      c.dispose();
    }
    renderer.dispose();
    renderer.forceContextLoss();
    resolve(out);
  });
  return thumbs;
}
