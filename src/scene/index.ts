// Imperative scene entry point. Mounted by components/StudyScene.tsx and
// code-split so the entry screen never waits on three.js.
import * as THREE from 'three';
import { AVATARS } from '../lib/avatars';
import { Character } from './character';
import { charMaterials, disposeCharacterCache } from './characterBuild';
import { faceKit } from './faceAtlas';
import { materials } from './toon';
import { buildRoom } from './room';
import { createCrowd, type Crowd, type LabAction, type Occupant } from './agents';
import { lightRig, patchLighting, stUniforms } from './envMaterial';
import { blendAtmo, createAtmo, type TimeOfDay, type Weather } from './atmosphere';
import { createQuality, type QualityStats, type Tier, type TierChoice } from './quality';
import { createCameraRig, type CameraView } from './camera';
import { createMotes, createSteam } from './ambient';
import { MAX_SLOTS, NAV_EDGES, NAV_NODES, SPOTS, type SlotStatus } from './hall';

export type { Status } from './character';
export type { TimeOfDay, Weather } from './atmosphere';
export type { Tier, TierChoice } from './quality';
export type { SlotStatus } from './hall';
export { MAX_SLOTS } from './hall';

/** What the app passes today (one entry per app seat, up to its ROOM_CAP). */
export interface SeatOccupant {
  userId: string;
  nickname: string;
  avatar: number;
  status: 'focusing' | 'break' | 'away';
  isMe: boolean;
}

/** The scene's own input: one entry per slot (0..MAX_SLOTS-1). */
export interface Participant {
  slot: number;
  name: string;
  status: SlotStatus;
  avatar?: number;
  id?: string;
  isMe?: boolean;
}

export interface SceneStats extends QualityStats { calls: number; triangles: number; textures: number; geometries: number }

/** Hooks for the Scene Lab and ?debug=1. */
export interface SceneDebug {
  stats(): SceneStats;
  setSpeed(k: number): void;
  view(): CameraView;
  setView(v: Partial<CameraView>, instant?: boolean): void;
  capture(width: number, height: number): string;
  /** Trigger a state or animation on one slot (Scene Lab). */
  lab(slot: number, action: LabAction): void;
  /** One line per slot describing what the agent is doing. */
  agents(): string[];
  /** Waypoint graph / lamp-state overlays. */
  overlay(kind: 'graph' | 'lamps', on: boolean): void;
  /** Render from an arbitrary viewpoint (close-ups in the lab). */
  captureFrom(eye: [number, number, number], target: [number, number, number], fov: number, width: number, height: number): string;
  /** Advance the simulation by `sec` seconds without waiting for frames (lab captures). */
  step(sec: number): void;
  crowd: Crowd;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
}

export interface StudySceneHandle {
  setSeats(seats: (SeatOccupant | null)[]): void;
  setLabelsVisible(v: boolean): void;
  setParticipants(list: Participant[]): void;
  setTimeOfDay(t: TimeOfDay): void;
  setWeather(w: Weather): void;
  setQuality(q: TierChoice): void;
  resetView(): void;
  dispose(): void;
  debug: SceneDebug;
}

export interface SceneOptions { timeOfDay?: TimeOfDay; weather?: Weather; quality?: Tier }

const FIXED = 1 / 60;
// Overflow seats (app seats beyond MAX_SLOTS) fill free slots middle-out, faces first.
const OVERFLOW_ORDER = [1, 2, 5, 6, 0, 3, 4, 7];
const STATUS: Record<SeatOccupant['status'], SlotStatus> = { focusing: 'focus', break: 'break', away: 'away' };

