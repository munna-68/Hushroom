// Procedural 1024x1024 gouache & watercolor painting engine and 3D beveled museum frames
// for the Archivist's Study Triptych ("Misty Evergreen Hills", "Golden Hour Sunset", "Alpine Mirror Lake").
import * as THREE from 'three';
import { EnvBuilder } from './envGeo';
import { patchLighting, PENDANT_LAMP } from './envMaterial';
import { cyl, roundedBox, type V3 } from './toon';

// ============================================================================
// SEEDED PRNG & VALUE NOISE ENGINE
// ============================================================================
export class SeededRandom {
  seed: number;
  constructor(seed = 4092) {
    this.seed = seed >>> 0;
  }
  next(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  noise1D(x: number, freq = 0.01, octaves = 4): number {
    let val = 0;
    let amp = 0.5;
    let f = freq;
    for (let i = 0; i < octaves; i++) {
      const xi = Math.floor(x * f);
      const frac = x * f - xi;
      const u = frac * frac * (3 - 2 * frac);
      const a = this.hash(xi + i * 137);
      const b = this.hash(xi + 1 + i * 137);
      val += (a + (b - a) * u) * amp;
      f *= 2.05;
      amp *= 0.5;
    }
    return val;
  }
  hash(n: number): number {
    const x = Math.sin(n * 127.1 + (this.seed % 1000)) * 43758.5453123;
    return x - Math.floor(x);
  }
}

export function paintGouacheCluster(
  ctx: CanvasRenderingContext2D,
  rng: SeededRandom,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string,
  alpha = 0.25,
  count = 28,
): void {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const angle = rng.range(0, Math.PI * 2);
    const dist = Math.sqrt(rng.next());
    const x = cx + Math.cos(angle) * rx * dist;
    const y = cy + Math.sin(angle) * ry * dist;
    const r = rng.range(rx * 0.16, rx * 0.48) * (1 - dist * 0.45);
    ctx.globalAlpha = alpha * rng.range(0.55, 1.15);
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      Math.max(1, r * rng.range(0.9, 1.35)),
      Math.max(1, r * rng.range(0.65, 1.05)),
      rng.range(-0.3, 0.3),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}

export function applyWatercolorPaperGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rng: SeededRandom,
): void {
  ctx.save();
  for (let i = 0; i < 9500; i++) {
    const x = rng.range(0, width);
    const y = rng.range(0, height);
    const r = rng.range(0.6, 2.1);
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,250,240,0.035)' : 'rgba(35,28,18,0.025)';
    ctx.fillRect(x, y, r, r);
  }
  const vig = ctx.createRadialGradient(
    width * 0.5,
    height * 0.5,
    width * 0.36,
    width * 0.5,
    height * 0.5,
    width * 0.72,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(28, 20, 12, 0.16)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// ============================================================================
// PROCEDURAL PAINTING 1: "MISTY EVERGREEN HILLS"
// ============================================================================
export function paintMistyEvergreenHills(canvas: HTMLCanvasElement, seed = 4092): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const rng = new SeededRandom(seed + 101);

  const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.58);
  skyGrad.addColorStop(0.0, '#c7e0db');
  skyGrad.addColorStop(0.45, '#e0ece6');
  skyGrad.addColorStop(1.0, '#f5f2e5');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 9; i++) {
    const cx = rng.range(W * 0.08, W * 0.92);
    const cy = rng.range(H * 0.09, H * 0.32);
    const rx = rng.range(90, 210);
    const ry = rx * rng.range(0.38, 0.58);
    paintGouacheCluster(ctx, rng, cx, cy + 16, rx, ry, '#aac8c2', 0.22, 24);
    paintGouacheCluster(ctx, rng, cx, cy, rx * 0.92, ry * 0.88, '#fffdf5', 0.42, 32);
  }

  const drawRidge = (
    baseY: number,
    amp: number,
    freq: number,
    topColor: string,
    bottomColor: string,
    mistAfter = true,
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, H);
    const pts: { x: number; y: number }[] = [];
    for (let x = 0; x <= W; x += 6) {
      const n = rng.noise1D(x + baseY * 3.7, freq, 4);
      const y = baseY - (n - 0.5) * amp;
      pts.push({ x, y });
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();

    const g = ctx.createLinearGradient(0, baseY - amp * 0.5, 0, baseY + amp * 1.2);
    g.addColorStop(0, topColor);
    g.addColorStop(1, bottomColor);
    ctx.fillStyle = g;
    ctx.fill();

    for (let i = 0; i < pts.length; i += 2) {
      const p = pts[i];
      if (rng.next() > 0.35) {
        paintGouacheCluster(
          ctx,
          rng,
          p.x,
          p.y + rng.range(8, 55),
          rng.range(18, 45),
          rng.range(12, 32),
          rng.next() > 0.5 ? topColor : bottomColor,
          0.25,
          10,
        );
      }
    }
    ctx.restore();

    if (mistAfter) {
      ctx.save();
      const mistGrad = ctx.createLinearGradient(0, baseY - 20, 0, baseY + 115);
      mistGrad.addColorStop(0, 'rgba(244, 248, 242, 0.0)');
      mistGrad.addColorStop(0.45, 'rgba(242, 247, 241, 0.62)');
      mistGrad.addColorStop(1, 'rgba(244, 248, 242, 0.0)');
      ctx.fillStyle = mistGrad;
      ctx.fillRect(0, baseY - 20, W, 135);
      for (let m = 0; m < 14; m++) {
        paintGouacheCluster(
          ctx,
          rng,
          rng.range(0, W),
          baseY + rng.range(15, 65),
          rng.range(80, 180),
          rng.range(20, 42),
          '#f4f7f0',
          0.18,
          16,
        );
      }
      ctx.restore();
    }
    return pts;
  };

  drawRidge(H * 0.42, 160, 0.0032, '#6d9896', '#97bab4', true);
  drawRidge(H * 0.53, 145, 0.004, '#477a71', '#7ea89a', true);
  const midRidge = drawRidge(H * 0.66, 130, 0.0045, '#2f6354', '#52876e', true);

  const paintConifer = (
    x: number,
    baseY: number,
    height: number,
    scale = 1.0,
    darkCol = '#183c32',
    midCol = '#2c5e4b',
    lightCol = '#689c6d',
  ) => {
    ctx.save();
    ctx.fillStyle = '#3c2d23';
    ctx.fillRect(x - 2.5 * scale, baseY - height * 0.25, 5 * scale, height * 0.28);

    const tiers = 7;
    for (let t = 0; t < tiers; t++) {
      const frac = t / (tiers - 1);
      const ty = baseY - height * (0.18 + frac * 0.82);
      const tw = (1 - frac * 0.72) * (height * 0.34);

      paintGouacheCluster(ctx, rng, x, ty + 4 * scale, tw, height * 0.09, darkCol, 0.55, 14);
      paintGouacheCluster(ctx, rng, x - tw * 0.1, ty, tw * 0.88, height * 0.08, midCol, 0.5, 14);
      paintGouacheCluster(ctx, rng, x - tw * 0.22, ty - 3 * scale, tw * 0.55, height * 0.06, lightCol, 0.42, 10);
    }
    ctx.restore();
  };

  for (let i = 0; i < 34; i++) {
    const tx = rng.range(20, W - 20);
    const idx = Math.min(midRidge.length - 1, Math.floor((tx / W) * midRidge.length));
    const ty = midRidge[idx].y + rng.range(25, 95);
    const th = rng.range(70, 135);
    paintConifer(tx, ty, th, 0.85, '#1d443a', '#316854', '#6ba073');
  }

  drawRidge(H * 0.82, 110, 0.0038, '#3b6e4c', '#1e4231', false);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(W * 0.52, H * 0.76);
  ctx.bezierCurveTo(W * 0.44, H * 0.83, W * 0.62, H * 0.9, W * 0.46, H + 10);
  ctx.lineTo(W * 0.6, H + 10);
  ctx.bezierCurveTo(W * 0.72, H * 0.89, W * 0.52, H * 0.83, W * 0.55, H * 0.76);
  ctx.closePath();
  ctx.fillStyle = '#c8b08a';
  ctx.fill();

  for (let s = 0; s < 26; s++) {
    const t = s / 25;
    const px = W * 0.52 + Math.sin(t * 5) * 28 + rng.range(-18, 18);
    const py = H * 0.77 + t * (H * 0.23);
    ctx.fillStyle = s % 2 === 0 ? '#dfd0b4' : '#9c8666';
    ctx.beginPath();
    ctx.ellipse(px, py, rng.range(6, 16), rng.range(3, 6), rng.range(-0.2, 0.2), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  for (let i = 0; i < 18; i++) {
    const side = i % 2 === 0 ? rng.range(30, W * 0.42) : rng.range(W * 0.6, W - 30);
    const ty = rng.range(H * 0.79, H * 0.98);
    const th = rng.range(130, 230);
    paintConifer(side, ty, th, 1.15, '#122c24', '#25533f', '#7cb375');
  }

  for (let f = 0; f < 160; f++) {
    const fx = rng.range(0, W);
    const fy = rng.range(H * 0.76, H);
    ctx.fillStyle = f % 5 === 0 ? '#f6e79c' : f % 3 === 0 ? '#8ac070' : '#538d57';
    ctx.globalAlpha = rng.range(0.45, 0.85);
    ctx.beginPath();
    ctx.arc(fx, fy, rng.range(2, 5.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#f7f9f4';
  ctx.lineWidth = 2.2;
  for (let b = 0; b < 5; b++) {
    const bx = W * 0.58 + b * 26 + rng.range(-8, 8);
    const by = H * 0.46 + Math.sin(b) * 14;
    ctx.beginPath();
    ctx.moveTo(bx - 7, by + 2);
    ctx.quadraticCurveTo(bx - 3, by - 4, bx, by);
    ctx.quadraticCurveTo(bx + 3, by - 4, bx + 7, by + 2);
    ctx.stroke();
  }

  applyWatercolorPaperGrain(ctx, W, H, rng);
}

// ============================================================================
// PROCEDURAL PAINTING 2: "GOLDEN HOUR SUNSET"
// ============================================================================
export function paintGoldenHourSunset(canvas: HTMLCanvasElement, seed = 4092): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const rng = new SeededRandom(seed + 202);

  const skyGrad = ctx.createLinearGradient(0, 0, 0, H * 0.68);
  skyGrad.addColorStop(0.0, '#282247');
  skyGrad.addColorStop(0.26, '#693665');
  skyGrad.addColorStop(0.54, '#ca5747');
  skyGrad.addColorStop(0.78, '#f19940');
  skyGrad.addColorStop(1.0, '#fbe186');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  const sunX = W * rng.range(0.42, 0.58);
  const sunY = H * 0.58;
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 15, sunX, sunY, 340);
  sunGlow.addColorStop(0.0, 'rgba(255, 252, 224, 0.95)');
  sunGlow.addColorStop(0.25, 'rgba(255, 214, 112, 0.65)');
  sunGlow.addColorStop(0.6, 'rgba(245, 130, 64, 0.22)');
  sunGlow.addColorStop(1.0, 'rgba(245, 130, 64, 0.0)');
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 8; i++) {
    const cx = rng.range(W * 0.08, W * 0.92);
    const cy = rng.range(H * 0.16, H * 0.45);
    const rx = rng.range(100, 220);
    const ry = rx * rng.range(0.45, 0.68);

    paintGouacheCluster(ctx, rng, cx, cy - 8, rx, ry, '#57315a', 0.34, 28);
    paintGouacheCluster(ctx, rng, cx, cy + 10, rx * 0.92, ry * 0.82, '#dd6b44', 0.36, 26);
    paintGouacheCluster(ctx, rng, cx, cy + ry * 0.42, rx * 0.78, ry * 0.42, '#ffdf7c', 0.48, 22);
  }

  const drawSunsetRidge = (
    baseY: number,
    amp: number,
    freq: number,
    colTop: string,
    colBot: string,
  ) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) {
      const n = rng.noise1D(x + baseY * 2.1, freq, 4);
      const y = baseY - (n - 0.5) * amp;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, baseY - amp * 0.5, 0, baseY + amp);
    g.addColorStop(0, colTop);
    g.addColorStop(1, colBot);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  };

  drawSunsetRidge(H * 0.6, 140, 0.003, '#56345c', '#985362');
  drawSunsetRidge(H * 0.67, 105, 0.0042, '#3b2647', '#6c3951');
  drawSunsetRidge(H * 0.76, 85, 0.0035, '#8a5130', '#482927');
  drawSunsetRidge(H * 0.84, 75, 0.004, '#693c24', '#28181b');

  ctx.save();
  for (let g = 0; g < 180; g++) {
    const gx = rng.range(0, W);
    const gy = rng.range(H * 0.72, H);
    const w = rng.range(24, 75);
    const h = rng.range(6, 16);
    ctx.fillStyle = g % 3 === 0 ? '#e19039' : g % 2 === 0 ? '#b6612a' : '#552f22';
    ctx.globalAlpha = rng.range(0.22, 0.48);
    ctx.beginPath();
    ctx.ellipse(gx, gy, w, h, rng.range(-0.12, 0.12), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  const millX = W * 0.28;
  const millY = H * 0.73;
  ctx.save();
  ctx.fillStyle = '#22131a';
  ctx.beginPath();
  ctx.moveTo(millX - 18, millY + 20);
  ctx.lineTo(millX - 8, millY - 72);
  ctx.lineTo(millX + 8, millY - 72);
  ctx.lineTo(millX + 18, millY + 20);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(millX, millY - 72, 11, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = '#ffdf73';
  ctx.fillRect(millX - 4, millY - 42, 8, 12);

  ctx.strokeStyle = '#22131a';
  ctx.lineWidth = 3.2;
  const hubX = millX;
  const hubY = millY - 68;
  const baseAngle = rng.range(0.2, 0.7);
  for (let b = 0; b < 4; b++) {
    const a = baseAngle + (b * Math.PI) / 2;
    const tipX = hubX + Math.cos(a) * 68;
    const tipY = hubY + Math.sin(a) * 68;
    ctx.beginPath();
    ctx.moveTo(hubX, hubY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 205, 120, 0.28)';
    ctx.beginPath();
    ctx.moveTo(hubX + Math.cos(a) * 14, hubY + Math.sin(a) * 14);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tipX + Math.cos(a + 1.4) * 14, tipY + Math.sin(a + 1.4) * 14);
    ctx.lineTo(
      hubX + Math.cos(a) * 14 + Math.cos(a + 1.4) * 11,
      hubY + Math.sin(a) * 14 + Math.sin(a + 1.4) * 11,
    );
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  for (let r = 0; r < 240; r++) {
    const rx = rng.range(0, W);
    const ry = rng.range(H * 0.78, H);
    const stemH = rng.range(18, 48);
    const lean = rng.range(4, 14);
    ctx.strokeStyle = r % 4 === 0 ? '#f5bc55' : '#381e1c';
    ctx.lineWidth = rng.range(1.2, 2.4);
    ctx.globalAlpha = rng.range(0.45, 0.85);
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.quadraticCurveTo(rx + lean * 0.5, ry - stemH * 0.5, rx + lean, ry - stemH);
    ctx.stroke();

    if (r % 3 === 0) {
      ctx.fillStyle = '#ffe68f';
      ctx.beginPath();
      ctx.arc(rx + lean, ry - stemH, rng.range(2.2, 4.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  applyWatercolorPaperGrain(ctx, W, H, rng);
}

// ============================================================================
// PROCEDURAL PAINTING 3: "ALPINE MIRROR LAKE"
// ============================================================================
export function paintAlpineMirrorLake(canvas: HTMLCanvasElement, seed = 4092): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  const rng = new SeededRandom(seed + 303);

  const horizonY = H * 0.52;

  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0.0, '#2a6798');
  skyGrad.addColorStop(0.55, '#69acd4');
  skyGrad.addColorStop(1.0, '#e1eff3');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, horizonY + 10);

  for (let c = 0; c < 6; c++) {
    paintGouacheCluster(
      ctx,
      rng,
      rng.range(W * 0.1, W * 0.9),
      rng.range(H * 0.08, H * 0.25),
      rng.range(90, 170),
      rng.range(28, 52),
      '#ffffff',
      0.45,
      24,
    );
  }

  const peakPts: { x: number; y: number }[] = [];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let x = 0; x <= W; x += 8) {
    const n1 = rng.noise1D(x + 50, 0.0032, 4);
    const ridgeEnv = Math.sin((x / W) * Math.PI) * 0.65 + 0.35;
    const y = horizonY - (n1 * 290 * ridgeEnv + 45);
    peakPts.push({ x, y });
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, horizonY);
  ctx.closePath();

  const mtnGrad = ctx.createLinearGradient(0, horizonY - 280, 0, horizonY);
  mtnGrad.addColorStop(0.0, '#f5e4da');
  mtnGrad.addColorStop(0.38, '#98b1c7');
  mtnGrad.addColorStop(1.0, '#3b5b76');
  ctx.fillStyle = mtnGrad;
  ctx.fill();

  for (let i = 1; i < peakPts.length - 1; i += 2) {
    const p = peakPts[i];
    const nextP = peakPts[i + 1];
    const isSunlitSlope = nextP.y > p.y;
    const col = isSunlitSlope ? '#fff2e9' : '#63829f';
    paintGouacheCluster(
      ctx,
      rng,
      p.x,
      p.y + rng.range(18, 85),
      rng.range(14, 34),
      rng.range(24, 58),
      col,
      isSunlitSlope ? 0.42 : 0.32,
      10,
    );
  }
  ctx.restore();

  for (let x = 0; x <= W; x += 14) {
    const isGoldLarch = rng.next() > 0.68;
    const col = isGoldLarch ? '#dd9d38' : rng.next() > 0.5 ? '#1d4d44' : '#2c6959';
    const h = rng.range(24, 64);
    paintGouacheCluster(ctx, rng, x, horizonY - h * 0.35, 12, h * 0.55, col, 0.55, 8);
  }

  const lakeGrad = ctx.createLinearGradient(0, horizonY, 0, H);
  lakeGrad.addColorStop(0.0, '#41809c');
  lakeGrad.addColorStop(0.38, '#26627b');
  lakeGrad.addColorStop(0.75, '#194b5c');
  lakeGrad.addColorStop(1.0, '#285244');
  ctx.fillStyle = lakeGrad;
  ctx.fillRect(0, horizonY, W, H - horizonY);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  for (let i = 0; i < peakPts.length; i++) {
    const p = peakPts[i];
    const dy = horizonY - p.y;
    ctx.lineTo(p.x, horizonY + dy * 0.78);
  }
  ctx.lineTo(W, horizonY);
  ctx.closePath();
  const reflGrad = ctx.createLinearGradient(0, horizonY, 0, horizonY + 240);
  reflGrad.addColorStop(0.0, 'rgba(215, 228, 235, 0.45)');
  reflGrad.addColorStop(0.6, 'rgba(130, 175, 198, 0.25)');
  reflGrad.addColorStop(1.0, 'rgba(40, 100, 125, 0.0)');
  ctx.fillStyle = reflGrad;
  ctx.fill();
  ctx.restore();

  ctx.save();
  for (let r = 0; r < 220; r++) {
    const ry = rng.range(horizonY + 4, H - 15);
    const rx = rng.range(0, W);
    const rw = rng.range(28, 120) * ((ry - horizonY) / (H - horizonY) + 0.3);
    ctx.fillStyle = r % 3 === 0 ? '#a7d4e3' : r % 2 === 0 ? '#5aa2bb' : '#194151';
    ctx.globalAlpha = rng.range(0.16, 0.38);
    ctx.fillRect(rx - rw * 0.5, ry, rw, rng.range(1.5, 3.8));
  }
  ctx.restore();

  for (let s = 0; s < 38; s++) {
    const sx = rng.range(40, W - 40);
    const sy = rng.range(H * 0.82, H - 12);
    const rx = rng.range(14, 38);
    const ry = rx * rng.range(0.48, 0.72);
    const cols = ['#8ea59a', '#c2b097', '#587672', '#d6cdbe', '#6c7e66'];
    ctx.save();
    ctx.fillStyle = cols[s % cols.length];
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, ry, rng.range(-0.2, 0.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(sx - rx * 0.2, sy - ry * 0.2, rx * 0.55, ry * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  paintGouacheCluster(ctx, rng, 65, horizonY + 18, 95, 40, '#1d453c', 0.65, 22);
  paintGouacheCluster(ctx, rng, 95, horizonY + 6, 65, 28, '#e1a63c', 0.62, 18);

  applyWatercolorPaperGrain(ctx, W, H, rng);
}

// ============================================================================
// CANVAS TEXTURE GENERATOR
// ============================================================================
export function createPaintingTexture(
  scene: 'sunset' | 'hills' | 'lake',
  seed = 4092,
  width = 1024,
  height = 1024,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  if (scene === 'hills') {
    paintMistyEvergreenHills(canvas, seed);
  } else if (scene === 'sunset') {
    paintGoldenHourSunset(canvas, seed);
  } else {
    paintAlpineMirrorLake(canvas, seed);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ============================================================================
// 3D BEVELED FRAME & PROCEDURAL ART INTEGRATION
// ============================================================================
const OAK_FRAME = '#b97940'; // Warm quarter-sawn honey oak
const OAK_TRIM = '#7a4422'; // Darker oak inner reveal molding
const MAT_BOARD = '#f5efe3'; // Museum 4-ply cream rag mat
const BEVEL_CORE = '#fffef8'; // 45-degree angled white mat core
const BRASS_ACCENT = '#deb354'; // Aged brass picture light & plaque
const BULB_EMIT = '#ffea9f'; // Warm glowing picture light bulb

/**
 * Builds a mitered warm oak frame with a beveled museum rag mat, aged brass picture light,
 * and brass nameplate into `EnvBuilder` (merging into the room's single draw call),
 * and returns the recessed canvas mesh textured with the procedural gouache painting.
 */
export function frame(
  b: EnvBuilder,
  w: number,
  h: number,
  p: V3,
  ry: number,
  scene: 'sunset' | 'hills' | 'lake',
  seed = 4092,
): THREE.Mesh {
  const fwd = (d: number): V3 => [p[0] + Math.sin(ry) * d, p[1], p[2] + Math.cos(ry) * d];
  const rightVec = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
  const at = (dx: number, dy: number, dz: number): V3 => {
    const f = fwd(dz);
    return [f[0] + rightVec.x * dx, f[1] + dy, f[2] + rightVec.z * dx];
  };

  const qFrame = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);

  // Proportions & offsets
  const ft = Math.max(0.045, Math.min(0.065, Math.min(w, h) * 0.09)); // Frame thickness
  const fd = 0.045; // Frame depth projection from wall
  const innerW = w - ft * 2;
  const innerH = h - ft * 2;

  // 1. Mitered Warm Oak Outer Moulding
  const topRail = roundedBox(w, ft, fd, 0.008, 1);
  b.add(topRail, OAK_FRAME, { p: at(0, (h - ft) / 2, fd / 2), q: qFrame });
  topRail.dispose();

  const botRail = roundedBox(w, ft, fd, 0.008, 1);
  b.add(botRail, OAK_FRAME, { p: at(0, -(h - ft) / 2, fd / 2), q: qFrame });
  botRail.dispose();

  const leftRail = roundedBox(ft, innerH, fd, 0.008, 1);
  b.add(leftRail, OAK_FRAME, { p: at(-(w - ft) / 2, 0, fd / 2), q: qFrame });
  leftRail.dispose();

  const rightRail = roundedBox(ft, innerH, fd, 0.008, 1);
  b.add(rightRail, OAK_FRAME, { p: at((w - ft) / 2, 0, fd / 2), q: qFrame });
  rightRail.dispose();

  // 2. Darker Oak Inner Reveal Trim Lip
  const lt = 0.012;
  const trimW = innerW - lt * 2;
  const trimH = innerH - lt * 2;
  const lipDepth = fd * 0.65;

  const topLip = new THREE.BoxGeometry(innerW, lt, lipDepth);
  b.add(topLip, OAK_TRIM, { p: at(0, innerH / 2 - lt / 2, fd * 0.38), q: qFrame });
  topLip.dispose();

  const botLip = new THREE.BoxGeometry(innerW, lt, lipDepth);
  b.add(botLip, OAK_TRIM, { p: at(0, -innerH / 2 + lt / 2, fd * 0.38), q: qFrame });
  botLip.dispose();

  const leftLip = new THREE.BoxGeometry(lt, trimH, lipDepth);
  b.add(leftLip, OAK_TRIM, { p: at(-innerW / 2 + lt / 2, 0, fd * 0.38), q: qFrame });
  leftLip.dispose();

  const rightLip = new THREE.BoxGeometry(lt, trimH, lipDepth);
  b.add(rightLip, OAK_TRIM, { p: at(innerW / 2 - lt / 2, 0, fd * 0.38), q: qFrame });
  rightLip.dispose();

  // 3. Museum 4-Ply Cream Rag Mat Board
  const mm = Math.max(0.042, Math.min(0.068, Math.min(w, h) * 0.1)); // Mat margin
  const artW = Math.max(0.1, trimW - mm * 2);
  const artH = Math.max(0.1, trimH - mm * 2);
  const matDepth = 0.008;

  const topMat = new THREE.BoxGeometry(trimW, mm, matDepth);
  b.add(topMat, MAT_BOARD, { p: at(0, (artH + mm) / 2, 0.018), q: qFrame });
  topMat.dispose();

  const botMat = new THREE.BoxGeometry(trimW, mm, matDepth);
  b.add(botMat, MAT_BOARD, { p: at(0, -(artH + mm) / 2, 0.018), q: qFrame });
  botMat.dispose();

  const leftMat = new THREE.BoxGeometry(mm, artH, matDepth);
  b.add(leftMat, MAT_BOARD, { p: at(-(artW + mm) / 2, 0, 0.018), q: qFrame });
  leftMat.dispose();

  const rightMat = new THREE.BoxGeometry(mm, artH, matDepth);
  b.add(rightMat, MAT_BOARD, { p: at((artW + mm) / 2, 0, 0.018), q: qFrame });
  rightMat.dispose();

  // 4. 45-Degree Angled Bevel Core Edges
  const bw = 0.01;
  const bevZ = 0.014;

  const qBevTop = qFrame.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4));
  const topBev = new THREE.PlaneGeometry(artW, bw);
  b.add(topBev, BEVEL_CORE, { p: at(0, artH / 2, bevZ), q: qBevTop });
  topBev.dispose();

  const qBevBot = qFrame.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 4));
  const botBev = new THREE.PlaneGeometry(artW, bw);
  b.add(botBev, BEVEL_CORE, { p: at(0, -artH / 2, bevZ), q: qBevBot });
  botBev.dispose();

  const qBevLeft = qFrame.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4));
  const leftBev = new THREE.PlaneGeometry(bw, artH);
  b.add(leftBev, BEVEL_CORE, { p: at(-artW / 2, 0, bevZ), q: qBevLeft });
  leftBev.dispose();

  const qBevRight = qFrame.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 4));
  const rightBev = new THREE.PlaneGeometry(bw, artH);
  b.add(rightBev, BEVEL_CORE, { p: at(artW / 2, 0, bevZ), q: qBevRight });
  rightBev.dispose();

  // 5. Brass Picture Light Fixture Mounted Above the Frame
  const plW = Math.min(artW * 0.88, 0.36);
  const lightY = h / 2 + 0.052;

  const backplate = new THREE.BoxGeometry(0.07, 0.035, 0.016);
  b.add(backplate, BRASS_ACCENT, { p: at(0, lightY - 0.007, 0.008), q: qFrame });
  backplate.dispose();

  const qArm = qFrame.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  const arm = cyl(0.005, 0.005, 0.11, 8);
  b.add(arm, BRASS_ACCENT, { p: at(0, lightY, 0.065), q: qArm });
  arm.dispose();

  const qHood = qFrame.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
  const hood = new THREE.CylinderGeometry(0.015, 0.018, plW, 12, 1, false, 0, Math.PI);
  b.add(hood, BRASS_ACCENT, { p: at(0, lightY + 0.003, 0.115), q: qHood });
  hood.dispose();

  // Emissive tubular bulb glowing with room pendant/lamp light
  const bulb = new THREE.CylinderGeometry(0.006, 0.006, plW * 0.8, 8);
  b.add(bulb, BULB_EMIT, { p: at(0, lightY - 0.004, 0.112), q: qHood }, { emit: PENDANT_LAMP, glow: 1.5 });
  bulb.dispose();

  // 6. Polished Brass Nameplate / Plaque on Lower Rail
  const plaqueW = Math.min(w * 0.34, 0.2);
  const plaque = roundedBox(plaqueW, 0.022, 0.006, 0.002, 1);
  b.add(plaque, BRASS_ACCENT, { p: at(0, -(h - ft) / 2, fd + 0.003), q: qFrame });
  plaque.dispose();

  // 7. Recessed Procedural Gouache Canvas Mesh
  const texAspect = artH / artW;
  const canvasW = 1024;
  const canvasH = Math.round(1024 * Math.max(0.6, Math.min(1.5, texAspect)));
  const tex = createPaintingTexture(scene, seed, canvasW, canvasH);

  const artGeo = new THREE.PlaneGeometry(artW + 0.004, artH + 0.004);
  const artMat = new THREE.MeshLambertMaterial({
    map: tex,
    roughness: 0.88,
  } as THREE.MeshLambertMaterialParameters);
  patchLighting(artMat);

  const artMesh = new THREE.Mesh(artGeo, artMat);
  const canvasP = at(0, 0, 0.01);
  artMesh.position.set(canvasP[0], canvasP[1], canvasP[2]);
  artMesh.rotation.set(0, ry, 0);
  artMesh.receiveShadow = true;
  artMesh.userData = { scene, seed, paintingTitle: scene };

  return artMesh;
}
