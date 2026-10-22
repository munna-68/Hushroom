// Dev-only character gallery (/dev/characters). main.tsx imports it behind
// import.meta.env.DEV, so it is never part of the production bundle.
import * as THREE from 'three';
import {
  ACCESSORIES, AVATARS, EXPRESSIONS, HAIR_STYLES, OUTFITS,
  type Accessory, type AvatarVariant, type CharacterSpec, type Expression,
} from '../lib/avatars';
import { Character } from '../scene/character';
import { HEAD_Y, TORSO_Y, disposeCharacterCache } from '../scene/characterBuild';

const BG = '#e0d9ce';
const BASE: CharacterSpec = AVATARS[0].spec;
const HAIR_COLOR: Record<string, number> = { crop: 0, swept: 2, bob: 0, ponytail: 2, bun: 0, curly: 0 };

interface Shot { spec: CharacterSpec; yaw: number; elev?: number; frame: 'body' | 'head' | 'face'; expr?: Expression; label: string; seated?: boolean }

export function mountGallery(el: HTMLElement) {
  document.title = 'Character gallery (dev)';
  document.body.style.cssText = `margin:0;background:${BG};color:#4a4038;font:13px/1.4 Manrope,system-ui,sans-serif`;
  el.innerHTML = '';
  const page = document.createElement('div');
  page.style.cssText = 'max-width:1240px;margin:0 auto;padding:24px 16px 64px';
  el.appendChild(page);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.add(new THREE.HemisphereLight('#fff6ea', '#a89a8e', 2.1));
  const key = new THREE.DirectionalLight('#fff1dc', 1.8);
  key.position.set(-2, 4, 5);
  scene.add(key);
  const cam = new THREE.PerspectiveCamera(22, 1, 0.1, 30);

  const v = (spec: CharacterSpec): AvatarVariant => ({ id: 0, label: '', spec });
  function shoot(s: Shot, w: number, h: number): string {
    const c = new Character(v(s.spec), { standing: !s.seated });
    if (s.seated) { c.root.position.y = 0.17; c.posePortrait(); c.rig.setExpression(s.expr ?? 'smile'); } else c.poseStanding(s.expr);
    c.root.rotation.y = s.yaw;
    scene.add(c.root);
    const headY = c.root.position.y + TORSO_Y + HEAD_Y;
    const target = s.frame === 'body' ? new THREE.Vector3(0, s.seated ? 0.75 : 0.88, 0) : new THREE.Vector3(0, headY + (s.frame === 'head' ? 0.04 : -0.03), 0.03);
    const dist = s.frame === 'body' ? 5.8 : s.frame === 'head' ? 2.7 : 1.7;
    const el = s.elev ?? 0.08;
    cam.aspect = w / h;
    cam.position.set(0, target.y + Math.sin(el) * dist, Math.cos(el) * dist);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(c.root);
    c.dispose();
    return url;
  }

  const section = (title: string, cols: number) => {
    const h = document.createElement('h2');
    h.textContent = title;
    h.style.cssText = 'font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;margin:28px 0 8px';
    const grid = document.createElement('div');
    grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:8px;background:#e8e2d8;border-radius:12px;padding:12px`;
    page.append(h, grid);
    return grid;
  };
  const cell = (grid: HTMLElement, s: Shot, w: number, h: number) => {
    const fig = document.createElement('figure');
    fig.style.cssText = 'margin:0;text-align:center';
    const img = new Image(w, h);
    img.src = shoot(s, w, h);
    img.style.cssText = 'width:100%;height:auto;display:block';
    const cap = document.createElement('figcaption');
    cap.textContent = s.label;
    cap.style.cssText = 'font-size:10px;letter-spacing:.1em;text-transform:uppercase;margin-top:2px';
    fig.append(img, cap);
    grid.appendChild(fig);
  };

  // Budget numbers: one seated character on its own, as in the room.
  const stats = (() => {
    const tris = AVATARS.map((a) => {
      const c = new Character(a);
      const n = c.rig.body.geometry.attributes.position.count / 3 + (c.rig.face.geometry.index!.count / 3);
      c.dispose();
      return n;
    });
    const c = new Character(AVATARS[1]);
    c.root.position.y = 0.17;
    c.posePortrait();
    scene.add(c.root);
    cam.position.set(0, 1.2, 4); cam.lookAt(0, 0.8, 0);
    renderer.setSize(64, 64, false);
    renderer.render(scene, cam);
    const calls = renderer.info.render.calls;
    scene.remove(c.root); c.dispose();
    return { calls, min: Math.min(...tris), max: Math.max(...tris) };
  })();

  const head = document.createElement('div');
  head.innerHTML = `<h1 style="font-size:18px;margin:0 0 4px">Study Together · character gallery <small style="font-weight:500;opacity:.7">(dev only)</small></h1>
    <p style="margin:0">Per character: <b>${stats.calls - 1} draw calls</b> excluding outline (body, face decal; +1 held item when shown) and
    <b>${stats.min.toLocaleString()}–${stats.max.toLocaleString()} triangles</b> across the 10 avatars. Reference sheet at the bottom.</p>`;
  page.appendChild(head);

  let g = section('1. Base character turnaround', 5);
  ([['Front', 0, 0.08], ['3/4 front', -0.65, 0.08], ['Side', -Math.PI / 2, 0.08], ['Back', Math.PI, 0.08], ['High angle 3/4 (behind)', Math.PI - 0.7, 0.75]] as const)
    .forEach(([label, yaw, elev]) => cell(g, { spec: BASE, yaw, elev, frame: 'body', expr: 'smile', label }, 220, 300));

  g = section('Base head close-up', 2);
  ([['Front', 0, 0.05], ['3/4 front', -0.65, 0.08], ['Side', -Math.PI / 2, 0.05], ['Back 3/4', Math.PI - 0.6, 0.3]] as const)
    .forEach(([label, yaw, elev]) => cell(g, { spec: BASE, yaw, elev, frame: 'head', expr: 'smile', label }, 420, 340));

  g = section('2. Hair set (front, 3/4, back, above)', 4);
  HAIR_STYLES.forEach((hair) => {
    const spec = { ...BASE, hair, hairColor: HAIR_COLOR[hair], accessories: [] };
    ([['front', 0, 0.05], ['3/4', -0.7, 0.1], ['back', Math.PI, 0.1], ['above', Math.PI - 0.5, 1.05]] as const)
      .forEach(([view, yaw, elev]) => cell(g, { spec, yaw, elev, frame: 'head', label: `${hair} · ${view}` }, 280, 230));
  });

  g = section('3. Outfit set (front, back)', 6);
  OUTFITS.forEach((outfit, i) => {
    const spec = { ...BASE, outfit, outfitColor: [1, 0, 4, 6, 1, 3][i], pants: [0, 1, 1, 1, 2, 4][i] };
    cell(g, { spec, yaw: -0.25, frame: 'body', label: `${outfit} · front` }, 170, 240);
    cell(g, { spec, yaw: Math.PI + 0.25, frame: 'body', label: `${outfit} · back` }, 170, 240);
  });

  g = section('Accessories', 6);
  ACCESSORIES.forEach((a: Accessory) => {
    const spec = { ...BASE, hair: a === 'clips' ? 'bob' as const : BASE.hair, accessories: [a] };
    cell(g, { spec, yaw: a === 'backpack' ? Math.PI - 0.6 : -0.5, frame: a === 'backpack' || a === 'scarf' ? 'body' : 'head', label: a }, 170, 190);
  });

  g = section('4. Face / expression set', 4);
  EXPRESSIONS.forEach((e) => cell(g, { spec: BASE, yaw: 0, frame: 'face', expr: e, label: e }, 220, 200));

  g = section('6. Example students (all 10 avatars)', 5);
  AVATARS.forEach((a) => cell(g, { spec: a.spec, yaw: -0.35, frame: 'body', label: a.label }, 220, 300));

  g = section('Seated, as in the room (3/4 front and from behind)', 5);
  AVATARS.slice(0, 5).forEach((a) => cell(g, { spec: a.spec, yaw: -0.5, elev: 0.35, frame: 'body', label: `${a.label} · front`, seated: true }, 220, 260));
  AVATARS.slice(0, 5).forEach((a) => cell(g, { spec: a.spec, yaw: Math.PI - 0.4, elev: 0.55, frame: 'body', label: `${a.label} · behind`, seated: true }, 220, 260));

  const ref = document.createElement('img');
  ref.src = '/docs/character-sheet.png';
  ref.alt = 'Reference character sheet';
  ref.style.cssText = 'width:100%;margin-top:28px;border-radius:12px';
  page.appendChild(ref);

  renderer.dispose();
  renderer.forceContextLoss();
  disposeCharacterCache();
}
