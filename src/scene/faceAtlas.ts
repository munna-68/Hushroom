// Face decals: one procedurally drawn atlas (4×2 cells, one per expression)
// mapped onto a thin sphere patch that follows the head. Swapping expression
// (and blinking) is just picking a material whose texture has a different UV
// offset; all eight share one texture source, so the GPU holds one image.
import * as THREE from 'three';
import { EXPRESSIONS, type Expression } from '../lib/avatars';

/** Head ellipsoid: radius and per-axis scale. Shared with the builder. */
export const HEAD_R = 0.3;
export const HEAD_S: [number, number, number] = [1.06, 0.95, 1.0];
const LIFT = 1.012;
const PHI_L = 1.7, THETA_0 = 1.0, THETA_L = 1.7;
const PHI_0 = Math.PI / 2 - PHI_L / 2;
const CELL = 256;

// Feature layout in head-local units (scaled head, face toward +z).
const EX = 0.1, EY = -0.045, ERX = 0.034, ERY = 0.047;
const BY = 0.05, MY = -0.132;
const INK = '#2f2520', IRIS = '#5e3d28', LINE = '#3a2a22', MOUTH = '#7a3b2c', BLUSH = '236,154,102';

export function faceGeometry(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(HEAD_R * LIFT, 16, 14, PHI_0, PHI_L, THETA_0, THETA_L);
  g.scale(...HEAD_S);
  return g;
}

