// The view out of the big window: a real layered 3D outdoor scene (close trees
// with trunks, branches, and volumetric toon-shaded foliage clusters, mid-distance
// park trees, a grassy courtyard with a winding stone path, far rolling hills and
// campus roofline, a golden-hour sky dome, drifting leaves and distant bird
// silhouettes) seen through slightly glassy window panes with rain support.
//
// Everything outside the window is merged into one static vertex-animated 3D mesh
// (1 draw call) and clipped to the window portal in the fragment shader so it has
// genuine 3D parallax from every camera angle without ever leaking past the room walls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './toon';

export interface WindowView {
  mesh: THREE.Object3D;
  uniforms: Record<string, THREE.IUniform>;
  setLow(low: boolean): void;
  dispose(): void;
}

/** Low tier: pre-drawn rain on glass, scrolled in the shader. */
function paintRain(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 256);
  const r = rng(31);
  for (let i = 0; i < 140; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const rad = 1 + r() * 2.6;
    g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.5})`;
    g.beginPath();
    g.ellipse(x, y, rad, rad * 1.25, 0, 0, Math.PI * 2);
    g.fill();
    if (r() < 0.25) {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x - 0.6, y - 30 * r(), 1.2, 30 * r());
    }
  }
  return c;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _nMat = new THREE.Matrix3();

interface PartOpts {
  p?: [number, number, number];
  r?: [number, number, number];
  q?: THREE.Quaternion;
  s?: number | [number, number, number];
  kind: number;
  sway?: number;
  exposure?: number;
  aux?: number;
  bottomShade?: number;
}

class OutdoorBuilder {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: PartOpts): this {
    const src = geo.clone();
    if (!src.attributes.normal) {
      src.computeVertexNormals();
    }
    const g = src.index ? src.toNonIndexed() : src;
    if (g !== src) src.dispose();

    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    }

    const pos = g.attributes.position as THREE.BufferAttribute;
    const nor = g.attributes.normal as THREE.BufferAttribute;
    const n = pos.count;

    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const y = pos.getY(i);
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    const ySpan = Math.max(1e-4, yMax - yMin);

    _p.set(...(o.p ?? [0, 0, 0]));
    if (o.q) _q.copy(o.q);
    else _q.setFromEuler(_e.set(...(o.r ?? [0, 0, 0])));
    const sv = o.s ?? 1;
    if (typeof sv === 'number') _s.setScalar(sv);
    else _s.set(...sv);

    _m.compose(_p, _q, _s);
    _nMat.getNormalMatrix(_m);

    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(_m);
      pos.setXYZ(i, v.x, v.y, v.z);
      v.fromBufferAttribute(nor, i).applyMatrix3(_nMat).normalize();
      nor.setXYZ(i, v.x, v.y, v.z);
    }

    _c.set(color);
    const colArr = new Float32Array(n * 3);
    const metaArr = new Float32Array(n * 4);
    const bShade = o.bottomShade ?? 0;
    const baseExp = o.exposure ?? 0.5;
    const sway = o.sway ?? 0;
    const aux = o.aux ?? 0;

    for (let i = 0; i < n; i++) {
      const localT =
        bShade > 0
          ? Math.max(0, Math.min(1, (pos.getY(i) - (_p.y + yMin * _s.y)) / (ySpan * _s.y)))
          : 0.5;
      const shadeMul = bShade > 0 ? 1.0 - bShade * (1.0 - localT) : 1.0;
      colArr[i * 3] = _c.r * shadeMul;
      colArr[i * 3 + 1] = _c.g * shadeMul;
      colArr[i * 3 + 2] = _c.b * shadeMul;

      metaArr[i * 4] = o.kind;
      metaArr[i * 4 + 1] = sway;
      metaArr[i * 4 + 2] = Math.max(0, Math.min(1, baseExp * 0.65 + localT * 0.35));
      metaArr[i * 4 + 3] = aux;
    }

    g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    g.setAttribute('aMeta', new THREE.BufferAttribute(metaArr, 4));
    this.parts.push(g);
    return this;
  }

  build(): THREE.BufferGeometry {
    const merged = this.parts.length ? mergeGeometries(this.parts, false)! : new THREE.BufferGeometry();
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    merged.computeBoundingSphere();
    return merged;
  }
}

/**
 * Creates a sculpted 3D foliage cluster with organic multi-lobed surface normals
 * so each cluster has crisp cel-shaded internal sub-volumes as well as overall roundness.
 */
function createFoliagePuffGeo(seed: number): THREE.BufferGeometry {
  const r = rng(seed);
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const p1 = r() * Math.PI * 2;
  const p2 = r() * Math.PI * 2;
  const p3 = r() * Math.PI * 2;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    n.copy(v).normalize();
    const lobe =
      1.0 +
      0.15 * Math.sin(n.x * 3.4 + p1) * Math.cos(n.z * 3.4 + p2) +
      0.11 * Math.sin(n.y * 3.8 + p3) +
      0.07 * Math.cos((n.x - n.z) * 4.5 + p2);
    const ySquash = n.y < 0 ? 0.72 : 0.92;
    v.set(n.x * lobe, n.y * lobe * ySquash, n.z * lobe);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  // Blend 60% computed lobe normal + 40% spherical normal for crisp cartoon puff shading
  const nor = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    n.fromBufferAttribute(nor, i);
    n.lerp(v, 0.4).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

/** Adds a tapered 3D tree limb or trunk segment between two 3D points. */
function addBranchSegment(
  b: OutdoorBuilder,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  r0: number,
  r1: number,
  color: string,
  sway = 0,
  exposure = 0.5,
) {
  const dir = p1.clone().sub(p0);
  const len = dir.length();
  if (len < 1e-3) return;
  const mid = p0.clone().addScaledVector(dir, 0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const cyl = new THREE.CylinderGeometry(r1, r0, len, 9, 1, false);
  b.add(cyl, color, { p: [mid.x, mid.y, mid.z], q, kind: 2, sway, exposure, bottomShade: 0.22 });
  cyl.dispose();
}

interface TreeSpec {
  x: number;
  y: number;
  z: number;
  height: number;
  crownR: number;
  style: 'oak' | 'elm' | 'cypress' | 'bush';
  seed: number;
  tint: string;
}

function build3DTree(b: OutdoorBuilder, puffs: THREE.BufferGeometry[], spec: TreeSpec) {
  const r = rng(spec.seed);
  const { x, y, z, height, crownR, style, tint } = spec;
  const barkCol = r() > 0.45 ? '#664028' : '#543420';
  const barkLight = '#7c5033';

  if (style === 'bush') {
    const count = 8 + Math.floor(r() * 4);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (r() - 0.5) * 0.45;
      const dist = (0.14 + r() * 0.45) * crownR;
      const sx = (0.32 + r() * 0.22) * crownR;
      const sy = sx * (0.72 + r() * 0.2);
      const sz = sx * (0.92 + r() * 0.22);
      const py = y + sy * 0.65 + r() * height * 0.38;
      const puff = puffs[(spec.seed + i) % puffs.length];
      b.add(puff, tint, {
        p: [x + Math.cos(a) * dist, py, z + Math.sin(a) * dist],
        r: [(r() - 0.5) * 0.25, r() * Math.PI * 2, (r() - 0.5) * 0.25],
        s: [sx, sy, sz],
        kind: 1,
        sway: 0.35 + r() * 0.25,
        exposure: 0.28 + ((py - y) / Math.max(0.5, height)) * 0.62,
        bottomShade: 0.35,
      });
    }
    return;
  }

  if (style === 'cypress') {
    const trunkTop = y + height * 0.74;
    addBranchSegment(
      b,
      new THREE.Vector3(x, y - 0.1, z),
      new THREE.Vector3(x, trunkTop, z),
      crownR * 0.18,
      crownR * 0.05,
      barkCol,
      0.08,
      0.4,
    );
    const tiers = 9;
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const ty = y + height * (0.18 + f * 0.78);
      const rad = crownR * (1.0 - f * 0.64) * (0.88 + r() * 0.15);
      const hRad = height * 0.14 * (1.0 - f * 0.3);
      const puff = puffs[(spec.seed + t) % puffs.length];
      b.add(puff, tint, {
        p: [x + (r() - 0.5) * 0.08, ty, z + (r() - 0.5) * 0.08],
        r: [0, r() * Math.PI * 2, 0],
        s: [rad, hRad, rad * 0.96],
        kind: 1,
        sway: 0.2 + f * 0.55,
        exposure: 0.25 + f * 0.72,
        bottomShade: 0.35,
      });
    }
    return;
  }

  // 'oak' or 'elm': full 3D trunk with root flare, main trunk bend, forked limbs, and 20-26 finer 3D foliage clusters
  const trunkBaseR = crownR * (style === 'oak' ? 0.14 : 0.115);
  const trunkMidR = trunkBaseR * 0.74;
  const trunkTopR = trunkBaseR * 0.48;

  const leanX = (r() - 0.5) * 0.24;
  const leanZ = (r() - 0.5) * 0.28;
  const pBase = new THREE.Vector3(x, y - 0.08, z);
  const pMid = new THREE.Vector3(x + leanX * 0.5, y + height * 0.24, z + leanZ * 0.5);
  const pFork = new THREE.Vector3(x + leanX, y + height * 0.44, z + leanZ);

  for (let k = 0; k < 3; k++) {
    const ra = (k / 3) * Math.PI * 2 + r() * 0.5;
    addBranchSegment(
      b,
      new THREE.Vector3(x + Math.cos(ra) * trunkBaseR * 1.45, y - 0.06, z + Math.sin(ra) * trunkBaseR * 1.45),
      new THREE.Vector3(x + Math.cos(ra) * trunkBaseR * 0.35, y + 0.26, z + Math.sin(ra) * trunkBaseR * 0.35),
      trunkBaseR * 0.45,
      trunkBaseR * 0.22,
      barkCol,
      0,
      0.25,
    );
  }

  addBranchSegment(b, pBase, pMid, trunkBaseR, trunkMidR, barkCol, 0.02, 0.38);
  addBranchSegment(b, pMid, pFork, trunkMidR, trunkTopR, barkLight, 0.06, 0.5);

  const shadowDisc = new THREE.CylinderGeometry(crownR * 0.78, crownR * 0.82, 0.02, 12);
  b.add(shadowDisc, '#2e4524', {
    p: [x, y + 0.01, z],
    kind: 3,
    exposure: 0.08,
  });
  shadowDisc.dispose();

  const limbCount = style === 'oak' ? 6 : 5;
  const branchTips: THREE.Vector3[] = [];
  for (let i = 0; i < limbCount; i++) {
    const az = (i / limbCount) * Math.PI * 2 + (r() - 0.5) * 0.38;
    const startT = 0.55 + (i % 2) * 0.42;
    const bStart = pMid.clone().lerp(pFork, startT);
    const reach = crownR * (0.56 + r() * 0.28);
    const rise = height * (0.22 + r() * 0.18);
    const bEnd = new THREE.Vector3(
      bStart.x + Math.cos(az) * reach * 0.82,
      bStart.y + rise,
      bStart.z + Math.sin(az) * reach,
    );
    addBranchSegment(b, bStart, bEnd, trunkTopR * 0.76, trunkTopR * 0.28, barkLight, 0.18, 0.55);
    branchTips.push(bEnd);

    const subAz = az + (i % 2 === 0 ? 0.52 : -0.52);
    const subStart = bStart.clone().lerp(bEnd, 0.52);
    const subEnd = new THREE.Vector3(
      subStart.x + Math.cos(subAz) * reach * 0.48,
      subStart.y + rise * 0.55,
      subStart.z + Math.sin(subAz) * reach * 0.5,
    );
    addBranchSegment(b, subStart, subEnd, trunkTopR * 0.42, trunkTopR * 0.16, barkLight, 0.25, 0.6);
    branchTips.push(subEnd);
  }

  const apexPos = new THREE.Vector3(pFork.x + (r() - 0.5) * 0.14, y + height * 0.82, pFork.z + (r() - 0.5) * 0.14);
  addBranchSegment(b, pFork, apexPos, trunkTopR * 0.6, trunkTopR * 0.18, barkLight, 0.22, 0.72);
  branchTips.push(apexPos);

  // Inner canopy core cluster above the main fork so rays never see sky holes through the middle of a tree crown
  const corePuff = puffs[spec.seed % puffs.length];
  b.add(corePuff, tint, {
    p: [pFork.x, y + height * 0.60, pFork.z],
    r: [0, r() * Math.PI * 2, 0],
    s: [crownR * 0.58, crownR * 0.46, crownR * 0.64],
    kind: 1,
    sway: 0.35,
    exposure: 0.42,
    bottomShade: 0.38,
  });

  // Build volumetric 3D foliage clusters: 3 smaller overlapping puffs per branch node
  // so the tree crown reads as rich, billowy, multi-layered cartoon foliage with clear depth!
  for (let i = 0; i < branchTips.length; i++) {
    const tip = branchTips[i];
    const isApex = i === branchTips.length - 1;
    const relY = Math.max(0, Math.min(1, (tip.y - (y + height * 0.35)) / (height * 0.55)));
    const baseRad = crownR * (isApex ? 0.36 : 0.28 + r() * 0.11);
    const sunwardBoost = (tip.z < z ? 0.18 : -0.08) + (tip.x > x ? 0.08 : -0.05);

    for (let sub = 0; sub < 3; sub++) {
      const ang = sub * 2.1 + r() * 0.8;
      const offR = sub === 0 ? 0 : baseRad * (0.52 + r() * 0.25);
      const offY = sub === 0 ? baseRad * 0.25 : (sub === 1 ? -0.18 : 0.42) * baseRad;
      const rad = baseRad * (sub === 0 ? 1.05 : 0.76 + r() * 0.24);
      const sy = rad * (style === 'elm' ? 0.68 : 0.78 + r() * 0.14);
      const sz = rad * (1.05 + r() * 0.18);
      const puff = puffs[(spec.seed + i * 3 + sub) % puffs.length];
      const exp = Math.max(
        0.08,
        Math.min(1.0, 0.22 + relY * 0.62 + sunwardBoost + (sub === 2 ? 0.16 : sub === 1 ? -0.14 : 0.0)),
      );

      b.add(puff, tint, {
        p: [tip.x + Math.cos(ang) * offR * 0.85, tip.y + offY, tip.z + Math.sin(ang) * offR],
        r: [(r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3],
        s: [rad, sy, sz],
        kind: 1,
        sway: 0.42 + relY * 0.45 + sub * 0.08,
        exposure: exp,
        bottomShade: 0.38,
      });
    }
  }
}

function buildOutdoorWorldGeometry(z0: number, z1: number, y0: number, y1: number, xWin: number): THREE.BufferGeometry {
  const b = new OutdoorBuilder();
  const r = rng(904);
  const zMid = (z0 + z1) / 2; // 0.85

  const puffs = [
    createFoliagePuffGeo(101),
    createFoliagePuffGeo(202),
    createFoliagePuffGeo(303),
    createFoliagePuffGeo(404),
    createFoliagePuffGeo(505),
  ];

  // -------------------------------------------------------------------------
  // 1. SKY DOME / CURVED HORIZON BACKDROP (kind = 0)
  // -------------------------------------------------------------------------
  const skySegsZ = 36;
  const skySegsY = 14;
  const skyPositions: number[] = [];
  const skyNormals: number[] = [];
  const skyIndices: number[] = [];
  for (let iy = 0; iy <= skySegsY; iy++) {
    const v = iy / skySegsY;
    const wy = -12.0 + v * 32.0; // -12.0 .. +20.0
    for (let iz = 0; iz <= skySegsZ; iz++) {
      const u = iz / skySegsZ;
      const ang = (u - 0.5) * Math.PI * 0.96;
      const rad = 23.0;
      const wx = xWin - Math.cos(ang) * rad;
      const wz = zMid + Math.sin(ang) * rad * 1.85;
      skyPositions.push(wx, wy, wz);
      skyNormals.push(Math.cos(ang), 0, -Math.sin(ang));
    }
  }
  const stride = skySegsZ + 1;
  for (let iy = 0; iy < skySegsY; iy++) {
    for (let iz = 0; iz < skySegsZ; iz++) {
      const a = iy * stride + iz;
      const c = (iy + 1) * stride + iz;
      const d = (iy + 1) * stride + (iz + 1);
      const e = iy * stride + (iz + 1);
      skyIndices.push(a, c, e, c, d, e);
    }
  }
  const skyGeo = new THREE.BufferGeometry();
  skyGeo.setIndex(skyIndices);
  skyGeo.setAttribute('position', new THREE.Float32BufferAttribute(skyPositions, 3));
  skyGeo.setAttribute('normal', new THREE.Float32BufferAttribute(skyNormals, 3));
  b.add(skyGeo, '#ffffff', { kind: 0, exposure: 1.0 });
  skyGeo.dispose();

  // -------------------------------------------------------------------------
  // 2. GROUND PLANE, SLOPING PARK TERRACE & GARDEN PATH (kind = 3)
  // -------------------------------------------------------------------------
  const groundY = (wx: number, wz: number) => {
    const dist = Math.max(0, xWin - wx);
    return 0.22 + dist * 0.075 + Math.sin(wz * 0.32 + dist * 0.18) * 0.09;
  };

  const gxSegs = 18;
  const gzSegs = 32;
  const gPos: number[] = [];
  const gIdx: number[] = [];
  for (let ix = 0; ix <= gxSegs; ix++) {
    const tx = ix / gxSegs;
    const wx = xWin - 0.08 - tx * 22.5;
    for (let iz = 0; iz <= gzSegs; iz++) {
      const tz = iz / gzSegs;
      const wz = zMid + (tz - 0.5) * 68.0; // spans z from -33 to +35 so no sightline ever misses
      gPos.push(wx, groundY(wx, wz), wz);
    }
  }
  const gStride = gzSegs + 1;
  for (let ix = 0; ix < gxSegs; ix++) {
    for (let iz = 0; iz < gzSegs; iz++) {
      const a = ix * gStride + iz;
      const c = (ix + 1) * gStride + iz;
      const d = (ix + 1) * gStride + (iz + 1);
      const e = ix * gStride + (iz + 1);
      gIdx.push(a, c, e, c, d, e);
    }
  }
  const lawnGeo = new THREE.BufferGeometry();
  lawnGeo.setIndex(gIdx);
  lawnGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
  lawnGeo.computeVertexNormals();
  b.add(lawnGeo, '#5c873e', { kind: 3, exposure: 0.75 });
  lawnGeo.dispose();

  // Sunlit grassy mounds
  const moundCoords: [number, number, number, number, string][] = [
    [xWin - 2.4, zMid - 2.2, 2.4, 0.28, '#689447'],
    [xWin - 3.2, zMid + 2.2, 2.6, 0.32, '#557d3a'],
    [xWin - 5.8, zMid - 1.6, 3.4, 0.42, '#6e994b'],
    [xWin - 7.5, zMid + 2.6, 3.6, 0.44, '#5e8741'],
    [xWin - 9.8, zMid - 3.4, 4.4, 0.56, '#729c50'],
  ];
  for (const [mx, mz, mr, mh, mcol] of moundCoords) {
    const my = groundY(mx, mz);
    const dome = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    b.add(dome, mcol, { p: [mx, my - 0.05, mz], s: [mr * 0.85, mh, mr * 1.15], kind: 3, exposure: 0.8 });
    dome.dispose();
  }

  // Winding warm stone/gravel garden path
  const pathSteps = 24;
  for (let i = 0; i < pathSteps; i++) {
    const t = i / (pathSteps - 1);
    const px = xWin - 0.8 - t * 14.0;
    const pz = zMid + 0.15 - t * 1.8 + Math.sin(t * 3.8 - 0.3) * 1.35;
    const py = groundY(px, pz) + 0.025;
    const pw = 0.72 + t * 0.25;
    const slab = new THREE.BoxGeometry(0.76, 0.045, pw);
    b.add(slab, i % 2 === 0 ? '#dfc9a2' : '#d2ba92', {
      p: [px, py, pz],
      r: [0, Math.cos(t * 3.8 - 0.3) * 0.28, 0.06],
      kind: 3,
      exposure: 0.92,
      aux: 1.0,
    });
    slab.dispose();
  }

  // Low warm stone garden wall in the mid-distance (x ≈ xWin - 5.2)
  const wallX = xWin - 5.2;
  for (let wz = zMid - 10.5; wz <= zMid + 7.5; wz += 1.2) {
    if (Math.abs(wz - (zMid - 0.3)) < 0.85) continue;
    const wy = groundY(wallX, wz);
    const seg = new THREE.BoxGeometry(0.28, 0.46, 1.16);
    b.add(seg, '#c8b28e', { p: [wallX, wy + 0.22, wz], kind: 3, exposure: 0.7, bottomShade: 0.22, aux: 1.0 });
    const cap = new THREE.BoxGeometry(0.34, 0.07, 1.20);
    b.add(cap, '#dfd0b4', { p: [wallX, wy + 0.47, wz], kind: 3, exposure: 0.9, aux: 1.0 });
    seg.dispose();
    cap.dispose();
  }

  // -------------------------------------------------------------------------
  // 3. LAYERED 3D TREES: CLOSE, MID-DISTANCE, AND FAR PARK CANOPY (kind = 1, 2)
  // -------------------------------------------------------------------------
  const treeTints = ['#4e8e38', '#3f802e', '#5ca042', '#357228', '#488834'];

  const trees: TreeSpec[] = [
    // --- LAYER 1: Close Hero Trees (x ≈ xWin - 1.50 to xWin - 2.4) ---
    // Canopies reach y = 4.0..4.5m while trunks & forked branches frame the lower/mid window panes (y = 1.1..2.6m)
    { x: xWin - 1.55, y: groundY(xWin - 1.55, zMid - 1.25), z: zMid - 1.25, height: 4.15, crownR: 1.62, style: 'oak', seed: 11, tint: treeTints[0] },
    { x: xWin - 1.80, y: groundY(xWin - 1.80, zMid + 1.05), z: zMid + 1.05, height: 4.25, crownR: 1.58, style: 'elm', seed: 23, tint: treeTints[2] },
    { x: xWin - 1.60, y: groundY(xWin - 1.60, zMid - 2.85), z: zMid - 2.85, height: 4.35, crownR: 1.72, style: 'oak', seed: 41, tint: treeTints[4] },
    { x: xWin - 2.15, y: groundY(xWin - 2.15, zMid - 2.05), z: zMid - 2.05, height: 4.45, crownR: 1.75, style: 'oak', seed: 44, tint: treeTints[1] },
    { x: xWin - 1.75, y: groundY(xWin - 1.75, zMid - 4.25), z: zMid - 4.25, height: 4.45, crownR: 1.78, style: 'elm', seed: 47, tint: treeTints[2] },
    { x: xWin - 1.95, y: groundY(xWin - 1.95, zMid - 5.65), z: zMid - 5.65, height: 4.55, crownR: 1.82, style: 'oak', seed: 48, tint: treeTints[0] },
    { x: xWin - 1.90, y: groundY(xWin - 1.90, zMid + 2.65), z: zMid + 2.65, height: 4.20, crownR: 1.62, style: 'oak', seed: 45, tint: treeTints[4] },
    // Close garden shrubs & tall hedgerow foliage flanking the path & lower/mid window sightlines
    { x: xWin - 1.25, y: groundY(xWin - 1.25, zMid - 0.15), z: zMid - 0.15, height: 1.45, crownR: 0.85, style: 'bush', seed: 31, tint: treeTints[1] },
    { x: xWin - 1.35, y: groundY(xWin - 1.35, zMid + 2.15), z: zMid + 2.15, height: 1.55, crownR: 0.90, style: 'bush', seed: 37, tint: treeTints[3] },
    { x: xWin - 1.30, y: groundY(xWin - 1.30, zMid - 1.85), z: zMid - 1.85, height: 1.85, crownR: 1.08, style: 'bush', seed: 43, tint: treeTints[2] },
    { x: xWin - 1.28, y: groundY(xWin - 1.28, zMid - 2.95), z: zMid - 2.95, height: 2.25, crownR: 1.22, style: 'bush', seed: 49, tint: treeTints[0] },
    { x: xWin - 1.35, y: groundY(xWin - 1.35, zMid - 4.05), z: zMid - 4.05, height: 2.35, crownR: 1.28, style: 'bush', seed: 50, tint: treeTints[3] },
    { x: xWin - 1.45, y: groundY(xWin - 1.45, zMid - 5.20), z: zMid - 5.20, height: 2.45, crownR: 1.32, style: 'bush', seed: 52, tint: treeTints[1] },

    // --- LAYER 2: Mid-Distance Park Trees (x ≈ xWin - 3.1 to xWin - 8.2) ---
    { x: xWin - 3.1, y: groundY(xWin - 3.1, zMid - 1.85), z: zMid - 1.85, height: 4.55, crownR: 1.78, style: 'oak', seed: 51, tint: treeTints[1] },
    { x: xWin - 3.4, y: groundY(xWin - 3.4, zMid - 0.35), z: zMid - 0.35, height: 4.65, crownR: 1.82, style: 'oak', seed: 53, tint: treeTints[2] },
    { x: xWin - 3.6, y: groundY(xWin - 3.6, zMid - 3.25), z: zMid - 3.25, height: 4.65, crownR: 1.82, style: 'elm', seed: 59, tint: treeTints[0] },
    { x: xWin - 3.9, y: groundY(xWin - 3.9, zMid - 4.75), z: zMid - 4.75, height: 4.75, crownR: 1.88, style: 'oak', seed: 63, tint: treeTints[4] },
    { x: xWin - 4.2, y: groundY(xWin - 4.2, zMid + 2.10), z: zMid + 2.10, height: 4.65, crownR: 1.75, style: 'elm', seed: 61, tint: treeTints[0] },
    { x: xWin - 4.6, y: groundY(xWin - 4.6, zMid - 3.60), z: zMid - 3.60, height: 4.85, crownR: 1.15, style: 'cypress', seed: 67, tint: treeTints[3] },
    { x: xWin - 5.0, y: groundY(xWin - 5.0, zMid - 5.85), z: zMid - 5.85, height: 4.95, crownR: 1.92, style: 'oak', seed: 71, tint: treeTints[2] },
    { x: xWin - 5.4, y: groundY(xWin - 5.4, zMid + 0.70), z: zMid + 0.70, height: 4.90, crownR: 1.88, style: 'oak', seed: 73, tint: treeTints[4] },
    { x: xWin - 5.8, y: groundY(xWin - 5.8, zMid - 1.65), z: zMid - 1.65, height: 4.85, crownR: 1.85, style: 'elm', seed: 79, tint: treeTints[1] },
    { x: xWin - 6.4, y: groundY(xWin - 6.4, zMid - 4.20), z: zMid - 4.20, height: 5.05, crownR: 1.95, style: 'oak', seed: 83, tint: treeTints[2] },
    { x: xWin - 6.8, y: groundY(xWin - 6.8, zMid + 2.90), z: zMid + 2.90, height: 5.10, crownR: 1.20, style: 'cypress', seed: 89, tint: treeTints[3] },
    { x: xWin - 7.5, y: groundY(xWin - 7.5, zMid - 0.45), z: zMid - 0.45, height: 5.15, crownR: 1.90, style: 'elm', seed: 97, tint: treeTints[2] },
    { x: xWin - 7.8, y: groundY(xWin - 7.8, zMid - 2.95), z: zMid - 2.95, height: 5.20, crownR: 1.95, style: 'oak', seed: 101, tint: treeTints[0] },
    { x: xWin - 8.0, y: groundY(xWin - 8.0, zMid - 5.60), z: zMid - 5.60, height: 5.25, crownR: 2.00, style: 'oak', seed: 105, tint: treeTints[4] },

    // Mid-distance hedgerow bushes
    { x: xWin - 2.8, y: groundY(xWin - 2.8, zMid - 2.35), z: zMid - 2.35, height: 1.60, crownR: 1.05, style: 'bush', seed: 102, tint: treeTints[3] },
    { x: xWin - 3.3, y: groundY(xWin - 3.3, zMid - 3.95), z: zMid - 3.95, height: 1.65, crownR: 1.08, style: 'bush', seed: 104, tint: treeTints[1] },
    { x: xWin - 4.7, y: groundY(xWin - 4.7, zMid - 1.15), z: zMid - 1.15, height: 1.55, crownR: 0.98, style: 'bush', seed: 103, tint: treeTints[2] },
    { x: xWin - 4.8, y: groundY(xWin - 4.8, zMid + 1.65), z: zMid + 1.65, height: 1.60, crownR: 1.00, style: 'bush', seed: 107, tint: treeTints[0] },
    { x: xWin - 4.9, y: groundY(xWin - 4.9, zMid - 2.85), z: zMid - 2.85, height: 1.65, crownR: 1.08, style: 'bush', seed: 109, tint: treeTints[4] },
    { x: xWin - 5.2, y: groundY(xWin - 5.2, zMid - 4.55), z: zMid - 4.55, height: 1.70, crownR: 1.12, style: 'bush', seed: 111, tint: treeTints[2] },

    // --- LAYER 3: Far Park Canopy Trees (x ≈ xWin - 9.5 to xWin - 13.0) ---
    { x: xWin - 9.6, y: groundY(xWin - 9.6, zMid - 2.2), z: zMid - 2.2, height: 4.6, crownR: 1.85, style: 'oak', seed: 113, tint: treeTints[4] },
    { x: xWin - 10.2, y: groundY(xWin - 10.2, zMid + 1.4), z: zMid + 1.4, height: 4.7, crownR: 1.90, style: 'oak', seed: 127, tint: treeTints[2] },
    { x: xWin - 10.8, y: groundY(xWin - 10.8, zMid - 4.8), z: zMid - 4.8, height: 4.8, crownR: 1.95, style: 'oak', seed: 131, tint: treeTints[0] },
    { x: xWin - 11.4, y: groundY(xWin - 11.4, zMid - 0.4), z: zMid - 0.4, height: 5.0, crownR: 1.15, style: 'cypress', seed: 137, tint: treeTints[1] },
    { x: xWin - 12.0, y: groundY(xWin - 12.0, zMid - 7.4), z: zMid - 7.4, height: 4.9, crownR: 1.95, style: 'elm', seed: 139, tint: treeTints[2] },
    { x: xWin - 12.4, y: groundY(xWin - 12.4, zMid - 9.8), z: zMid - 9.8, height: 5.0, crownR: 2.05, style: 'oak', seed: 149, tint: treeTints[0] },
  ];

  for (const t of trees) {
    build3DTree(b, puffs, t);
  }

  // -------------------------------------------------------------------------
  // 4. FAR HILLS, DISTANT TREELINE RIDGES & CAMPUS ARCHITECTURE (kind = 4)
  // -------------------------------------------------------------------------
  const buildings = [
    { x: xWin - 13.0, z: zMid - 4.2, w: 1.9, d: 2.4, h: 3.6, col: '#e3c396', roof: '#b56e48' },
    { x: xWin - 13.4, z: zMid - 1.4, w: 1.7, d: 2.0, h: 4.2, col: '#ead0a8', roof: '#9e5d3c' },
    { x: xWin - 13.2, z: zMid + 1.8, w: 1.9, d: 2.3, h: 3.4, col: '#dec094', roof: '#ad6844' },
  ];
  for (const bd of buildings) {
    const by = groundY(bd.x, bd.z);
    const body = new THREE.BoxGeometry(bd.w, bd.h, bd.d);
    b.add(body, bd.col, { p: [bd.x, by + bd.h / 2, bd.z], kind: 4, exposure: 0.78, bottomShade: 0.2 });
    body.dispose();
    const roof = new THREE.ConeGeometry(Math.hypot(bd.w, bd.d) * 0.56, 0.95, 4);
    b.add(roof, bd.roof, { p: [bd.x, by + bd.h + 0.47, bd.z], r: [0, Math.PI / 4, 0], kind: 4, exposure: 0.9 });
    roof.dispose();
    for (let wy = by + bd.h - 1.2; wy <= by + bd.h - 0.45; wy += 0.65) {
      for (let wz = bd.z - bd.d * 0.28; wz <= bd.z + bd.d * 0.28; wz += 0.55) {
        const winPane = new THREE.BoxGeometry(0.06, 0.34, 0.24);
        b.add(winPane, '#ffe4a0', { p: [bd.x + bd.w / 2 + 0.02, wy, wz], kind: 4, exposure: 0.95, aux: 1.0 });
        winPane.dispose();
      }
    }
  }

  // Rolling 3D hill ridges spanning z from -26 to +26
  const hillRidges = [
    { x: xWin - 15.5, baseH: 3.2, amp: 0.95, thick: 3.4, col: '#76995c', exp: 0.68, seed: 1.1 },
    { x: xWin - 19.0, baseH: 4.2, amp: 1.25, thick: 4.0, col: '#92ab74', exp: 0.86, seed: 2.7 },
  ];
  for (const hr of hillRidges) {
    const segs = 44;
    for (let i = 0; i < segs; i++) {
      const u = (i / (segs - 1) - 0.5) * 52.0;
      const wz = zMid + u;
      const hillH =
        hr.baseH +
        Math.sin(u * 0.35 + hr.seed) * hr.amp * 0.6 +
        Math.cos(u * 0.68 - hr.seed) * hr.amp * 0.4;
      const puff = puffs[(i + Math.round(hr.seed * 10)) % puffs.length];
      b.add(puff, hr.col, {
        p: [hr.x + Math.sin(i * 1.7) * 0.4, hillH * 0.64, wz],
        r: [0, i * 0.5, 0],
        s: [hr.thick * 0.68, hillH * 0.74, 1.65],
        kind: 4,
        exposure: hr.exp,
        bottomShade: 0.26,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 5. SUBTLE AMBIENT LIFE: DRIFTING GOLDEN LEAVES (kind = 5) & BIRDS (kind = 6)
  // -------------------------------------------------------------------------
  const leafGeo = new THREE.OctahedronGeometry(0.042, 0);
  leafGeo.scale(1.3, 0.28, 0.75);
  const leafCols = ['#e6b84c', '#d9963b', '#9ec258', '#e8c96b'];
  for (let i = 0; i < 16; i++) {
    const lx = xWin - 1.1 - r() * 4.2;
    const ly = y0 + 0.4 + r() * (y1 - y0 - 0.4);
    const lz = z0 - 0.8 + r() * (z1 - z0 + 1.6);
    b.add(leafGeo, leafCols[i % leafCols.length], {
      p: [lx, ly, lz],
      r: [r() * 3, r() * 3, r() * 3],
      kind: 5,
      sway: i * 1.73 + r(),
      exposure: 0.95,
      aux: 0.6 + r() * 0.6,
    });
  }
  leafGeo.dispose();

  for (let i = 0; i < 4; i++) {
    const bx = xWin - 11.5 - i * 1.4;
    const by = y1 - 0.35 + (i % 2) * 0.32 + r() * 0.2;
    const bz = zMid - 1.6 + i * 1.05;
    for (const side of [-1, 1]) {
      const wing = new THREE.BoxGeometry(0.03, 0.014, 0.11);
      b.add(wing, '#594a3c', {
        p: [bx, by, bz + side * 0.05],
        r: [side * 0.28, 0, 0],
        kind: 6,
        sway: i * 2.1,
        exposure: 0.8,
        aux: side,
      });
      wing.dispose();
    }
  }

  puffs.forEach((p) => p.dispose());
  return b.build();
}

export function buildWindowView(z0: number, z1: number, y0: number, y1: number, x: number): WindowView {
  const rainTex = new THREE.CanvasTexture(paintRain());
  rainTex.colorSpace = THREE.NoColorSpace;
  rainTex.wrapS = THREE.RepeatWrapping;
  rainTex.wrapT = THREE.RepeatWrapping;
  rainTex.generateMipmaps = true;
  rainTex.minFilter = THREE.LinearMipmapLinearFilter;

  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uRainTex: { value: rainTex },
    uSize: { value: new THREE.Vector2(z1 - z0, y1 - y0) },
    uWinPlane: { value: new THREE.Vector3(x + 0.12, (y0 + y1) / 2, (z0 + z1) / 2) },
    uWinBounds: { value: new THREE.Vector4(z0 - 0.14, z1 + 0.14, y0 - 0.14, y1 + 0.14) },
    uSkyTop: { value: new THREE.Color('#f6d6a6') },
    uSkyBot: { value: new THREE.Color('#fff3d6') },
    uSunCol: { value: new THREE.Color('#fff4d6') },
    uSun: { value: new THREE.Vector3(0.82, 0.3, 2.0) },
    uCityCol: { value: new THREE.Color('#e2c6a0') },
    uCityHaze: { value: 0.6 },
    uTreeCol: { value: new THREE.Color('#1f5222') },
    uTreeLit: { value: new THREE.Color('#549c36') },
    uLights: { value: 0 },
    uStars: { value: 0 },
    uRain: { value: 0 },
    uGlass: { value: new THREE.Color('#fff2d8') },
    uLow: { value: 0 },
  };

  const outdoorGeo = buildOutdoorWorldGeometry(z0, z1, y0, y1, x);
  const outdoorMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec4 aMeta;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying vec4 vMeta;

      void main() {
        vec3 pos = position;
        vec3 norm = normal;
        float kind = aMeta.x;
        float sway = aMeta.y;

        if ((kind > 0.5 && kind < 2.5) && sway > 0.01) {
          float ph = pos.x * 0.9 + pos.z * 1.4 + pos.y * 0.7;
          float w1 = sin(uTime * 1.15 + ph) * 0.038 + sin(uTime * 2.3 + ph * 1.6) * 0.014;
          float w2 = cos(uTime * 0.95 + ph * 1.2) * 0.028;
          pos.z += sway * w1;
          pos.y += sway * w2 * 0.45;
        } else if (kind > 4.5 && kind < 5.5) {
          float seed = sway;
          float cycle = fract(uTime * 0.055 * aMeta.w + seed * 0.37);
          pos.y -= (cycle - 0.5) * 1.35;
          pos.z += sin(uTime * 0.85 + seed * 4.0) * 0.28 + (cycle - 0.5) * 0.55;
          pos.x += cos(uTime * 0.7 + seed * 3.0) * 0.16;
        } else if (kind > 5.5) {
          float seed = sway;
          float side = aMeta.w;
          float glide = mod(uTime * 0.32 + seed * 1.9, 6.4) - 3.2;
          pos.z += glide;
          pos.y += sin(uTime * 0.6 + seed) * 0.08 + abs(side) * sin(uTime * 5.2 + seed * 3.0) * 0.028;
        }

        vec4 wPos = modelMatrix * vec4(pos, 1.0);
        vWorld = wPos.xyz;
        vNormal = normalize(mat3(modelMatrix) * norm);
        vColor = color;
        vMeta = aMeta;
        gl_Position = projectionMatrix * viewMatrix * wPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying vec4 vMeta;

      uniform float uTime;
      uniform vec3 uWinPlane;
      uniform vec4 uWinBounds;
      uniform vec3 uSkyTop, uSkyBot, uSunCol, uCityCol, uTreeCol, uTreeLit;
      uniform vec3 uSun;
      uniform float uCityHaze, uLights, uStars, uRain;

      float hash2(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        float dx = vWorld.x - cameraPosition.x;
        float tClip = (uWinPlane.x - cameraPosition.x) / min(dx, -1e-4);
        vec2 qClip = cameraPosition.zy + tClip * (vWorld.zy - cameraPosition.zy);
        if (
          tClip < 0.0 ||
          qClip.x < uWinBounds.x || qClip.x > uWinBounds.y ||
          qClip.y < uWinBounds.z || qClip.y > uWinBounds.w
        ) {
          discard;
        }

        vec3 rd = normalize(vWorld - cameraPosition);
        float kind = vMeta.x;
        float exposure = vMeta.z;

        float skyElev = clamp((rd.y + 0.32) * 1.45, 0.0, 1.0);
        vec3 skyCol = mix(uSkyBot, uSkyTop, smoothstep(0.0, 1.0, skyElev));
        vec2 sunAng = vec2(rd.z - 0.18, rd.y - 0.08);
        float sunHalo = exp(-length(sunAng) * 2.8) * 0.72 + exp(-length(sunAng) * 7.5) * 0.45;
        skyCol += uSunCol * sunHalo * clamp(uSun.z, 0.0, 2.2) * 0.55;

        if (kind < 0.5) {
          if (uStars > 0.01) {
            vec2 sUv = vec2(atan(rd.z, -rd.x) * 95.0, rd.y * 95.0);
            vec2 sg = floor(sUv);
            vec2 sf = fract(sUv) - 0.5 - (vec2(hash2(sg + 1.7), hash2(sg + 5.3)) - 0.5) * 0.45;
            float starDot = smoothstep(0.18, 0.03, length(sf));
            float st = step(0.965, hash2(sg)) * starDot * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + hash2(sg + 3.1) * 40.0)) * smoothstep(0.06, 0.38, rd.y);
            skyCol += vec3(0.85, 0.92, 1.0) * st * 0.85;
          }
          gl_FragColor = vec4(skyCol, 1.0);
          #include <colorspace_fragment>
          return;
        }

        vec3 N = normalize(vNormal);
        vec3 L = normalize(vec3(0.45, 0.76, -0.46));
        float ndl = dot(N, L);
        // Crisp 3-step cartoon cel-shading bands
        float band1 = smoothstep(-0.22, -0.04, ndl);
        float band2 = smoothstep(0.12, 0.30, ndl);
        float band3 = smoothstep(0.48, 0.66, ndl);
        float toon = band1 * 0.42 + band2 * 0.36 + band3 * 0.22;
        // Cleanly separate daytime (clear & rain) from nighttime (clear & rain)
        float dayAmt = clamp((uSkyBot.r + uSkyBot.g - 0.68) * 1.35, 0.0, 1.0);

        vec3 col = vColor;

        if (kind < 1.5) {
          // 1.0: Volumetric 3D Foliage Clusters — vibrant botanical greens by day, deep moonlit forest greens by night
          float crownLit = clamp(toon * 0.62 + exposure * 0.44, 0.0, 1.0);
          vec3 leafMod = clamp(vColor / vec3(0.31, 0.56, 0.22), 0.78, 1.24);

          vec3 dayShadow = uTreeCol * leafMod * vec3(0.75, 0.94, 0.70);
          vec3 dayMid = mix(uTreeCol, uTreeLit, 0.55) * leafMod * vec3(0.82, 1.08, 0.74);
          vec3 dayHigh = uTreeLit * leafMod * vec3(0.94, 1.18, 0.74) + uSunCol * vec3(0.03, 0.04, 0.01);

          vec3 nightShadow = mix(uTreeCol, vec3(0.04, 0.14, 0.09), 0.45) * leafMod * vec3(0.72, 0.95, 0.80);
          vec3 nightMid = mix(uTreeCol, uTreeLit, 0.54) * leafMod * vec3(0.78, 1.06, 0.86);
          vec3 nightHigh = uTreeLit * leafMod * vec3(0.82, 1.16, 0.92) + vec3(0.015, 0.045, 0.035);

          vec3 deepShadow = mix(nightShadow, dayShadow, dayAmt);
          vec3 midGreen = mix(nightMid, dayMid, dayAmt);
          vec3 topHighlight = mix(nightHigh, dayHigh, dayAmt);

          col = mix(deepShadow, midGreen, smoothstep(0.12, 0.52, crownLit));
          col = mix(col, topHighlight, smoothstep(0.54, 0.88, crownLit));

          // Subtle sunlit or moonlit rim on upper-left foliage edges
          float rim = pow(clamp(0.5 + 0.5 * dot(N, normalize(vec3(0.25, 0.85, -0.45))), 0.0, 1.0), 3.0);
          vec3 rimCol = mix(vec3(0.12, 0.32, 0.22), uTreeLit * vec3(0.95, 1.25, 0.75), dayAmt);
          col += rimCol * rim * exposure * mix(0.08, 0.14, dayAmt);
        } else if (kind < 2.5) {
          // 2.0: Tree Trunks & Branches — warm chestnut in daylight, dark moonlit walnut at night
          vec3 barkDark = vColor * mix(vec3(0.20, 0.23, 0.28), vec3(0.74, 0.64, 0.56), dayAmt);
          vec3 barkLit = vColor * mix(vec3(0.36, 0.40, 0.46), vec3(1.32, 1.12, 0.86), dayAmt);
          col = mix(barkDark, barkLit, clamp(toon * 0.82 + exposure * 0.18, 0.0, 1.0));
        } else if (kind < 3.5) {
          // 3.0: Grassy Ground (vMeta.w < 0.5) vs Stone Garden Path & Low Wall (vMeta.w >= 0.5)
          float litG = clamp(toon * 0.65 + 0.25, 0.0, 1.0);
          if (vMeta.w > 0.5) {
            vec3 stoneDark = vColor * mix(vec3(0.24, 0.28, 0.36), vec3(0.82, 0.76, 0.68), dayAmt);
            vec3 stoneLit = vColor * mix(vec3(0.38, 0.44, 0.54), vec3(1.06, 0.98, 0.88), dayAmt);
            col = mix(stoneDark, stoneLit, litG);
          } else {
            vec3 gDay = mix(uTreeCol * 0.95, uTreeLit * 0.98, litG) * (vColor / vec3(0.36, 0.53, 0.24));
            vec3 gNight = mix(uTreeCol * 0.88, uTreeLit * 0.95, litG) * vec3(0.82, 1.12, 0.90);
            col = mix(gNight, gDay, dayAmt);
          }
          float dapple = smoothstep(-0.25, 0.35, sin(vWorld.x * 1.4 + vWorld.z * 1.1) * cos(vWorld.z * 1.6 - vWorld.x * 0.8));
          col *= mix(0.76, 1.08, dapple * (0.35 + 0.65 * dayAmt));
        } else if (kind < 4.5) {
          // 4.0: Distant Hills & Campus Rooflines
          vec3 hillBase = mix(uTreeCol * 0.92, uCityCol, 0.38) * (vColor * 1.15);
          vec3 hillSun = mix(uTreeLit, mix(uTreeLit * 1.15, uSunCol, 0.28), dayAmt) * (vColor * 1.12);
          col = mix(hillBase, hillSun, clamp(toon * 0.6 + exposure * 0.35, 0.0, 1.0));
          if (vMeta.w > 0.5) {
            col = mix(col, vec3(1.0, 0.82, 0.48), clamp(uLights * 0.85, 0.0, 1.0));
          }
        } else {
          col = mix(uTreeLit * 0.85, vColor * uSunCol * 1.05, dayAmt);
        }

        // Layered Atmospheric Haze: keeps close trees (<2.4m) crisp & rich, warms mid/far layers progressively
        float distFromWin = max(0.0, uWinPlane.x - vWorld.x);
        float hazeCurve = smoothstep(2.0, 18.5, distFromWin);
        float hazeAmt = clamp(hazeCurve * (0.45 + 0.48 * uCityHaze), 0.0, 0.84);
        vec3 hazeColor = mix(uSkyBot, uSkyTop, 0.22) + uSunCol * (0.14 * dayAmt);
        col = mix(col, hazeColor, hazeAmt);

        col = mix(col, mix(uSkyBot, uSkyTop, 0.5), uRain * 0.24);

        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const outdoorMesh = new THREE.Mesh(outdoorGeo, outdoorMat);
  outdoorMesh.frustumCulled = false;

  const glassGeo = new THREE.PlaneGeometry(z1 - z0, y1 - y0);
  const glassMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      varying vec3 vWorld;
      uniform float uTime;
      uniform sampler2D uRainTex;
      uniform vec2 uSize;
      uniform vec3 uGlass, uSunCol;
      uniform vec3 uSun;
      uniform float uRain, uLow;

      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        // Per-pane UV (4x4 panes) for subtle beveled glass edge reflections & diagonal glints
        vec2 paneUv = fract(vUv * 4.0);
        vec2 edgeDist = min(paneUv, 1.0 - paneUv);
        float bevel = smoothstep(0.07, 0.01, min(edgeDist.x, edgeDist.y));

        float diag = vUv.x * 0.85 + vUv.y * 0.65;
        float sheen1 = smoothstep(0.09, 0.0, abs(fract(diag * 2.1 + 0.18) - 0.5));
        float sheen2 = smoothstep(0.045, 0.0, abs(fract(diag * 3.6 + 0.42) - 0.5));
        float glassRefl = (sheen1 * 0.045 + sheen2 * 0.04 + bevel * 0.055);

        vec3 col = mix(uGlass, uSunCol, 0.5);
        float alpha = clamp(glassRefl, 0.0, 0.22);

        float t0 = uTime;
        if (uRain > 0.01) {
          float rainAlpha = 0.0;
          if (uLow > 0.5) {
            vec3 rt = texture2D(uRainTex, vec2(vUv.x * 2.2, vUv.y * 2.0 + t0 * 0.06)).rgb;
            rainAlpha = rt.r * uRain * 0.45;
          } else {
            vec2 ru = vec2(vUv.x * 80.0, vUv.y * 2.4 + t0 * 1.7);
            float cid = floor(ru.x);
            float y = fract(ru.y + h(vec2(cid, 3.0)) * 10.0);
            float streak = smoothstep(0.1, 0.0, abs(fract(ru.x) - 0.5)) * smoothstep(0.0, 0.08, y) * smoothstep(0.24, 0.08, y) * step(0.55, h(vec2(cid, 4.0)));
            rainAlpha += streak * 0.38 * uRain;

            vec2 g = vUv * vec2(26.0, 24.0);
            vec2 id = floor(g);
            vec2 f = fract(g) - 0.5;
            vec2 o = vec2(h(id), h(id + 7.1)) - 0.5;
            float r = 0.07 + 0.11 * h(id + 3.3);
            float d = length((f - o * 0.6) * vec2(1.0, 0.85));
            float drop = smoothstep(r, r * 0.55, d) * step(0.42, h(id + 9.7)) * uRain;
            rainAlpha += drop * 0.42;

            float lane = floor(vUv.x * 13.0);
            float lx = fract(vUv.x * 13.0) - 0.5 + 0.1 * sin(vUv.y * 9.0 + lane);
            float sp = 0.05 + 0.08 * h(vec2(lane, 5.0));
            float py = fract(-t0 * sp + h(vec2(lane, 6.0)));
            float dy = vUv.y - py;
            float run = smoothstep(0.06, 0.0, abs(lx)) * smoothstep(0.012, 0.0, abs(dy) - 0.006);
            float trail = smoothstep(0.03, 0.0, abs(lx)) * step(0.0, dy) * smoothstep(0.22, 0.0, dy) * 0.35;
            rainAlpha += (run + trail) * 0.55 * step(0.35, h(vec2(lane, 8.0))) * uRain;
          }
          col = mix(col, uGlass + vec3(0.22), clamp(rainAlpha * 1.4, 0.0, 1.0));
          alpha = clamp(alpha + rainAlpha, 0.0, 0.75);
        }

        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }
    `,
  });

  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.rotation.y = Math.PI / 2;
  glassMesh.scale.x = -1;
  glassMesh.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
  glassMesh.renderOrder = 1;

  const group = new THREE.Group();
  group.add(outdoorMesh, glassMesh);

  return {
    mesh: group,
    uniforms,
    setLow(low) {
      uniforms.uLow.value = low ? 1 : 0;
    },
    dispose() {
      outdoorGeo.dispose();
      outdoorMat.dispose();
      glassGeo.dispose();
      glassMat.dispose();
      rainTex.dispose();
    },
  };
}