export function createStudyScene(container: HTMLElement, opts: SceneOptions = {}): StudySceneHandle {
  const params = new URLSearchParams(location.search);
  const q = params.get('quality');
  const quality = createQuality(opts.quality ?? (q === 'high' || q === 'medium' || q === 'low' ? q : null));
  const debugHud = params.get('debug') === '1';
  const pt = params.get('time'), pw = params.get('weather');
  let night = (opts.timeOfDay ?? (pt === 'day' ? 'day' : 'night')) === 'night' ? 1 : 0;
  let rain = (opts.weather ?? (pw === 'clear' ? 'clear' : 'rain')) === 'rain' ? 1 : 0;
  let nightCur = night, rainCur = rain;

  const renderer = new THREE.WebGLRenderer({ antialias: quality.getTier() !== 'low', powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.domElement.className = 'scene-canvas';
  container.appendChild(renderer.domElement);
  const labelLayer = document.createElement('div');
  labelLayer.className = 'scene-labels';
  container.appendChild(labelLayer);

  const scene = new THREE.Scene();
  const atmo = createAtmo();
  blendAtmo(atmo, night, rain);
  scene.background = atmo.bg.clone();

  // Lights: the sun/moon must be the first directional light (window-masked in the shaders).
  const hemi = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  const fill = new THREE.DirectionalLight();
  sun.target.position.set(-0.5, 0, -0.5);
  fill.position.set(9, 10, 11);
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.025;
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 40 });
  scene.add(sun, sun.target, fill, hemi);

  // The characters (frozen) get the room's lamps and window light on their own materials.
  const cm = charMaterials();
  patchLighting(cm.toon);
  Object.values(faceKit(cm.gradient).mats).forEach(patchLighting);
  patchLighting(materials().toon);

  const room = buildRoom();
  scene.add(room.group);
  const crowd = createCrowd(room);
  const steam = createSteam(MAX_SLOTS);
  const motes = createMotes(atmo.sunDir.clone());
  scene.add(steam.points, motes.points);

  const camRig = createCameraRig(renderer.domElement);
  const camera = camRig.camera;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const onReduced = () => crowd.setReducedMotion(reduced.matches);
  onReduced();
  reduced.addEventListener('change', onReduced);

  const labels: HTMLDivElement[] = Array.from({ length: MAX_SLOTS }, () => {
    const d = document.createElement('div');
    d.className = 'seat-label';
    d.hidden = true;
    labelLayer.appendChild(d);
    return d;
  });
  let labelsVisible = true;
  let hud: HTMLDivElement | null = null;
  if (debugHud) {
    hud = document.createElement('div');
    hud.style.cssText = 'position:absolute;left:8px;bottom:8px;z-index:5;font:11px/1.4 ui-monospace,monospace;color:#e8e2d8;background:rgba(0,0,0,.55);padding:4px 6px;border-radius:6px;pointer-events:none;white-space:pre';
    container.appendChild(hud);
  }

  // ---- quality ---------------------------------------------------------------------
  let width = 1, height = 1, dpr = 1, shadowSize = 0;
  function applyQuality() {
    const s = quality.settings();
    dpr = Math.min(window.devicePixelRatio || 1, s.dpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    if (s.shadowMap !== shadowSize) {
      shadowSize = s.shadowMap;
      renderer.shadowMap.enabled = shadowSize > 0;
      renderer.shadowMap.type = s.shadowSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      sun.castShadow = shadowSize > 0;
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null as unknown as THREE.WebGLRenderTarget; }
      if (shadowSize) sun.shadow.mapSize.set(shadowSize, shadowSize);
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; });
      });
    }
    room.setQuality(s);
    crowd.setMicroRate(s.micro, s.halfRateFar);
    motes.setCount(s.motes);
    steam.setCount(s.steamPerMug);
    const px = dpr * height * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    for (const m of [steam.points, motes.points]) ((m.material as THREE.ShaderMaterial).uniforms.uPx.value = px);
    room.setPx(px);
  }
  const unsubQ = quality.subscribe(applyQuality);

  const resize = () => {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    camRig.resize(width, height);
    applyQuality();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // ---- atmosphere ------------------------------------------------------------------
  let atmoDirty = true;
  function applyAtmo() {
    blendAtmo(atmo, nightCur, rainCur);
    hemi.color.copy(atmo.hemiSky); hemi.groundColor.copy(atmo.hemiGround); hemi.intensity = atmo.hemiI;
    sun.color.copy(atmo.sun); sun.intensity = atmo.sunI;
    sun.position.copy(sun.target.position).addScaledVector(atmo.sunDir, 18);
    lightRig.sunDir.copy(atmo.sunDir);
    stUniforms.stWin.value.w = atmo.sunSoft;
    fill.color.copy(atmo.fill); fill.intensity = atmo.fillI;
    (scene.background as THREE.Color).copy(atmo.bg);
    const u = room.window.uniforms;
    u.uSkyTop.value.copy(atmo.skyTop); u.uSkyBot.value.copy(atmo.skyBot);
    u.uSunCol.value.copy(atmo.sunGlow); u.uSun.value.set(0.82, 0.3, atmo.sunGlowAmt);
    u.uCityCol.value.copy(atmo.city); u.uCityHaze.value = atmo.cityHaze;
    u.uTreeCol.value.copy(atmo.tree); u.uTreeLit.value.copy(atmo.treeLit);
    u.uLights.value = atmo.cityLights; u.uStars.value = atmo.stars; u.uRain.value = atmo.rain;
    u.uGlass.value.copy(atmo.glass);
  }

  // ---- seats -----------------------------------------------------------------------
  const slotOf = new Map<string, number>();
  let populated = false;
  const occ: (Occupant | null)[] = new Array(MAX_SLOTS).fill(null);
  function commit() {
    crowd.set(occ, !populated || reduced.matches);
    populated = true;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const o = occ[i], l = labels[i];
      if (o) {
        l.textContent = o.name + (o.status === 'away' ? ' · away' : '');
        l.className = 'seat-label' + (o.isMe ? ' me' : '') + (o.status === 'away' ? ' away' : '');
      }
      l.hidden = !o || !labelsVisible;
    }
  }
  /** App seats (any count) → scene slots, sticky per user so nobody jumps seats. */
  function setSeats(seats: (SeatOccupant | null)[]) {
    const list = seats.map((s, i) => (s ? { s, i } : null)).filter((x): x is { s: SeatOccupant; i: number } => !!x);
    const present = new Set(list.map((x) => x.s.userId));
    for (const k of [...slotOf.keys()]) if (!present.has(k)) slotOf.delete(k);
    const taken = new Array<boolean>(MAX_SLOTS).fill(false);
    slotOf.forEach((v) => { taken[v] = true; });
    for (const { s, i } of list) {
      if (slotOf.has(s.userId)) continue;
      if (i < MAX_SLOTS && !taken[i]) { slotOf.set(s.userId, i); taken[i] = true; }
    }
    for (const { s } of list) {
      if (slotOf.has(s.userId)) continue;
      const free = OVERFLOW_ORDER.find((k) => !taken[k]);
      if (free === undefined) continue; // more people than chairs: listed in the panel, not seated
      slotOf.set(s.userId, free); taken[free] = true;
    }
    occ.fill(null);
    for (const { s } of list) {
      const k = slotOf.get(s.userId);
      if (k !== undefined) occ[k] = { key: s.userId, name: s.nickname, avatar: s.avatar, status: STATUS[s.status], isMe: s.isMe };
    }
    commit();
  }
  function setParticipants(list: Participant[]) {
    occ.fill(null);
    for (const p of list) {
      if (p.slot < 0 || p.slot >= MAX_SLOTS || p.status === 'empty') continue;
      occ[p.slot] = { key: p.id ?? `slot-${p.slot}-${p.avatar ?? p.slot}`, name: p.name, avatar: p.avatar ?? p.slot, status: p.status, isMe: !!p.isMe };
    }
    commit();
  }

  // ---- loop ------------------------------------------------------------------------
  let raf = 0, prev = 0, lastRender = 0, acc = 0, simT = 0, speed = 1;
  const v = new THREE.Vector3();
  const mugW = new THREE.Vector3();
  function render(frameDt: number) {
    const still = reduced.matches;
    // Weather/time crossfade (~2.5 s; instant under reduced motion).
    const k = still ? 1 : frameDt / 2.5;
    if (nightCur !== night || rainCur !== rain) {
      nightCur = nightCur < night ? Math.min(night, nightCur + k) : Math.max(night, nightCur - k);
      rainCur = rainCur < rain ? Math.min(rain, rainCur + k) : Math.max(rain, rainCur - k);
      atmoDirty = true;
    }
    if (atmoDirty) { applyAtmo(); atmoDirty = false; }
    const ambientT = still ? simT * 0.3 : simT;
    room.window.uniforms.uTime.value = ambientT;
    crowd.update(simT, frameDt, camera.position);
    room.update(simT, frameDt, atmo);
    for (let i = 0; i < MAX_SLOTS; i++) {
      const s = room.seats[i];
      if (s.kit.visible && occ[i] && occ[i]!.status !== 'away') steam.setSource(i, mugW.setFromMatrixPosition(s.mug.matrixWorld).setY(mugW.y + 0.11));
      else steam.setSource(i, null);
    }
    steam.update(ambientT);
    motes.update(ambientT, atmo.motes, atmo.sun);
    camRig.update(frameDt, simT, still);
    renderer.render(scene, camera);
    drawLampTags();
    if (labelsVisible) {
      for (let i = 0; i < MAX_SLOTS; i++) {
        const l = labels[i];
        if (l.hidden) continue;
        if (!crowd.labelPoint(i, v)) continue;
        v.project(camera);
        const x = (v.x * 0.5 + 0.5) * width, y = (-v.y * 0.5 + 0.5) * height;
        l.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    }
  }

  // ---- debug overlays -----------------------------------------------------------------
  let graph: THREE.Group | null = null;
  let lampTags: HTMLDivElement[] | null = null;
  function overlay(kind: 'graph' | 'lamps', on: boolean) {
    if (kind === 'graph') {
      if (on && !graph) {
        graph = new THREE.Group();
        const pts: number[] = [];
        for (const [a, b] of NAV_EDGES) pts.push(NAV_NODES[a][0], 0.06, NAV_NODES[a][1], NAV_NODES[b][0], 0.06, NAV_NODES[b][1]);
        const lg = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        graph.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#7fe0d0', depthTest: false, transparent: true })));
        const dot = new THREE.SphereGeometry(0.06, 8, 6);
        const nodeMat = new THREE.MeshBasicMaterial({ color: '#7fe0d0', depthTest: false, transparent: true });
        const spotMat = new THREE.MeshBasicMaterial({ color: '#f2b45a', depthTest: false, transparent: true });
        for (const k of Object.keys(NAV_NODES)) { const m = new THREE.Mesh(dot, nodeMat); m.position.set(NAV_NODES[k][0], 0.06, NAV_NODES[k][1]); graph.add(m); }
        for (const sp of SPOTS) { const m = new THREE.Mesh(dot, spotMat); m.scale.setScalar(1.6); m.position.set(sp.x, 0.08, sp.z); graph.add(m); }
        graph.renderOrder = 10;
        graph.traverse((o) => { o.renderOrder = 10; });
        scene.add(graph);
      } else if (!on && graph) {
        scene.remove(graph);
        graph.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose(); });
        graph = null;
      }
    } else if (on && !lampTags) {
      lampTags = room.seats.map(() => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;left:0;top:0;font:10px/1.2 ui-monospace,monospace;background:rgba(0,0,0,.7);color:#ffe2b0;padding:1px 4px;border-radius:4px;white-space:nowrap;pointer-events:none';
        labelLayer.appendChild(d);
        return d;
      });
    } else if (!on && lampTags) { lampTags.forEach((d) => d.remove()); lampTags = null; }
  }
  const lv = new THREE.Vector3();
  function drawLampTags() {
    if (!lampTags) return;
    room.seats.forEach((s, i) => {
      lv.copy(s.lamp.world).project(camera);
      const o = occ[i];
      lampTags![i].textContent = `${i + 1} ${o ? o.status : 'empty'} lamp ${(s.lamp.level * 100).toFixed(0)}%→${(s.lamp.target * 100).toFixed(0)}%`;
      lampTags![i].style.transform = `translate3d(${((lv.x * 0.5 + 0.5) * width).toFixed(1)}px, ${((-lv.y * 0.5 + 0.5) * height).toFixed(1)}px, 0) translate(-50%, -150%)`;
    });
  }

  let hudT = 0;
  function tick(ts: number) {
    raf = requestAnimationFrame(tick);
    const fps = quality.settings().fps;
    if (!prev) { prev = lastRender = ts; }
    if (fps > 0) {
      // Drift-free limiter: skip until the next slot (1 ms early tolerance), advance along the ideal schedule.
      const interval = 1000 / fps;
      const since = ts - lastRender;
      if (since < interval - 1) return;
      lastRender = since > 250 ? ts : lastRender + Math.max(1, Math.floor((since + 1) / interval)) * interval;
    }
    let ms = ts - prev;
    prev = ts;
    if (ms > 250) ms = 1000 / 60; // hidden or stalled: don't fast-forward
    quality.frame(ms, ts / 1000);
    const dt = Math.min(ms / 1000, 0.1) * speed;
    acc += dt;
    while (acc >= FIXED) { acc -= FIXED; simT += FIXED; crowd.step(simT, FIXED); }
    render(dt);
    if (hud && ts / 1000 - hudT > 0.5) {
      hudT = ts / 1000;
      const st = debug.stats();
      hud.textContent = `${st.tier}${st.choice === 'auto' ? ' (auto)' : ''}  ${st.fps.toFixed(0)} fps  p95 ${st.p95.toFixed(1)} ms\n${st.calls} calls  ${(st.triangles / 1000).toFixed(0)}k tris`;
    }
  }
  const start = () => { if (!raf) { prev = 0; raf = requestAnimationFrame(tick); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  start();

  const debug: SceneDebug = {
    stats: () => ({ ...quality.stats(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }),
    setSpeed(k) { speed = Math.max(0, k); },
    view: () => camRig.view(),
    setView: (vv, instant) => camRig.setView(vv, instant),
    capture(w, h) {
      const pw = width, ph = height, pd = dpr;
      nightCur = night; rainCur = rain; atmoDirty = true;
      width = w; height = h;
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      camRig.resize(w, h);
      render(0);
      const url = renderer.domElement.toDataURL('image/png');
      width = pw; height = ph; dpr = pd;
      camRig.resize(pw, ph);
      renderer.setPixelRatio(pd);
      renderer.setSize(pw, ph, false);
      return url;
    },
    captureFrom(eye, tgt, fov, w, h) {
      const cam = new THREE.PerspectiveCamera(fov, w / h, 0.05, 80);
      cam.position.set(...eye);
      cam.lookAt(...tgt);
      nightCur = night; rainCur = rain; atmoDirty = true;
      render(0);
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      renderer.render(scene, cam);
      const url = renderer.domElement.toDataURL('image/png');
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      return url;
    },
    step(sec) {
      const n = Math.round(sec / FIXED);
      for (let i = 0; i < n; i++) { simT += FIXED; crowd.step(simT, FIXED); render(FIXED); }
    },
    lab: (slot, a) => crowd.lab(slot, a),
    overlay,
    agents: () => Array.from({ length: MAX_SLOTS }, (_, i) => crowd.debug(i)),
    crowd, scene, renderer,
  };
  if (import.meta.env.DEV) (window as unknown as { __st: unknown }).__st = { debug, room, quality, camRig, atmo };

  return {
    setSeats,
    setParticipants,
    setLabelsVisible(vis) {
      labelsVisible = vis;
      labels.forEach((l, i) => { l.hidden = !vis || !occ[i]; });
    },
    setTimeOfDay(t) { night = t === 'night' ? 1 : 0; },
    setWeather(w) { rain = w === 'rain' ? 1 : 0; },
    setQuality(c) { quality.setTier(c); },
    resetView() { camRig.resetView(); },
    dispose() {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      reduced.removeEventListener('change', onReduced);
      ro.disconnect();
      unsubQ();
      camRig.dispose();
      crowd.dispose();
      room.dispose();
      steam.dispose();
      motes.dispose();
      sun.shadow.map?.dispose();
      disposeCharacterCache();
      materials().dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelLayer.remove();
      hud?.remove();
    },
    debug,
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
    // The room's lamp and window lighting is shared by the character materials; switch it off here.
    const on = stUniforms.stOn.value;
    stUniforms.stOn.value = 0;
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
    stUniforms.stOn.value = on;
    renderer.dispose();
    renderer.forceContextLoss();
    resolve(out);
  });
  return thumbs;
}