function drawCell(ctx: CanvasRenderingContext2D, e: Expression, ox: number, oy: number) {
  const r = HEAD_R * LIFT;
  const kx = CELL / (PHI_L * r * HEAD_S[0]);
  const ky = CELL / (THETA_L * r * HEAD_S[1]);
  // Head-local (x, y) → pixel, through the patch's spherical UVs.
  const at = (x: number, y: number) => {
    const ys = THREE.MathUtils.clamp(y / (r * HEAD_S[1]), -1, 1);
    const th = Math.acos(ys);
    const ph = Math.acos(THREE.MathUtils.clamp(-x / (r * HEAD_S[0] * Math.sin(th)), -1, 1));
    ctx.setTransform(1, 0, 0, 1, ox + ((ph - PHI_0) / PHI_L) * CELL, oy + ((th - THETA_0) / THETA_L) * CELL);
    ctx.scale(kx, -ky);
  };
  const stroke = (w: number, c = LINE) => { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); };

  // Blush.
  for (const sd of [-1, 1]) {
    at(sd * 0.168, -0.103);
    ctx.scale(1, 0.55);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.05);
    const a = e === 'smile' ? 0.62 : e === 'exhausted' || e === 'sleepy' ? 0.35 : 0.48;
    g.addColorStop(0, `rgba(${BLUSH},${a})`);
    g.addColorStop(1, `rgba(${BLUSH},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 0.05, 0, Math.PI * 2); ctx.fill();
  }

  // Eyes. lid: y (relative to eye centre) of the upper lid cut; tilt > 0 drops the inner corner.
  const eye = (sd: number, o: { lid?: number; tilt?: number; s?: number }) => {
    const s = o.s ?? 1, rx = ERX * s, ry = ERY * s;
    at(sd * EX, EY);
    ctx.save();
    const lidAt = (x: number) => (o.lid ?? 1) - (o.tilt ?? 0) * (-sd * x);
    if (o.lid !== undefined) {
      ctx.beginPath();
      ctx.moveTo(-rx * 1.4, lidAt(-rx * 1.4)); ctx.lineTo(rx * 1.4, lidAt(rx * 1.4));
      ctx.lineTo(rx * 1.4, -ry * 1.4); ctx.lineTo(-rx * 1.4, -ry * 1.4); ctx.closePath();
      ctx.clip();
    }
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = IRIS;
    ctx.beginPath(); ctx.ellipse(0, -ry * 0.42, rx * 0.66, ry * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    const hy = Math.min(ry * 0.4, lidAt(-rx * 0.3) - 0.014);
    ctx.fillStyle = '#fffaf2';
    ctx.beginPath(); ctx.arc(-rx * 0.32, hy, 0.0125 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (o.lid !== undefined) {
      ctx.beginPath();
      ctx.moveTo(-rx * 1.12, lidAt(-rx * 1.12)); ctx.lineTo(rx * 1.12, lidAt(rx * 1.12));
      stroke(0.011, INK);
    }
  };
  // Closed eye: a soft downward arc.
  const shut = (sd: number, droop = 0) => {
    at(sd * EX, EY - 0.008);
    ctx.beginPath();
    ctx.moveTo(-ERX * 1.05, droop * sd);
    ctx.quadraticCurveTo(0, -0.026, ERX * 1.05, -droop * sd);
    stroke(0.011, INK);
  };
  // Brow: tilt > 0 lowers the inner end (cross), < 0 raises it (worried); arch bows it upward.
  const brow = (sd: number, y: number, tilt = 0, arch = 0.006, w = 0.009) => {
    at(sd * EX, y);
    const inner = -sd * 0.03, outer = sd * 0.03;
    ctx.beginPath();
    ctx.moveTo(inner, -tilt * 0.03);
    ctx.quadraticCurveTo(0, arch, outer, tilt * 0.03);
    stroke(w);
  };
  const mouth = (draw: () => void, w = 0.008) => { at(0, MY); ctx.beginPath(); draw(); stroke(w, MOUTH); };

  for (const sd of [-1, 1]) {
    switch (e) {
      case 'focused': eye(sd, { lid: 0.02, tilt: 0.08 }); brow(sd, BY, 0.18, 0.003); break;
      case 'smile': eye(sd, {}); brow(sd, BY + 0.008, 0, 0.01); break;
      case 'sleepy': eye(sd, { lid: -0.006, tilt: -0.22 }); brow(sd, BY + 0.01, -0.12, 0.004); break;
      case 'blink': shut(sd); brow(sd, BY + 0.004, 0, 0.008); break;
      case 'surprised': eye(sd, { s: 1.1 }); brow(sd, BY + 0.03, 0, 0.016); break;
      case 'annoyed': eye(sd, { lid: 0.006, tilt: 0.12 }); brow(sd, BY - 0.004, 0.42, 0.002, 0.01); break;
      case 'exhausted': eye(sd, { lid: -0.012, tilt: -0.3 }); brow(sd, BY + 0.012, -0.38, 0.004);
        at(sd * EX, EY - ERY - 0.012); ctx.beginPath(); ctx.moveTo(-0.022, 0); ctx.quadraticCurveTo(0, -0.008, 0.022, 0); stroke(0.005, 'rgba(120,70,60,0.55)');
        break;
      case 'determined': eye(sd, { lid: 0.03, tilt: 0.28 }); brow(sd, BY - 0.002, 0.5, 0.002, 0.012); break;
    }
  }
  switch (e) {
    case 'focused': mouth(() => { ctx.moveTo(-0.012, 0); ctx.lineTo(0.012, 0); }); break;
    case 'smile': mouth(() => { ctx.moveTo(-0.02, 0.006); ctx.quadraticCurveTo(0, -0.016, 0.02, 0.006); }); break;
    case 'sleepy': mouth(() => { ctx.moveTo(-0.01, 0); ctx.quadraticCurveTo(0, -0.004, 0.01, 0); }); break;
    case 'blink': mouth(() => { ctx.moveTo(-0.014, 0.004); ctx.quadraticCurveTo(0, -0.01, 0.014, 0.004); }); break;
    case 'surprised':
      at(0, MY - 0.004);
      ctx.fillStyle = MOUTH; ctx.beginPath(); ctx.ellipse(0, 0, 0.013, 0.016, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'annoyed': mouth(() => { ctx.moveTo(-0.016, -0.004); ctx.quadraticCurveTo(0, 0.01, 0.016, -0.004); }); break;
    case 'exhausted': mouth(() => { ctx.moveTo(-0.018, 0); ctx.bezierCurveTo(-0.008, 0.008, 0.002, -0.008, 0.018, 0.002); }); break;
    case 'determined': mouth(() => { ctx.moveTo(-0.014, -0.002); ctx.quadraticCurveTo(0, 0.004, 0.014, -0.002); }, 0.009); break;
  }
}

interface FaceKit { atlas: THREE.CanvasTexture; mats: Record<Expression, THREE.MeshToonMaterial>; geo: THREE.BufferGeometry }
let kit: FaceKit | null = null;

export function faceKit(gradientMap: THREE.Texture): FaceKit {
  if (kit) return kit;
  const c = document.createElement('canvas');
  c.width = CELL * 4; c.height = CELL * 2;
  const ctx = c.getContext('2d')!;
  EXPRESSIONS.forEach((e, i) => drawCell(ctx, e, (i % 4) * CELL, Math.floor(i / 4) * CELL));
  const atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  const mats = {} as Record<Expression, THREE.MeshToonMaterial>;
  EXPRESSIONS.forEach((e, i) => {
    const map = atlas.clone(); // shares the image source; only the UV transform differs
    map.repeat.set(1 / 4, 1 / 2);
    map.offset.set((i % 4) / 4, 1 - (Math.floor(i / 4) + 1) / 2);
    mats[e] = new THREE.MeshToonMaterial({
      map, gradientMap, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  });
  kit = { atlas, mats, geo: faceGeometry() };
  return kit;
}

export function disposeFaceKit() {
  if (!kit) return;
  Object.values(kit.mats).forEach((m) => { m.map?.dispose(); m.dispose(); });
  kit.atlas.dispose();
  kit.geo.dispose();
  kit = null;
}
