// The study hall (layout from the golden-hour / rainy-night references): a corner
// room with a big window, window counter and stools, three bays of bookshelves, a
// teal door wall, the long table on a teal rug, a lounge with a sofa, and a
// balustrade over the stairwell. Static pieces merge into two meshes (shell and
// furniture); books, chairs and mugs are instanced; seat kits are per seat.
import * as THREE from 'three';
import { EnvBuilder } from './envGeo';
import { envMaterial, lightRig, N_LAMPS, PENDANT_LAMP, WINDOW_LAMP, stUniforms } from './envMaterial';
import { buildWindowView, type WindowView } from './windowView';
import { backpackGeo, buildKit, buildLamp, chairGeo, mugGeo, type LampInfo } from './props';
import { cyl, materials, rng, roundedBox, sphere, torus, type V3 } from './toon';
import type { FocusAct, PageHook } from './character';
import type { Atmo } from './atmosphere';
import type { TierSettings } from './quality';
import {
  CHAIR_IN, COFFEE, COUNTER, DOOR, FLOOR_X1, FLOOR_Z1, KITS, LAMP_AT, LAMP_FADE, LAMP_TINT, MAX_SLOTS, PENDANT, SHELF,
  SOFA, STOOLS, TABLE, TABLE_TOP, WALL_H, WALL_X, WALL_Z, WELL, WINDOW, seatPose,
} from './hall';

const OAK = '#c07a40';
const OAK_DARK = '#8a522c';
const OAK_DEEP = '#5e3a24';
const TEAL_WALL = '#3a6664';
const TEAL_PANEL = '#2c6462';
const CREAM_WALL = '#e9d4ad';
const TERRA = '#bf6342';

export interface Seat {
  slot: number;
  anchor: THREE.Group;
  kit: THREE.Group;
  book: THREE.Group | null;
  page: PageHook | null;
  /** Mug proxy in seat space; the character moves it, the instanced mug follows. */
  mug: THREE.Object3D;
  bag: THREE.Mesh | null;
  focusAct: FocusAct;
  lamp: LampInfo & { world: THREE.Vector3; tint: THREE.Color; level: number; target: number };
  /** Chair slide along the seat's facing axis (+ toward the table) and twist; driven by the scene. */
  chair: { offset: number; yaw: number };
  /** 0..1 kit unpack animation. */
  kitShown: number;
  kitTarget: number;
}

export interface RoomBuild {
  group: THREE.Group;
  seats: Seat[];
  window: WindowView;
  door: THREE.Group;
  /** Dynamic floor shadows: index → [x, z, radius, strength]; the scene fills these. */
  blobs: THREE.InstancedMesh;
  /** Shelf books (instanced) and the per-slot pools for books carried closed or open (in hands or on the table). */
  books: THREE.InstancedMesh;
  held: { closed: THREE.InstancedMesh; covers: THREE.InstancedMesh; pages: THREE.InstancedMesh };
  update(t: number, dt: number, atmo: Atmo): void;
  setQuality(s: TierSettings): void;
  /** Pixels per world unit at distance 1 (point sprite sizing). */
  setPx(px: number): void;
  dispose(): void;
}

// ---- small helpers --------------------------------------------------------------

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createPotGeometry(potType: 'terracotta' | 'ceramic' | 'fluted', potRadius: number, potHeight: number) {
  const radialSegments = 28;
  const profilePoints: THREE.Vector2[] = [];
  const rTop = potRadius;
  const h = potHeight;
  const soilRecess = Math.max(0.02, h * 0.16);
  const wallThickness = Math.max(0.012, rTop * 0.095);

  if (potType === 'ceramic') {
    const rBase = rTop * 0.72;
    const rBelly = rTop * 1.04;
    const lipThickness = wallThickness * 1.15;

    profilePoints.push(new THREE.Vector2(0, 0.005));
    profilePoints.push(new THREE.Vector2(rBase * 0.88, 0.005));
    profilePoints.push(new THREE.Vector2(rBase * 0.92, 0.0));
    profilePoints.push(new THREE.Vector2(rBase, 0.0));
    profilePoints.push(new THREE.Vector2(rBase * 1.01, h * 0.05));

    const wallSteps = 12;
    for (let i = 1; i <= wallSteps; i++) {
      const t = i / wallSteps;
      const y = h * (0.05 + t * 0.89);
      const curveR = THREE.MathUtils.lerp(rBase, rTop, Math.pow(t, 0.7))
                   + Math.sin(t * Math.PI) * (rBelly - rTop) * 0.85;
      profilePoints.push(new THREE.Vector2(curveR, y));
    }

    const lipSteps = 6;
    const lipCenterR = rTop - lipThickness * 0.45;
    const lipCenterY = h - lipThickness * 0.45;
    for (let i = 0; i <= lipSteps; i++) {
      const ang = (i / lipSteps) * Math.PI;
      const rx = lipCenterR + Math.cos(ang) * (lipThickness * 0.55);
      const ry = lipCenterY + Math.sin(ang) * (lipThickness * 0.45);
      profilePoints.push(new THREE.Vector2(rx, ry));
    }

    const innerR = rTop - lipThickness;
    profilePoints.push(new THREE.Vector2(innerR, h - soilRecess * 1.55));
    profilePoints.push(new THREE.Vector2(0, h - soilRecess * 1.55));
  } else {
    const rBase = rTop * (potType === 'fluted' ? 0.74 : 0.68);
    const rimHeight = Math.max(0.025, h * 0.16);
    const rimOverhang = Math.max(0.01, rTop * 0.085);

    profilePoints.push(new THREE.Vector2(0, 0));
    profilePoints.push(new THREE.Vector2(rBase, 0));
    profilePoints.push(new THREE.Vector2(rBase * 1.01, h * 0.04));

    const bodySteps = 10;
    const collarBottomY = h - rimHeight;
    for (let i = 1; i <= bodySteps; i++) {
      const t = i / bodySteps;
      const y = THREE.MathUtils.lerp(h * 0.04, collarBottomY, t);
      const r = THREE.MathUtils.lerp(rBase, rTop * 0.96, t) + Math.sin(t * Math.PI) * (rTop * 0.025);
      profilePoints.push(new THREE.Vector2(r, y));
    }

    profilePoints.push(new THREE.Vector2(rTop + rimOverhang * 0.85, collarBottomY + rimHeight * 0.08));
    profilePoints.push(new THREE.Vector2(rTop + rimOverhang, collarBottomY + rimHeight * 0.22));
    profilePoints.push(new THREE.Vector2(rTop + rimOverhang * 0.95, h - rimHeight * 0.12));
    profilePoints.push(new THREE.Vector2(rTop + rimOverhang * 0.65, h));
    profilePoints.push(new THREE.Vector2(rTop - wallThickness * 0.35, h));
    profilePoints.push(new THREE.Vector2(rTop - wallThickness * 0.85, h - rimHeight * 0.12));

    profilePoints.push(new THREE.Vector2(rTop - wallThickness * 0.95, h - soilRecess * 1.55));
    profilePoints.push(new THREE.Vector2(0, h - soilRecess * 1.55));
  }

  const geometry = new THREE.LatheGeometry(profilePoints, radialSegments);
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const fluteCount = 24;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const radiusAtV = Math.hypot(v.x, v.z);
    const angle = Math.atan2(v.z, v.x);

    if (potType === 'fluted' && radiusAtV > potRadius * 0.55 && v.y > h * 0.05 && v.y < h * 0.82) {
      const verticalMask = smoothstep(h * 0.05, h * 0.14, v.y) * (1 - smoothstep(h * 0.72, h * 0.82, v.y));
      const fluteWave = Math.sin(angle * fluteCount) * (potRadius * 0.022) * verticalMask;
      const scale = (radiusAtV + fluteWave) / Math.max(0.0001, radiusAtV);
      v.x *= scale;
      v.z *= scale;
      pos.setXYZ(i, v.x, v.y, v.z);
    }

    const heightFactor = THREE.MathUtils.clamp(v.y / h, 0, 1);
    let shade = 0.88 + 0.14 * heightFactor;
    if (v.y < h - 0.01 && radiusAtV < potRadius - wallThickness * 0.4) {
      shade *= 0.68;
    }
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade * 0.98;
    colors[i * 3 + 2] = shade * 0.96;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return {
    geometry,
    soilY: h - soilRecess,
    soilRadius: rTop - wallThickness * 0.82,
  };
}

function createSaucerGeometry(potRadius: number, potHeight: number) {
  const rBase = potRadius * 0.78;
  const sRadius = rBase * 1.16;
  const sHeight = Math.max(0.012, potHeight * 0.085);
  const pts = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(sRadius * 0.88, 0),
    new THREE.Vector2(sRadius, sHeight * 0.75),
    new THREE.Vector2(sRadius * 0.98, sHeight),
    new THREE.Vector2(sRadius * 0.90, sHeight),
    new THREE.Vector2(sRadius * 0.82, sHeight * 0.35),
    new THREE.Vector2(0, sHeight * 0.35),
  ];
  const geom = new THREE.LatheGeometry(pts, 24);
  geom.computeVertexNormals();
  return geom;
}

function createSoilGeometry(soilRadius: number, rand: () => number) {
  const rings = 8;
  const segments = 22;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const baseColor = new THREE.Color('#2e1f18');
  const edgeColor = new THREE.Color('#1c120d');

  const moundHeight = soilRadius * 0.14;
  positions.push(0, moundHeight, 0);
  colors.push(baseColor.r, baseColor.g, baseColor.b);

  const noisePhase1 = rand() * Math.PI * 2;
  const noisePhase2 = rand() * Math.PI * 2;

  for (let r = 1; r <= rings; r++) {
    const t = r / rings;
    const rad = t * soilRadius;
    const domeY = Math.cos(t * Math.PI * 0.5) * moundHeight;

    for (let s = 0; s < segments; s++) {
      const theta = (s / segments) * Math.PI * 2;
      const x = Math.cos(theta) * rad;
      const z = Math.sin(theta) * rad;

      const bump = (
        Math.sin(x * 9 + noisePhase1) * Math.cos(z * 9 + noisePhase2) * (soilRadius * 0.04) +
        (rand() - 0.5) * (soilRadius * 0.03)
      ) * (1 - t * 0.5);

      positions.push(x, domeY + bump, z);

      const c = baseColor.clone().lerp(edgeColor, Math.pow(t, 1.8));
      const vJitter = (rand() - 0.5) * 0.04;
      colors.push(
        THREE.MathUtils.clamp(c.r + vJitter, 0, 1),
        THREE.MathUtils.clamp(c.g + vJitter, 0, 1),
        THREE.MathUtils.clamp(c.b + vJitter, 0, 1)
      );
    }
  }

  for (let s = 0; s < segments; s++) {
    const next = (s + 1) % segments;
    indices.push(0, 1 + next, 1 + s);
  }

  for (let r = 1; r < rings; r++) {
    const ringStart = 1 + (r - 1) * segments;
    const nextRingStart = 1 + r * segments;
    for (let s = 0; s < segments; s++) {
      const next = (s + 1) % segments;
      indices.push(ringStart + s, ringStart + next, nextRingStart + next);
      indices.push(ringStart + s, nextRingStart + next, nextRingStart + s);
    }
  }

  const bufferGeom = new THREE.BufferGeometry();
  bufferGeom.setIndex(indices);
  bufferGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bufferGeom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  bufferGeom.computeVertexNormals();
  return bufferGeom;
}

function createTaperedTubeGeometry(
  curve: THREE.CatmullRomCurve3,
  tubularSegments = 14,
  radiusStart = 0.012,
  radiusEnd = 0.005,
  radialSegments = 6,
  baseHex = '#3a5f32',
  tipHex = '#74a958'
) {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();

  const baseTint = new THREE.Color(baseHex);
  const tipTint = new THREE.Color(tipHex);

  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const point = curve.getPointAt(u);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    const radius = THREE.MathUtils.lerp(radiusStart, radiusEnd, Math.pow(u, 0.85));
    const col = baseTint.clone().lerp(tipTint, u);

    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);

      normal.x = cos * N.x + sin * B.x;
      normal.y = cos * N.y + sin * B.y;
      normal.z = cos * N.z + sin * B.z;
      normal.normalize();

      vertex.x = point.x + radius * normal.x;
      vertex.y = point.y + radius * normal.y;
      vertex.z = point.z + radius * normal.z;

      positions.push(vertex.x, vertex.y, vertex.z);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(col.r, col.g, col.b);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setIndex(indices);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geom;
}

function createSculptedLeafGeometry({
  shapeType = 'pilea',
  length = 0.15,
  width = 0.12,
  cupping = 0.2,
  arch = 0.22,
  thickness = 0.005,
  asymmetry = 0.0,
}: {
  shapeType?: 'pilea' | 'ficus' | 'heart';
  length?: number;
  width?: number;
  cupping?: number;
  arch?: number;
  thickness?: number;
  asymmetry?: number;
} = {}) {
  const segsL = 10;
  const segsW = 8;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  function evalLeafPoint(u: number, v: number, isTopSurface: boolean) {
    const absU = Math.abs(u);
    let profileWidth = 0;
    let zAlong = v * length;

    if (shapeType === 'pilea') {
      const baseRound = Math.pow(Math.sin(v * Math.PI), 0.62);
      const tipTaper = 1.0 - 0.28 * Math.pow(v, 2.2);
      profileWidth = (width * 0.5) * baseRound * tipTaper;
      zAlong = (v - 0.16) * length;
    } else if (shapeType === 'ficus') {
      const bodyCurve = Math.sin(Math.pow(v, 0.78) * Math.PI);
      const dripTip = v > 0.82 ? Math.pow(1 - (v - 0.82) / 0.18, 0.55) * 0.15 : 0;
      profileWidth = (width * 0.5) * (bodyCurve * 0.95 + dripTip);
      zAlong = v * length;
    } else {
      const envelope = Math.pow(Math.sin(v * Math.PI), 0.68) * (1 - 0.35 * Math.pow(v, 1.5));
      profileWidth = (width * 0.5) * envelope;
      const basalLobePullback = Math.sin(absU * Math.PI * 0.85) * (1 - smoothstep(0.0, 0.38, v)) * (length * 0.18);
      zAlong = v * length - basalLobePullback;
    }

    const asymScale = 1 + u * asymmetry * 0.12;
    const x = u * profileWidth * asymScale;
    const archY = (Math.sin(v * Math.PI * 0.82) * 0.45 - Math.pow(v, 2.15) * arch) * length;

    let cupY = 0;
    if (shapeType === 'pilea') {
      const radialDist = Math.hypot(u * 0.85, (v - 0.42) * 1.35);
      cupY = Math.pow(radialDist, 1.7) * cupping * width * 0.55
           - Math.pow(Math.max(0, radialDist - 0.75), 2) * width * 0.18;
    } else {
      const vFold = Math.pow(absU, 1.15) * cupping * width * 0.65;
      const marginRoll = Math.pow(absU, 3.2) * cupping * width * 0.38;
      cupY = vFold - marginRoll;
    }

    const edgeFactor = (1 - Math.pow(absU, 3.5)) * Math.sin(v * Math.PI);
    const midribUnderside = !isTopSurface ? Math.exp(-absU * 14) * (1 - v * 0.75) * thickness * 1.45 : 0;
    const halfThick = thickness * 0.5 * (0.25 + 0.75 * edgeFactor);
    const yOffset = isTopSurface ? halfThick : -(halfThick + midribUnderside);

    return { x, y: archY + cupY + yOffset, z: zAlong, absU };
  }

  const stride = segsW + 1;
  const sideVertCount = (segsL + 1) * stride;

  for (let side = 0; side < 2; side++) {
    const isTop = side === 0;
    for (let iv = 0; iv <= segsL; iv++) {
      const v = iv / segsL;
      for (let iu = 0; iu <= segsW; iu++) {
        const u = (iu / segsW) * 2 - 1;
        const pt = evalLeafPoint(u, v, isTop);
        positions.push(pt.x, pt.y, pt.z);

        const midribGlow = Math.exp(-pt.absU * 11) * (1 - v * 0.5) * 0.16;
        const pileaSpot = (shapeType === 'pilea' && isTop)
          ? Math.exp(-(pt.absU * pt.absU * 18 + Math.pow(v - 0.17, 2) * 38)) * 0.25
          : 0;

        let veinHighlight = 0;
        if (shapeType !== 'pilea' && isTop) {
          const veinCoord = (v * 6.5 - pt.absU * 2.2);
          const veinWave = Math.pow(Math.max(0, Math.cos(veinCoord * Math.PI * 2)), 10);
          veinHighlight = veinWave * (1 - pt.absU * 0.7) * (1 - Math.exp(-pt.absU * 8)) * 0.06;
        }

        const baseToTip = 0.86 + 0.18 * v;
        const edgeShade = 1.0 - Math.pow(pt.absU, 3.0) * 0.08;
        const undersideLift = isTop ? 1.0 : 1.06;

        colors.push(
          (baseToTip + midribGlow * 1.15 + pileaSpot * 1.3 + veinHighlight) * edgeShade * undersideLift,
          (baseToTip + midribGlow * 1.10 + pileaSpot * 1.2 + veinHighlight) * edgeShade * undersideLift,
          (baseToTip + midribGlow * 0.85 + pileaSpot * 0.95 + veinHighlight * 0.8) * edgeShade * undersideLift
        );
      }
    }
  }

  for (let iv = 0; iv < segsL; iv++) {
    for (let iu = 0; iu < segsW; iu++) {
      const a = iv * stride + iu;
      const b = (iv + 1) * stride + iu;
      const c = (iv + 1) * stride + (iu + 1);
      const d = iv * stride + (iu + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const botOffset = sideVertCount;
  for (let iv = 0; iv < segsL; iv++) {
    for (let iu = 0; iu < segsW; iu++) {
      const a = botOffset + iv * stride + iu;
      const b = botOffset + (iv + 1) * stride + iu;
      const c = botOffset + (iv + 1) * stride + (iu + 1);
      const d = botOffset + iv * stride + (iu + 1);
      indices.push(a, d, b, b, d, c);
    }
  }

  for (let iv = 0; iv < segsL; iv++) {
    const tL1 = iv * stride, tL2 = (iv + 1) * stride;
    const bL1 = botOffset + tL1, bL2 = botOffset + tL2;
    indices.push(tL1, bL1, tL2, bL1, bL2, tL2);

    const tR1 = iv * stride + segsW, tR2 = (iv + 1) * stride + segsW;
    const bR1 = botOffset + tR1, bR2 = botOffset + tR2;
    indices.push(tR1, tR2, bR1, bR1, tR2, bR2);
  }

  const geom = new THREE.BufferGeometry();
  geom.setIndex(indices);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  return geom;
}

function computeLeafQuat(
  tangent: THREE.Vector3,
  radialOutward: THREE.Vector3,
  droopAmount: number,
  rand: () => number
): THREE.Quaternion {
  const forward = tangent.clone().multiplyScalar(0.55).addScaledVector(radialOutward, 0.65).normalize();
  forward.y -= droopAmount;
  forward.normalize();

  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, forward);
  if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
  else right.normalize();

  const leafUp = new THREE.Vector3().crossVectors(forward, right).normalize();
  const twistAngle = (rand() - 0.5) * 0.36;
  const twistQuat = new THREE.Quaternion().setFromAxisAngle(forward, twistAngle);
  right.applyQuaternion(twistQuat);
  leafUp.applyQuaternion(twistQuat);

  const rotMatrix = new THREE.Matrix4().makeBasis(right, leafUp, forward);
  return new THREE.Quaternion().setFromRotationMatrix(rotMatrix);
}

export interface PlantOpts {
  pot?: string;
  potType?: 'terracotta' | 'ceramic' | 'fluted';
  style?: 'pilea' | 'tree' | 'bush';
  potR: number;
  potH: number;
  leaves: number;
  height: number;
  spread?: number;
  leaf?: number;
  y0?: number;
  greens?: string[];
  seed: number;
  droop?: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function plant(b: EnvBuilder, x: number, z: number, o: PlantOpts) {
  const r = rng(o.seed);
  const y0 = o.y0 ?? 0;

  const isPale = o.pot ? (o.pot === '#efe8dc' || o.pot.startsWith('#ef') || o.pot.startsWith('#df')) : false;
  const potType: 'terracotta' | 'ceramic' | 'fluted' =
    o.potType ?? (isPale ? 'ceramic' : (o.potR > 0.16 && o.leaves >= 16 && o.height < 1.0 ? 'fluted' : 'terracotta'));

  const style: 'pilea' | 'tree' | 'bush' =
    o.style ?? (potType === 'ceramic' && o.height > 0.8 ? 'tree' : (potType === 'fluted' || o.potR > o.potH * 0.9 ? 'bush' : 'pilea'));

  const potColorHex = o.pot ?? (potType === 'ceramic' ? '#efe8dc' : TERRA);

  let saucerOffset = 0;
  if (potType === 'terracotta' || potType === 'fluted') {
    const saucerGeom = createSaucerGeometry(o.potR, o.potH);
    b.add(saucerGeom, '#b05636', { p: [x, y0, z] }, { ao: 0.2 });
    saucerOffset = 0.012;
  }

  const { geometry: potGeom, soilY, soilRadius } = createPotGeometry(potType, o.potR, o.potH);
  const basePotCol = new THREE.Color(potColorHex);
  const potColAttr = potGeom.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < potColAttr.count; i++) {
    potColAttr.setXYZ(i, potColAttr.getX(i) * basePotCol.r, potColAttr.getY(i) * basePotCol.g, potColAttr.getZ(i) * basePotCol.b);
  }
  b.add(potGeom, null, { p: [x, y0 + saucerOffset, z] });

  const soilBaseY = y0 + saucerOffset + soilY;
  const soilGeom = createSoilGeometry(soilRadius, r);
  b.add(soilGeom, null, { p: [x, soilBaseY, z] });

  // Natural pebbles scattered on the soil
  const numPebbles = Math.min(8, Math.floor(4 + o.potR * 20));
  const pebbleColors = ['#473328', '#5c4335', '#7c6b5d', '#3b281f'];
  for (let i = 0; i < numPebbles; i++) {
    const rDist = THREE.MathUtils.lerp(soilRadius * 0.25, soilRadius * 0.8, r());
    const ang = r() * Math.PI * 2;
    const pScale = THREE.MathUtils.lerp(0.01, 0.02, r()) * (o.potR / 0.18);
    const py = soilBaseY + Math.cos((rDist / soilRadius) * Math.PI * 0.5) * (soilRadius * 0.12);
    b.add(sphere(1, 5, 4), pebbleColors[i % pebbleColors.length], {
      p: [x + Math.cos(ang) * rDist, py, z + Math.sin(ang) * rDist],
      r: [r() * 3, r() * 3, r() * 3],
      s: [pScale * 1.3, pScale * 0.65, pScale],
    });
  }

  const greens = o.greens ?? ['#4f8f4a', '#3d773c', '#6aa85a', '#82ba63'];
  const droop = o.droop ?? 0.45;
  const leafUnit = o.leaf ?? (o.potR * 0.85);

  function applyLeafColor(geom: THREE.BufferGeometry, hex: string) {
    const g = geom.clone();
    const c = new THREE.Color(hex);
    const ca = g.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < ca.count; i++) {
      ca.setXYZ(i, ca.getX(i) * c.r, ca.getY(i) * c.g, ca.getZ(i) * c.b);
    }
    return g;
  }

  if (style === 'pilea') {
    const caudexH = Math.min(o.height * 0.24, o.potH * 0.35);
    const caudexPoints = [
      new THREE.Vector3(0, -0.05, 0),
      new THREE.Vector3((r() - 0.5) * 0.015, caudexH * 0.45, (r() - 0.5) * 0.015),
      new THREE.Vector3((r() - 0.5) * 0.02, caudexH, (r() - 0.5) * 0.02),
    ];
    const caudexCurve = new THREE.CatmullRomCurve3(caudexPoints);
    const caudexGeom = createTaperedTubeGeometry(caudexCurve, 8, o.potR * 0.09, o.potR * 0.05, 6, '#6e503b', '#6e503b');
    b.add(caudexGeom, null, { p: [x, soilBaseY, z] });

    const leafTemplates = [
      createSculptedLeafGeometry({ shapeType: 'pilea', length: leafUnit * 1.1, width: leafUnit * 0.95, cupping: 0.22, arch: 0.18, asymmetry: -0.05 }),
      createSculptedLeafGeometry({ shapeType: 'pilea', length: leafUnit * 1.15, width: leafUnit * 0.92, cupping: 0.26, arch: 0.22, asymmetry: 0.06 }),
      createSculptedLeafGeometry({ shapeType: 'pilea', length: leafUnit * 1.05, width: leafUnit * 1.0, cupping: 0.19, arch: 0.15, asymmetry: 0.0 }),
    ];

    for (let i = 0; i < o.leaves; i++) {
      const t = i / Math.max(1, o.leaves - 1);
      const theta = i * GOLDEN_ANGLE + (r() - 0.5) * 0.28;
      const originH = (0.02 + t * 0.85) * caudexH;
      const originR = (0.01 + r() * 0.035) * o.potR;

      const p0 = new THREE.Vector3(Math.cos(theta) * originR, originH - 0.03, Math.sin(theta) * originR);
      const spreadR = o.potR * (o.spread ?? 1.0) * THREE.MathUtils.lerp(1.35, 0.28, Math.pow(t, 0.82)) * (0.9 + r() * 0.22);
      const peakH = o.height * THREE.MathUtils.lerp(0.52, 1.02, Math.pow(t, 0.65)) * (0.92 + r() * 0.16);
      const outerDroop = (1 - t * 0.72) * droop * o.height * 0.46;

      const dirX = Math.cos(theta), dirZ = Math.sin(theta);
      const p1 = new THREE.Vector3(dirX * spreadR * 0.25, originH + peakH * 0.48, dirZ * spreadR * 0.25);
      const p2 = new THREE.Vector3(dirX * spreadR * 0.68, originH + peakH - outerDroop * 0.35, dirZ * spreadR * 0.68);
      const p3 = new THREE.Vector3(dirX * spreadR, originH + peakH - outerDroop, dirZ * spreadR);

      const stemCurve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
      const stemGeom = createTaperedTubeGeometry(stemCurve, 12, o.potR * 0.036, o.potR * 0.016, 6);
      b.add(stemGeom, null, { p: [x, soilBaseY, z] }, { sway: 0.3 * (1 - t) + 0.2 });

      const leafGeom = applyLeafColor(leafTemplates[i % leafTemplates.length], greens[i % greens.length]);
      const leafScale = THREE.MathUtils.lerp(1.15, 0.65, Math.pow(t, 1.25)) * (0.9 + r() * 0.2);
      const tipPos = stemCurve.getPointAt(1.0);
      const tipTan = stemCurve.getTangentAt(1.0);
      const quat = computeLeafQuat(tipTan, new THREE.Vector3(dirX, 0, dirZ), (0.18 + (1 - t) * 0.42) * droop, r);

      b.add(leafGeom, null, {
        p: [x + tipPos.x, soilBaseY + tipPos.y, z + tipPos.z],
        q: quat,
        s: leafScale,
      }, { sway: 0.5 + 0.5 * (1 - t) });
    }
  } else if (style === 'tree') {
    const trunkTopY = o.height * 0.68;
    const trunkWiggleX = (r() - 0.5) * 0.28 * o.potR;
    const trunkWiggleZ = (r() - 0.5) * 0.28 * o.potR;
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.06, 0),
      new THREE.Vector3(trunkWiggleX * 0.5, trunkTopY * 0.28, trunkWiggleZ * 0.5),
      new THREE.Vector3(-trunkWiggleX * 0.6, trunkTopY * 0.62, -trunkWiggleZ * 0.4),
      new THREE.Vector3(trunkWiggleX * 0.25, trunkTopY, trunkWiggleZ * 0.25),
    ]);

    const trunkBaseR = o.potR * 0.115;
    const trunkTipR = o.potR * 0.045;
    const trunkGeom = createTaperedTubeGeometry(trunkCurve, 18, trunkBaseR, trunkTipR, 8, '#6e503b', '#6e503b');
    b.add(trunkGeom, null, { p: [x, soilBaseY, z] }, { sway: 0.15 });

    // Root flares
    for (let k = 0; k < 3; k++) {
      const rAng = (k / 3) * Math.PI * 2 + (r() - 0.5) * 0.4;
      const rootCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(rAng) * trunkBaseR * 0.4, 0.06, Math.sin(rAng) * trunkBaseR * 0.4),
        new THREE.Vector3(Math.cos(rAng) * trunkBaseR * 1.15, 0.01, Math.sin(rAng) * trunkBaseR * 1.15),
        new THREE.Vector3(Math.cos(rAng) * trunkBaseR * 1.8, -0.03, Math.sin(rAng) * trunkBaseR * 1.8),
      ]);
      const rootGeom = createTaperedTubeGeometry(rootCurve, 6, trunkBaseR * 0.48, trunkBaseR * 0.15, 5, '#6e503b', '#6e503b');
      b.add(rootGeom, null, { p: [x, soilBaseY, z] });
    }

    const ficusTemplates = [
      createSculptedLeafGeometry({ shapeType: 'ficus', length: leafUnit * 1.25, width: leafUnit * 0.76, cupping: 0.24, arch: 0.26, asymmetry: 0.04 }),
      createSculptedLeafGeometry({ shapeType: 'ficus', length: leafUnit * 1.12, width: leafUnit * 0.72, cupping: 0.20, arch: 0.22, asymmetry: -0.04 }),
      createSculptedLeafGeometry({ shapeType: 'ficus', length: leafUnit * 1.3, width: leafUnit * 0.8, cupping: 0.28, arch: 0.30, asymmetry: 0.0 }),
    ];

    const branchCount = 5;
    const branches: { curve: THREE.CatmullRomCurve3; angle: number }[] = [];
    for (let k = 0; k < branchCount; k++) {
      const bt = 0.32 + (k / (branchCount - 1)) * 0.66;
      const startPos = trunkCurve.getPointAt(bt);
      const branchAngle = k * GOLDEN_ANGLE * 1.15 + (r() - 0.5) * 0.35;
      const reach = o.potR * (o.spread ?? 1.0) * THREE.MathUtils.lerp(1.15, 0.65, (bt - 0.32) / 0.66) * (0.88 + r() * 0.27);
      const rise = o.height * THREE.MathUtils.lerp(0.28, 0.36, (bt - 0.32) / 0.66) * (1 - droop * 0.28);

      const bDirX = Math.cos(branchAngle), bDirZ = Math.sin(branchAngle);
      const bP1 = startPos.clone().add(new THREE.Vector3(bDirX * reach * 0.38, rise * 0.45, bDirZ * reach * 0.38));
      const bP2 = startPos.clone().add(new THREE.Vector3(bDirX * reach * 0.78, rise * 0.88 - droop * 0.14 * o.height, bDirZ * reach * 0.78));
      const bP3 = startPos.clone().add(new THREE.Vector3(bDirX * reach, rise - droop * 0.25 * o.height, bDirZ * reach));

      const bCurve = new THREE.CatmullRomCurve3([startPos, bP1, bP2, bP3]);
      const bStartR = THREE.MathUtils.lerp(trunkBaseR * 0.55, trunkTipR * 0.85, (bt - 0.32) / 0.66);
      const bGeom = createTaperedTubeGeometry(bCurve, 12, bStartR, o.potR * 0.022, 6, '#6e503b', '#6e503b');
      b.add(bGeom, null, { p: [x, soilBaseY, z] }, { sway: 0.28 });
      branches.push({ curve: bCurve, angle: branchAngle });
    }

    for (let i = 0; i < o.leaves; i++) {
      const branch = branches[i % branches.length];
      const prog = THREE.MathUtils.clamp(
        0.22 + ((Math.floor(i / branches.length) + r() * 0.85) / Math.ceil(o.leaves / branches.length)) * 0.78,
        0.2,
        1.0
      );
      const nodePos = branch.curve.getPointAt(prog);
      const sideSign = i % 2 === 0 ? 1 : -1;
      const localAngle = branch.angle + sideSign * (0.45 + r() * 0.6) + (prog > 0.88 ? (r() - 0.5) * 0.5 : 0);
      const outDir = new THREE.Vector3(Math.cos(localAngle), 0, Math.sin(localAngle)).normalize();

      const petioleLen = (0.04 + r() * 0.04) * (o.potR / 0.2) * (1.15 - prog * 0.3);
      const petioleDrop = droop * petioleLen * 0.55;
      const petStart = nodePos.clone();
      const petMid = petStart.clone().add(outDir.clone().multiplyScalar(petioleLen * 0.55)).add(new THREE.Vector3(0, petioleLen * 0.32, 0));
      const petEnd = petStart.clone().add(outDir.clone().multiplyScalar(petioleLen)).add(new THREE.Vector3(0, petioleLen * 0.38 - petioleDrop, 0));

      const petCurve = new THREE.CatmullRomCurve3([petStart, petMid, petEnd]);
      const petGeom = createTaperedTubeGeometry(petCurve, 6, o.potR * 0.022, o.potR * 0.012, 5);
      b.add(petGeom, null, { p: [x, soilBaseY, z] }, { sway: 0.35 });

      const leafGeom = applyLeafColor(ficusTemplates[i % ficusTemplates.length], greens[i % greens.length]);
      const scale = THREE.MathUtils.lerp(1.05, 0.72, Math.pow(prog - 0.2, 1.4)) * (0.88 + r() * 0.25);
      const petTip = petCurve.getPointAt(1.0);
      const petTan = petCurve.getTangentAt(1.0);
      const quat = computeLeafQuat(petTan, outDir, (0.22 + (1 - prog * 0.4) * 0.35) * droop, r);

      b.add(leafGeom, null, {
        p: [x + petTip.x, soilBaseY + petTip.y, z + petTip.z],
        q: quat,
        s: scale,
      }, { sway: 0.6 });
    }
  } else {
    // style === 'bush'
    const bushTemplates = [
      createSculptedLeafGeometry({ shapeType: 'heart', length: leafUnit * 1.15, width: leafUnit * 0.94, cupping: 0.24, arch: 0.28, asymmetry: 0.05 }),
      createSculptedLeafGeometry({ shapeType: 'heart', length: leafUnit * 1.05, width: leafUnit * 0.85, cupping: 0.20, arch: 0.24, asymmetry: -0.05 }),
      createSculptedLeafGeometry({ shapeType: 'pilea', length: leafUnit * 1.08, width: leafUnit * 0.82, cupping: 0.22, arch: 0.22, asymmetry: 0.0 }),
    ];

    const crownCenters = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(soilRadius * 0.34, soilRadius * 0.16),
      new THREE.Vector2(-soilRadius * 0.30, soilRadius * 0.24),
      new THREE.Vector2(soilRadius * 0.05, -soilRadius * 0.34),
    ];

    for (let i = 0; i < o.leaves; i++) {
      const t = i / Math.max(1, o.leaves - 1);
      const crown = crownCenters[i % crownCenters.length];
      const theta = i * GOLDEN_ANGLE + (r() - 0.5) * 0.36;

      const dirX = Math.cos(theta), dirZ = Math.sin(theta);
      const startJitter = (0.02 + r() * 0.06) * o.potR;
      const p0 = new THREE.Vector3(crown.x + dirX * startJitter, -0.03, crown.y + dirZ * startJitter);

      const reach = o.potR * (o.spread ?? 1.0) * THREE.MathUtils.lerp(1.25, 0.22, Math.pow(t, 0.72)) * (0.86 + r() * 0.28);
      const rise = o.height * THREE.MathUtils.lerp(0.42, 1.0, Math.pow(t, 0.62)) * (0.88 + r() * 0.24);
      const cascadeDrop = Math.pow(1 - t, 1.45) * droop * o.height * 0.68;

      const p1 = new THREE.Vector3(crown.x + dirX * reach * 0.28, rise * 0.55, crown.y + dirZ * reach * 0.28);
      const p2 = new THREE.Vector3(crown.x + dirX * reach * 0.72, rise - cascadeDrop * 0.32, crown.y + dirZ * reach * 0.72);
      const p3 = new THREE.Vector3(crown.x + dirX * reach, rise - cascadeDrop, crown.y + dirZ * reach);

      const stemCurve = new THREE.CatmullRomCurve3([p0, p1, p2, p3]);
      const stemGeom = createTaperedTubeGeometry(stemCurve, 12, o.potR * 0.032, o.potR * 0.014, 6);
      b.add(stemGeom, null, { p: [x, soilBaseY, z] }, { sway: 0.3 * (1 - t) + 0.25 });

      const leafGeom = applyLeafColor(bushTemplates[i % bushTemplates.length], greens[i % greens.length]);
      const sizeVar = THREE.MathUtils.lerp(1.2, 0.6, Math.pow(t, 1.1)) * (0.85 + r() * 0.3);
      const tipPos = stemCurve.getPointAt(1.0);
      const tipTan = stemCurve.getTangentAt(1.0);
      const radialOut = new THREE.Vector3(crown.x + dirX * reach, 0, crown.y + dirZ * reach).normalize();
      const quat = computeLeafQuat(tipTan, radialOut, (0.24 + (1 - t) * 0.52) * droop, r);

      b.add(leafGeom, null, {
        p: [x + tipPos.x, soilBaseY + tipPos.y, z + tipPos.z],
        q: quat,
        s: sizeVar,
      }, { sway: 0.5 + 0.5 * (1 - t) });
    }
  }
}

function frame(b: EnvBuilder, w: number, h: number, p: V3, ry: number, scene: 'sunset' | 'hills' | 'lake') {
  const fwd = (d: number): V3 => [p[0] + Math.sin(ry) * d, p[1], p[2] + Math.cos(ry) * d];
  b.add(roundedBox(w, h, 0.045, 0.012, 1), '#c99a62', { p: fwd(0.022), r: [0, ry, 0] });
  b.add(new THREE.BoxGeometry(w - 0.08, h - 0.08, 0.01), '#efe4cb', { p: fwd(0.045), r: [0, ry, 0] });
  const iw = w - 0.2, ih = h - 0.2;
  const sky = scene === 'sunset' ? '#e8b77d' : scene === 'lake' ? '#a9c3cf' : '#b9cbc4';
  b.add(new THREE.BoxGeometry(iw, ih, 0.01), sky, { p: fwd(0.05), r: [0, ry, 0] });
  const right = new THREE.Vector3(Math.cos(ry), 0, -Math.sin(ry));
  const at = (dx: number, dy: number, d: number): V3 => { const f = fwd(d); return [f[0] + right.x * dx, f[1] + dy, f[2] + right.z * dx]; };
  b.add(new THREE.BoxGeometry(iw, ih * 0.38, 0.01), scene === 'lake' ? '#5f8a9c' : '#6f8f5c', { p: at(0, -ih * 0.31, 0.056), r: [0, ry, 0] });
  b.add(sphere(1, 12, 6), scene === 'sunset' ? '#a4744a' : '#557a4a', { p: at(-iw * 0.18, -ih * 0.12, 0.054), r: [0, ry, 0], s: [iw * 0.42, ih * 0.22, 0.004] });
  b.add(sphere(1, 12, 6), '#4c6a44', { p: at(iw * 0.22, -ih * 0.16, 0.057), r: [0, ry, 0], s: [iw * 0.36, ih * 0.16, 0.004] });
  if (scene !== 'lake') b.add(sphere(1, 10, 6), scene === 'sunset' ? '#f6d48c' : '#f1e3b0', { p: at(iw * 0.18, ih * 0.2, 0.055), r: [0, ry, 0], s: [ih * 0.08, ih * 0.08, 0.003] });
}

// ---- shell ------------------------------------------------------------------------

function buildShell(): THREE.BufferGeometry {
  const b = new EnvBuilder();
  const r = rng(42);
  // Floor: dark underlay showing through the plank seams, then staggered oak planks.
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WALL_X + 0.6, 0.04, WELL.z - WALL_Z + 0.3), '#3a2216', { p: [(WALL_X + FLOOR_X1) / 2, -0.035, (WALL_Z + WELL.z) / 2] });
  b.add(new THREE.BoxGeometry(WELL.x - WALL_X + 0.3, 0.04, FLOOR_Z1 - WELL.z + 0.01), '#3a2216', { p: [(WALL_X + WELL.x) / 2, -0.035, (WELL.z + FLOOR_Z1) / 2] });
  const PW = 0.34;
  for (let z = WALL_Z; z < FLOOR_Z1 - 0.01; z += PW) {
    const zc = z + PW / 2;
    const xEnd = zc > WELL.z ? WELL.x : FLOOR_X1;
    let x = WALL_X - r() * 1.6;
    while (x < xEnd) {
      const len = 1.5 + r() * 2.2;
      const x0 = Math.max(WALL_X, x), x1 = Math.min(xEnd, x + len);
      if (x1 - x0 > 0.05) {
        const k = 0.86 + r() * 0.2;
        const c = new THREE.Color(r() < 0.25 ? '#b56d3b' : '#bd7a44').multiplyScalar(k);
        b.add(new THREE.BoxGeometry(x1 - x0 - 0.012, 0.03, PW - 0.012), '#' + c.getHexString(), { p: [(x0 + x1) / 2, -0.015, zc] });
      }
      x += len;
    }
  }
  // Rug under the table: teal with a thin gold double border.
  const RW = 7.4, RD = 4.3;
  b.add(roundedBox(RW, 0.024, RD, 0.01, 1), '#244f4c', { p: [0, 0.012, 0] });
  b.add(roundedBox(RW - 0.06, 0.026, RD - 0.06, 0.01, 1), '#2a5c58', { p: [0, 0.013, 0] });
  for (const inset of [0.2, 0.29]) {
    const w = RW - inset * 2, d = RD - inset * 2, t = 0.028;
    b.add(new THREE.BoxGeometry(w, 0.004, t), '#c9a457', { p: [0, 0.027, d / 2] });
    b.add(new THREE.BoxGeometry(w, 0.004, t), '#c9a457', { p: [0, 0.027, -d / 2] });
    b.add(new THREE.BoxGeometry(t, 0.004, d), '#c9a457', { p: [w / 2, 0.027, 0] });
    b.add(new THREE.BoxGeometry(t, 0.004, d), '#c9a457', { p: [-w / 2, 0.027, 0] });
  }
  // Round rug under the coffee table: teal ring around cream.
  b.add(cyl(1.22, 1.22, 0.02, 48), '#2f6d6a', { p: [COFFEE.x, 0.01, COFFEE.z - 0.45] });
  b.add(cyl(1.1, 1.1, 0.024, 48), '#e6d6ba', { p: [COFFEE.x, 0.012, COFFEE.z - 0.45] });
  b.add(new THREE.TorusGeometry(0.98, 0.012, 3, 48), '#cdb994', { p: [COFFEE.x, 0.025, COFFEE.z - 0.45], r: [Math.PI / 2, 0, 0] });

  const T = 0.3;
  // Left wall (window wall): cream plaster with the window cut out. Shape x = −world z.
  const lw = new THREE.Shape();
  lw.moveTo(-FLOOR_Z1, 0); lw.lineTo(-(WALL_Z - T), 0); lw.lineTo(-(WALL_Z - T), WALL_H); lw.lineTo(-FLOOR_Z1, WALL_H); lw.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-WINDOW.z1, WINDOW.y0); hole.lineTo(-WINDOW.z0, WINDOW.y0); hole.lineTo(-WINDOW.z0, WINDOW.y1); hole.lineTo(-WINDOW.z1, WINDOW.y1); hole.closePath();
  lw.holes.push(hole);
  b.add(new THREE.ExtrudeGeometry(lw, { depth: T, bevelEnabled: false }), CREAM_WALL, { p: [WALL_X - T, 0, 0], r: [0, Math.PI / 2, 0] });
  // Back wall (door wall): deep teal, door opening.
  const dx0 = DOOR.x - DOOR.w / 2, dx1 = DOOR.x + DOOR.w / 2;
  const bw = new THREE.Shape();
  bw.moveTo(WALL_X - T, 0); bw.lineTo(dx0, 0); bw.lineTo(dx0, DOOR.h); bw.lineTo(dx1, DOOR.h); bw.lineTo(dx1, 0); bw.lineTo(FLOOR_X1, 0); bw.lineTo(FLOOR_X1, WALL_H); bw.lineTo(WALL_X - T, WALL_H); bw.closePath();
  b.add(new THREE.ExtrudeGeometry(bw, { depth: T, bevelEnabled: false }), TEAL_WALL, { p: [0, 0, WALL_Z - T] });
  // Wall tops read as a cut section.
  b.add(new THREE.BoxGeometry(T + 0.02, 0.03, FLOOR_Z1 - WALL_Z + T), '#3b2a24', { p: [WALL_X - T / 2, WALL_H + 0.015, (FLOOR_Z1 + WALL_Z - T) / 2] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WALL_X + T, 0.03, T + 0.02), '#3b2a24', { p: [(FLOOR_X1 + WALL_X - T) / 2, WALL_H + 0.015, WALL_Z - T / 2] });
  // Crown moulding along both walls.
  b.add(roundedBox(0.12, 0.14, FLOOR_Z1 - WALL_Z, 0.03, 1), '#e2c8a0', { p: [WALL_X + 0.05, WALL_H - 0.3, (FLOOR_Z1 + WALL_Z) / 2] });
  b.add(roundedBox(FLOOR_X1 - WALL_X, 0.14, 0.12, 0.03, 1), '#24504f', { p: [(FLOOR_X1 + WALL_X) / 2, WALL_H - 0.3, WALL_Z + 0.05] });

  // Back wall wainscot: wood panels, top rail, baseboard (gap at the door).
  const WH = 1.28;
  const runs: [number, number][] = [[WALL_X, dx0 - 0.13], [dx1 + 0.13, FLOOR_X1]];
  for (const [a, c] of runs) {
    const w = c - a;
    b.add(new THREE.BoxGeometry(w, WH, 0.04), '#8c532e', { p: [(a + c) / 2, WH / 2, WALL_Z + 0.02] });
    b.add(roundedBox(w, 0.06, 0.09, 0.02, 1), '#a8673a', { p: [(a + c) / 2, WH, WALL_Z + 0.045] });
    b.add(roundedBox(w, 0.16, 0.06, 0.015, 1), '#6e4128', { p: [(a + c) / 2, 0.08, WALL_Z + 0.05] });
    const n = Math.max(1, Math.round(w / 1.05));
    for (let k = 0; k < n; k++) {
      const pw = w / n;
      b.add(roundedBox(pw - 0.2, WH - 0.42, 0.03, 0.02, 1), '#965a33', { p: [a + pw * (k + 0.5), 0.2 + (WH - 0.36) / 2, WALL_Z + 0.05] });
    }
  }
  // Left wall: teal panelled wainscot beyond the counter, cream pier, baseboard.
  b.add(new THREE.BoxGeometry(0.04, 0.98, FLOOR_Z1 - COUNTER.z1), TEAL_PANEL, { p: [WALL_X + 0.02, 0.49, (FLOOR_Z1 + COUNTER.z1) / 2] });
  b.add(roundedBox(0.09, 0.06, FLOOR_Z1 - COUNTER.z1, 0.02, 1), OAK, { p: [WALL_X + 0.045, 0.98, (FLOOR_Z1 + COUNTER.z1) / 2] });
  b.add(roundedBox(0.06, 0.14, FLOOR_Z1 - WALL_Z, 0.015, 1), '#6e4128', { p: [WALL_X + 0.03, 0.07, (FLOOR_Z1 + WALL_Z) / 2] });
  // Pilaster on the back wall left of the door.
  const PX = 1.0;
  b.add(roundedBox(0.36, WALL_H - 0.4, 0.14, 0.03, 1), '#e7d3b0', { p: [PX, (WALL_H - 0.4) / 2, WALL_Z + 0.07] });
  b.add(roundedBox(0.44, 0.12, 0.2, 0.03, 1), '#e2cba4', { p: [PX, 0.06, WALL_Z + 0.1] });
  b.add(roundedBox(0.44, 0.1, 0.2, 0.03, 1), '#e2cba4', { p: [PX, WH + 0.04, WALL_Z + 0.1] });
  // Hallway behind the door.
  b.add(new THREE.BoxGeometry(DOOR.w + 0.6, DOOR.h + 0.4, 1.6), '#3b2b22', { p: [DOOR.x, DOOR.h / 2, WALL_Z - T - 0.8] });

  // Stairwell: floor edge, dark teal walls going down.
  const D = 3.6;
  b.add(new THREE.BoxGeometry(0.3, 0.29, FLOOR_Z1 - WELL.z), '#7a4a2b', { p: [WELL.x - 0.15, -0.175, (FLOOR_Z1 + WELL.z) / 2] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WELL.x, 0.29, 0.3), '#7a4a2b', { p: [(FLOOR_X1 + WELL.x) / 2, -0.175, WELL.z - 0.15] });
  b.add(new THREE.BoxGeometry(0.1, D, FLOOR_Z1 - WELL.z), '#1f3a3a', { p: [WELL.x - 0.05, -0.32 - D / 2, (FLOOR_Z1 + WELL.z) / 2] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WELL.x, D, 0.1), '#21403f', { p: [(FLOOR_X1 + WELL.x) / 2, -0.32 - D / 2, WELL.z - 0.05] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WELL.x, 0.1, FLOOR_Z1 - WELL.z), '#14201f', { p: [(FLOOR_X1 + WELL.x) / 2, -0.32 - D, (FLOOR_Z1 + WELL.z) / 2] });
  // A flight of stairs going down along the back of the well.
  for (let s = 0; s < 10; s++) {
    b.add(roundedBox(1.1, 0.06, 0.32, 0.015, 1), '#6b4128', { p: [WELL.x + 1.2 + s * 0.3, -0.36 - s * 0.3, WELL.z + 0.62] });
    b.add(new THREE.BoxGeometry(1.1, 0.3, 0.02), '#2c3d3b', { p: [WELL.x + 1.05 + s * 0.3, -0.21 - s * 0.3, WELL.z + 0.62] });
  }
  return b.build();
}

// ---- furniture ----------------------------------------------------------------------

function buildTable(b: EnvBuilder) {
  const L = TABLE.len, Dp = TABLE.depth;
  b.add(roundedBox(L, 0.085, Dp, 0.035, 2), '#c27b43', { p: [0, TABLE_TOP - 0.0425, 0] });
  b.add(roundedBox(L - 0.12, 0.012, Dp - 0.1, 0.004, 1), '#c88246', { p: [0, TABLE_TOP - 0.002, 0] });
  b.add(roundedBox(L - 0.3, 0.1, Dp - 0.26, 0.02, 1), '#8f5631', { p: [0, TABLE_TOP - 0.13, 0] });
  for (const x of [-L / 2 + 0.2, 0, L / 2 - 0.2]) for (const z of [-Dp / 2 + 0.16, Dp / 2 - 0.16]) {
    b.add(roundedBox(0.14, TABLE_TOP - 0.085, 0.14, 0.035, 1), '#8f5631', { p: [x, (TABLE_TOP - 0.085) / 2, z] }, { ao: 0.3 });
  }
}

function buildCounter(b: EnvBuilder) {
  const z0 = COUNTER.z0, z1 = COUNTER.z1, zc = (z0 + z1) / 2, L = z1 - z0;
  const front = WALL_X + 0.36;
  b.add(roundedBox(COUNTER.depth + 0.04, 0.065, L + 0.06, 0.025, 2), '#c98a4c', { p: [WALL_X + (COUNTER.depth + 0.04) / 2, COUNTER.top - 0.0325, zc] });
  b.add(new THREE.BoxGeometry(0.05, COUNTER.top - 0.14, L), TEAL_PANEL, { p: [front, (COUNTER.top - 0.14) / 2 + 0.08, zc] });
  b.add(new THREE.BoxGeometry(0.06, 0.08, L), '#203b3a', { p: [front - 0.02, 0.04, zc] });
  const n = 4;
  for (let k = 0; k < n; k++) {
    const pz = z0 + (L / n) * (k + 0.5);
    b.add(roundedBox(0.03, COUNTER.top - 0.36, L / n - 0.16, 0.012, 1), '#336f6c', { p: [front + 0.03, 0.08 + (COUNTER.top - 0.14) / 2, pz] });
  }
  for (const z of [z0 + 0.03, z1 - 0.03]) b.add(new THREE.BoxGeometry(0.36, COUNTER.top - 0.07, 0.05), TEAL_PANEL, { p: [WALL_X + 0.18, (COUNTER.top - 0.07) / 2, z] });
  // Things on the counter.
  plant(b, WALL_X + 0.22, z0 + 0.36, { pot: TERRA, potR: 0.1, potH: 0.15, leaves: 9, height: 0.26, spread: 0.9, leaf: 0.075, y0: COUNTER.top, seed: 5 });
  plant(b, WALL_X + 0.24, z1 - 0.4, { pot: '#efe8dc', potR: 0.1, potH: 0.14, leaves: 10, height: 0.3, spread: 0.8, leaf: 0.08, y0: COUNTER.top, seed: 9 });
  b.add(roundedBox(0.24, 0.045, 0.32, 0.01, 1), '#3f7d74', { p: [WALL_X + 0.27, COUNTER.top + 0.022, z1 - 1.05], r: [0, 0.12, 0] });
  b.add(roundedBox(0.21, 0.04, 0.29, 0.01, 1), '#d07a8a', { p: [WALL_X + 0.27, COUNTER.top + 0.065, z1 - 1.05], r: [0, -0.06, 0] });
  // Stools.
  for (const [sx, sz] of STOOLS) {
    b.add(cyl(0.19, 0.18, 0.06, 20), '#c8833f', { p: [sx, 0.53, sz] });
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      b.add(cyl(0.02, 0.024, 0.52, 8), '#9a5e32', { p: [sx + Math.cos(a) * 0.13, 0.25, sz + Math.sin(a) * 0.13], r: [Math.sin(a) * -0.09, 0, Math.cos(a) * 0.09] }, { ao: 0.25 });
    }
    b.add(torus(0.15, 0.012, Math.PI * 2, 6, 24), '#9a5e32', { p: [sx, 0.24, sz], r: [Math.PI / 2, 0, 0] });
  }
}

function buildWindowFrame(b: EnvBuilder) {
  const { z0, z1, y0, y1, cols, rows } = WINDOW;
  const x = WALL_X - 0.12;
  const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2;
  const F = '#c8884a';
  // Casing on the room side.
  b.add(roundedBox(0.06, 0.16, z1 - z0 + 0.32, 0.03, 1), F, { p: [WALL_X + 0.03, y1 + 0.08, zc] });
  b.add(roundedBox(0.06, y1 - y0 + 0.16, 0.16, 0.03, 1), F, { p: [WALL_X + 0.03, yc + 0.04, z0 - 0.08] });
  b.add(roundedBox(0.06, y1 - y0 + 0.16, 0.16, 0.03, 1), F, { p: [WALL_X + 0.03, yc + 0.04, z1 + 0.08] });
  // Mullions in the glass plane.
  for (let c = 1; c < cols; c++) b.add(roundedBox(0.09, y1 - y0, 0.1, 0.025, 1), F, { p: [x, yc, z0 + ((z1 - z0) * c) / cols] });
  for (let rr = 1; rr < rows; rr++) b.add(roundedBox(0.09, 0.09, z1 - z0, 0.025, 1), F, { p: [x, y0 + ((y1 - y0) * rr) / rows, zc] });
  // Inner frame lining the opening.
  b.add(new THREE.BoxGeometry(0.1, 0.06, z1 - z0), F, { p: [x, y0 + 0.03, zc] });
  b.add(new THREE.BoxGeometry(0.1, 0.06, z1 - z0), F, { p: [x, y1 - 0.03, zc] });
  b.add(new THREE.BoxGeometry(0.1, y1 - y0, 0.06), F, { p: [x, yc, z0 + 0.03] });
  b.add(new THREE.BoxGeometry(0.1, y1 - y0, 0.06), F, { p: [x, yc, z1 - 0.03] });
}

/** Shelf carcass; returns the shelf levels for the book instances. */
function buildShelves(b: EnvBuilder): number[] {
  const { z0, bay, bays, depth, h } = SHELF;
  const x0 = WALL_X, xc = x0 + depth / 2;
  const levels = [0.12, 0.56, 1.0, 1.44, 1.88, 2.32];
  b.add(new THREE.BoxGeometry(0.03, h, bay * bays), '#5a3826', { p: [x0 + 0.03, h / 2, z0 + (bay * bays) / 2] });
  for (let k = 0; k <= bays; k++) b.add(roundedBox(depth, h, 0.06, 0.015, 1), OAK, { p: [xc, h / 2, z0 + k * bay] });
  for (const y of levels) b.add(roundedBox(depth - 0.02, 0.035, bay * bays, 0.01, 1), OAK, { p: [xc, y, z0 + (bay * bays) / 2] });
  b.add(roundedBox(depth + 0.06, 0.08, bay * bays + 0.1, 0.02, 1), OAK_DARK, { p: [xc + 0.02, h + 0.04, z0 + (bay * bays) / 2] });
  b.add(roundedBox(depth + 0.02, 0.1, bay * bays + 0.04, 0.02, 1), OAK_DEEP, { p: [xc, 0.05, z0 + (bay * bays) / 2] });
  // Ivy planters on top, trailing down the front.
  const r = rng(77);
  for (const pz of [z0 + 0.45, z0 + bay * 2 + 0.35]) {
    b.add(roundedBox(0.3, 0.14, 0.42, 0.04, 1), '#d9cdb5', { p: [xc, h + 0.15, pz] });
    for (let s = 0; s < 4; s++) {
      const sz = pz - 0.18 + s * 0.12 + (r() - 0.5) * 0.05;
      const len = 0.7 + r() * 0.9;
      const n = Math.floor(len / 0.075);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        const y = h + 0.18 - t * len;
        const out = 0.06 + Math.sin(t * Math.PI) * 0.08;
        const side = k % 2 ? 1 : -1;
        b.add(sphere(1, 7, 4), k % 3 ? '#4e8c48' : '#3d7540', {
          p: [x0 + depth + out, y, sz + side * 0.03], r: [0.6 * side, r() * 0.8, 0.9], s: [0.045, 0.012, 0.05],
        }, { sway: 0.3 + t * 1.1 });
      }
    }
    for (let k = 0; k < 12; k++) {
      const a = k * 2.4;
      b.add(sphere(1, 7, 4), k % 2 ? '#4e8c48' : '#5c9a50', { p: [xc + Math.cos(a) * 0.12, h + 0.25 + (k % 3) * 0.03, pz + Math.sin(a) * 0.16], r: [r(), r() * 3, r()], s: [0.06, 0.016, 0.07] }, { sway: 0.3 });
    }
  }
  return levels;
}

function buildBooks(levels: number[]): THREE.InstancedMesh {
  const { z0, bay, bays, depth } = SHELF;
  const r = rng(13);
  const palette = ['#3f6b8a', '#2f4a6b', '#4f7d5c', '#3f8f8a', '#b6584a', '#d9a441', '#c97a4a', '#8a6aa8', '#e2c79a', '#2f6d5f', '#6e3d5c', '#a8473f', '#5d8fb8', '#d6cbb0'];
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (let k = 0; k < bays; k++) {
    for (let li = 0; li < levels.length - 1; li++) {
      const y = levels[li] + 0.0175;
      const gap = levels[li + 1] - levels[li] - 0.05;
      let z = z0 + k * bay + 0.05;
      const zEnd = z0 + (k + 1) * bay - 0.05;
      let lean = 0;
      while (z < zEnd - 0.03) {
        if (r() < 0.06) { z += 0.12 + r() * 0.1; lean = r() < 0.5 ? 0.22 : 0; continue; }
        const t = 0.035 + r() * 0.045, hh = Math.min(gap, 0.27 + r() * 0.12), d = 0.24 + r() * 0.08;
        if (z + t > zEnd) break;
        if (r() < 0.05 && zEnd - z > 0.3) {
          // a short horizontal stack
          let yy = y;
          for (let j = 0; j < 3; j++) {
            const th = 0.035 + r() * 0.02;
            m.compose(p.set(WALL_X + 0.06 + d / 2, yy + th / 2, z + 0.13), q.setFromEuler(e.set(0, (r() - 0.5) * 0.2, 0)), s.set(d, th, 0.24));
            mats.push(m.clone()); cols.push(new THREE.Color(palette[Math.floor(r() * palette.length)]));
            yy += th;
          }
          z += 0.3;
          continue;
        }
        const tilt = lean ? lean : 0;
        m.compose(p.set(WALL_X + 0.06 + d / 2 + (depth - 0.08 - d) * 0.6, y + (hh / 2) * Math.cos(tilt), z + t / 2 + (hh / 2) * Math.sin(tilt)), q.setFromEuler(e.set(-tilt, 0, 0)), s.set(d, hh, t));
        mats.push(m.clone());
        const c = new THREE.Color(palette[Math.floor(r() * palette.length)]).multiplyScalar(0.85 + r() * 0.25);
        cols.push(c);
        z += t + 0.004 + (lean ? 0.06 : 0);
        lean = 0;
      }
    }
  }
  const g = new THREE.BoxGeometry(1, 1, 1);
  // Lighter page block on the inner faces, spine bands via vertex colours.
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), yv = pos.getY(i);
    const k = x > 0.49 ? 1 : 0.62 + 0.1 * (yv + 0.5);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
  const mesh = new THREE.InstancedMesh(g, envMaterial(), mats.length);
  mats.forEach((mm, i) => { mesh.setMatrixAt(i, mm); mesh.setColorAt(i, cols[i]); });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildSofaCorner(b: EnvBuilder) {
  const { x, z, len } = SOFA;
  const S = '#b9603f', S2 = '#c76c49', S3 = '#a9553a';
  // Built facing −z with the back at +z, then turned round so it faces the camera side.
  const sb = new EnvBuilder();
  sb.add(roundedBox(len, 0.26, 0.94, 0.08, 2), S3, { p: [0, 0.17, 0] }, { ao: 0.3 });
  for (let k = 0; k < 3; k++) sb.add(roundedBox(len / 3 - 0.06, 0.15, 0.74, 0.07, 2), S2, { p: [-len / 3 + k * (len / 3), 0.36, -0.06] });
  sb.add(roundedBox(len, 0.62, 0.26, 0.1, 2), S, { p: [0, 0.47, 0.36] }, { ao: 0.25 });
  for (let k = 0; k < 3; k++) sb.add(roundedBox(len / 3 - 0.08, 0.42, 0.2, 0.09, 2), S2, { p: [-len / 3 + k * (len / 3), 0.6, 0.2], r: [-0.18, 0, 0] });
  for (const sd of [-1, 1]) sb.add(roundedBox(0.26, 0.56, 0.96, 0.11, 2), S, { p: [sd * (len / 2 - 0.1), 0.3, 0] }, { ao: 0.3 });
  for (const lx of [-len / 2 + 0.12, len / 2 - 0.12]) for (const lz of [-0.36, 0.36]) sb.add(cyl(0.035, 0.03, 0.06, 8), OAK_DEEP, { p: [lx, 0.03, lz] });
  // Teal cushion at the head end, cream pillow at the far arm, knit throw over the back and arm.
  sb.add(roundedBox(0.42, 0.38, 0.15, 0.07, 2), '#2f6f69', { p: [len / 2 - 0.42, 0.6, 0.12], r: [-0.3, -0.25, -0.05] });
  sb.add(roundedBox(0.36, 0.32, 0.13, 0.06, 2), '#eadfc8', { p: [-len / 2 + 0.38, 0.58, 0.14], r: [-0.3, 0.3, 0.05] });
  // Knit throw draped over the far arm: across the top, down the outside, a little onto the seat.
  const th = '#ece2cc', ax = -len / 2 + 0.1;
  sb.add(roundedBox(0.34, 0.035, 0.52, 0.016, 2), th, { p: [ax, 0.6, -0.02] });
  sb.add(roundedBox(0.035, 0.42, 0.52, 0.016, 2), th, { p: [ax - 0.15, 0.4, -0.02], r: [0, 0, 0.06] });
  sb.add(roundedBox(0.2, 0.035, 0.5, 0.016, 2), th, { p: [ax + 0.24, 0.45, -0.03], r: [0, 0, -0.35] });
  for (let k = 0; k < 5; k++) sb.add(new THREE.BoxGeometry(0.04, 0.4, 0.008), '#d6c8ad', { p: [ax - 0.168, 0.4, -0.24 + k * 0.11], r: [0, 0, 0.06] });
  b.add(sb.build(), null, { p: [x, 0, z], r: [0, Math.PI, 0] });
  // Coffee table with a plant and a closed teal book.
  const { x: cx, z: cz, r: cr } = COFFEE;
  b.add(cyl(cr, cr, 0.05, 32), '#c2804a', { p: [cx, 0.42, cz] });
  b.add(cyl(cr - 0.03, cr - 0.03, 0.006, 32), '#c98a50', { p: [cx, 0.447, cz] });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    b.add(roundedBox(0.05, 0.4, 0.05, 0.015, 1), OAK_DARK, { p: [cx + Math.cos(a) * (cr - 0.12), 0.2, cz + Math.sin(a) * (cr - 0.12)], r: [Math.sin(a) * 0.08, 0, -Math.cos(a) * 0.08] }, { ao: 0.3 });
  }
  plant(b, cx - 0.1, cz - 0.12, { pot: '#efe8dc', potR: 0.07, potH: 0.1, leaves: 8, height: 0.17, spread: 0.9, leaf: 0.055, y0: 0.445, seed: 23 });
  b.add(roundedBox(0.2, 0.035, 0.27, 0.008, 1), '#2e6f6c', { p: [cx + 0.14, 0.462, cz + 0.12], r: [0, 0.5, 0] });
  b.add(new THREE.BoxGeometry(0.18, 0.025, 0.005), '#efe4cb', { p: [cx + 0.14 + Math.sin(0.5) * 0.135, 0.462, cz + 0.12 + Math.cos(0.5) * 0.135], r: [0, 0.5, 0] });
}

function buildBalustrade(b: EnvBuilder) {
  const W = '#b8743c', W2 = '#9c5f30';
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    b.add(roundedBox(0.1, 0.07, L, 0.03, 1), W, { p: [mx, 0.98, mz], r: [0, ry, 0] });
    b.add(roundedBox(0.07, 0.05, L, 0.02, 1), W2, { p: [mx, 0.12, mz], r: [0, ry, 0] });
    const n = Math.floor(L / 0.17);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      b.add(roundedBox(0.045, 0.82, 0.045, 0.012, 1), W, { p: [ax + (bx - ax) * t, 0.55, az + (bz - az) * t] });
    }
    for (const [px, pz] of [[ax, az], [bx, bz]]) {
      b.add(roundedBox(0.13, 1.1, 0.13, 0.03, 1), W2, { p: [px, 0.55, pz] });
      b.add(roundedBox(0.16, 0.06, 0.16, 0.03, 1), W, { p: [px, 1.12, pz] });
    }
  };
  rail(WELL.x + 0.06, WELL.z + 0.06, WELL.x + 0.06, 2.6);
  rail(WELL.x + 0.06, 2.6, WELL.x + 0.06, FLOOR_Z1);
  rail(WELL.x + 0.06, WELL.z + 0.06, FLOOR_X1, WELL.z + 0.06);
}

function buildDoorCasing(b: EnvBuilder) {
  const C = '#a0623a';
  const x0 = DOOR.x - DOOR.w / 2, x1 = DOOR.x + DOOR.w / 2;
  b.add(roundedBox(0.14, DOOR.h + 0.12, 0.08, 0.03, 1), C, { p: [x0 - 0.07, (DOOR.h + 0.12) / 2, WALL_Z + 0.04] });
  b.add(roundedBox(0.14, DOOR.h + 0.12, 0.08, 0.03, 1), C, { p: [x1 + 0.07, (DOOR.h + 0.12) / 2, WALL_Z + 0.04] });
  b.add(roundedBox(DOOR.w + 0.36, 0.16, 0.1, 0.03, 1), C, { p: [DOOR.x, DOOR.h + 0.1, WALL_Z + 0.05] });
  // Jambs lining the opening.
  b.add(new THREE.BoxGeometry(0.03, DOOR.h, 0.3), '#8a522e', { p: [x0 + 0.015, DOOR.h / 2, WALL_Z - 0.15] });
  b.add(new THREE.BoxGeometry(0.03, DOOR.h, 0.3), '#8a522e', { p: [x1 - 0.015, DOOR.h / 2, WALL_Z - 0.15] });
  b.add(new THREE.BoxGeometry(DOOR.w, 0.03, 0.3), '#8a522e', { p: [DOOR.x, DOOR.h - 0.015, WALL_Z - 0.15] });
}

function buildDoor(): THREE.BufferGeometry {
  const b = new EnvBuilder();
  const w = DOOR.w - 0.04, h = DOOR.h - 0.02;
  const D = '#8f532c', P = '#7d4725';
  b.add(roundedBox(w, h, 0.055, 0.015, 1), D, { p: [w / 2, h / 2, 0] });
  for (let rr = 0; rr < 3; rr++) for (let c = 0; c < 2; c++) {
    const ph = rr === 1 ? 0.62 : 0.5;
    const py = [0.38, 1.08, 1.78][rr];
    b.add(roundedBox(w / 2 - 0.16, ph, 0.02, 0.02, 1), P, { p: [w * (c ? 0.73 : 0.27), py, 0.03] });
    b.add(roundedBox(w / 2 - 0.22, ph - 0.07, 0.024, 0.02, 1), '#94582f', { p: [w * (c ? 0.73 : 0.27), py, 0.034] });
  }
  b.add(roundedBox(0.05, 0.14, 0.02, 0.01, 1), '#d2a64e', { p: [w - 0.09, 1.0, 0.04] });
  b.add(roundedBox(0.12, 0.022, 0.03, 0.01, 1), '#d9b05a', { p: [w - 0.13, 1.03, 0.065] });
  return b.build();
}

function buildPendant(b: EnvBuilder) {
  const { x, y, z } = PENDANT;
  b.add(new THREE.SphereGeometry(0.46, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#efe2c4', { p: [x, y, z], s: [1, 0.62, 1] }, { emit: PENDANT_LAMP, glow: 0.35 });
  b.add(new THREE.SphereGeometry(0.44, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#fff3d6', { p: [x, y + 0.001, z], s: [1, 0.1, 1] }, { emit: PENDANT_LAMP, glow: 1.6 });
  b.add(cyl(0.05, 0.07, 0.06, 12), '#c99a4c', { p: [x, y + 0.3, z] });
  b.add(cyl(0.006, 0.006, 6, 4), '#2a2420', { p: [x, y + 3.3, z] });
}

// ---- assembly ---------------------------------------------------------------------------

export function buildRoom(): RoomBuild {
  const group = new THREE.Group();
  const shellMat = envMaterial();
  const furnMat = envMaterial({ sway: true, emit: true });
  const propMat = envMaterial({ emit: true });
  const shell = new THREE.Mesh(buildShell(), shellMat);
  shell.receiveShadow = true;
  group.add(shell);

  const fb = new EnvBuilder();
  buildTable(fb);
  buildCounter(fb);
  buildWindowFrame(fb);
  const levels = buildShelves(fb);
  buildSofaCorner(fb);
  buildBalustrade(fb);
  buildDoorCasing(fb);
  buildPendant(fb);
  frame(fb, 0.82, 0.64, [-1.15, 2.4, WALL_Z], 0, 'hills');
  frame(fb, 0.6, 0.76, [0.05, 2.3, WALL_Z], 0, 'sunset');
  frame(fb, 0.62, 0.8, [4.45, 2.35, WALL_Z], 0, 'lake');
  plant(fb, 1.48, WALL_Z + 0.42, { pot: '#efe8dc', potType: 'ceramic', style: 'tree', potR: 0.21, potH: 0.38, leaves: 26, height: 1.25, seed: 719 });
  plant(fb, 3.72, WALL_Z + 0.45, { pot: TERRA, potType: 'fluted', style: 'bush', potR: 0.19, potH: 0.26, leaves: 28, height: 0.85, droop: 0.54, seed: 928 });
  plant(fb, WALL_X + 0.45, 4.15, { pot: TERRA, potType: 'terracotta', style: 'bush', potR: 0.18, potH: 0.26, leaves: 22, height: 0.85, droop: 0.5, seed: 6 });
  plant(fb, WELL.x - 0.4, 2.9, { pot: '#efe8dc', potType: 'ceramic', style: 'pilea', potR: 0.17, potH: 0.26, leaves: 18, height: 0.72, droop: 0.45, seed: 8, greens: ['#7fae5a', '#6a9a4c', '#8fbb66'] });
  plant(fb, -2.6, WALL_Z + 0.45, { pot: TERRA, potType: 'terracotta', style: 'pilea', potR: 0.17, potH: 0.25, leaves: 20, height: 0.75, droop: 0.48, seed: 402 });

  // Seat lamps (bodies in the furniture mesh; shades glow with the lamp level).
  const seatsLamp: (LampInfo & { world: THREE.Vector3; yaw: number })[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const sp = seatPose(i);
    const lb = new EnvBuilder();
    const info = buildLamp(KITS[i].lamp, lb, i);
    // Face the lamp head toward the seat's workspace (seat space (0, 0.5)).
    const yawLocal = Math.atan2(0 - LAMP_AT.x, 0.5 - LAMP_AT.z) + (i % 3 - 1) * 0.25;
    const yaw = sp.rotY + yawLocal;
    const c = Math.cos(sp.rotY), s = Math.sin(sp.rotY);
    const wx = sp.x + LAMP_AT.x * c + LAMP_AT.z * s, wz = sp.z - LAMP_AT.x * s + LAMP_AT.z * c;
    fb.add(lb.build(), null, { p: [wx, TABLE_TOP, wz], r: [0, yaw, 0] });
    const bw = info.bulb.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(wx, TABLE_TOP, wz));
    seatsLamp.push({ ...info, world: bw, yaw });
  }
  const furniture = new THREE.Mesh(fb.build(), furnMat);
  // The sun reaches the room through the window mask, which already handles the table;
  // the merged furniture only receives (chairs, kits, people and cats cast).
  furniture.receiveShadow = true;
  group.add(furniture);

  const books = buildBooks(levels);
  group.add(books);

  // Door on a hinge at its left edge.
  const door = new THREE.Group();
  door.position.set(DOOR.x - DOOR.w / 2 + 0.02, 0, WALL_Z - 0.06);
  const doorMesh = new THREE.Mesh(buildDoor(), shellMat);
  door.add(doorMesh);
  group.add(door);

  // Window glass + view.
  const win = buildWindowView(WINDOW.z0, WINDOW.z1, WINDOW.y0, WINDOW.y1, WALL_X - 0.16);
  group.add(win.mesh);

  // Chairs (instanced), kits, mugs, backpacks.
  const chairs = new THREE.InstancedMesh(chairGeo('#5e7f52'), propMat, MAX_SLOTS);
  chairs.castShadow = chairs.receiveShadow = true;
  chairs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(chairs);
  const mugs = new THREE.InstancedMesh(mugGeo(), propMat, MAX_SLOTS);
  mugs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mugs.castShadow = true;
  group.add(mugs);
  const seats: Seat[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const sp = seatPose(i);
    const anchor = new THREE.Group();
    anchor.position.set(sp.x, 0, sp.z);
    anchor.rotation.y = sp.rotY;
    group.add(anchor);
    const k = buildKit(i, KITS[i], rng(100 + i));
    const kit = new THREE.Group();
    const km = new THREE.Mesh(k.geo, propMat);
    km.castShadow = true;
    kit.add(km);
    if (k.book) {
      k.book.add(new THREE.Mesh(k.book.userData.geo as THREE.BufferGeometry, propMat));
      const pv = k.book.children[0];
      pv.add(new THREE.Mesh(pv.userData.geo as THREE.BufferGeometry, propMat));
      kit.add(k.book);
    }
    const mug = new THREE.Object3D();
    mug.position.copy(k.mug);
    mug.rotation.y = k.mugYaw;
    kit.add(mug);
    kit.visible = false;
    anchor.add(kit);
    mugs.setColorAt(i, new THREE.Color(KITS[i].mug));
    let bag: THREE.Mesh | null = null;
    if (KITS[i].bag) {
      bag = new THREE.Mesh(backpackGeo(KITS[i].bag!), propMat);
      bag.position.set(i % 2 ? -0.5 : 0.5, 0, -0.12);
      bag.rotation.set(-0.18, (i % 2 ? 1 : -1) * 0.5, 0);
      bag.visible = false;
      anchor.add(bag);
    }
    const tint = new THREE.Color(LAMP_TINT[KITS[i].lamp]);
    seats.push({
      slot: i, anchor, kit, book: k.book, page: k.page, mug, bag, focusAct: KITS[i].act,
      lamp: { ...seatsLamp[i], tint, level: 0, target: 0 },
      chair: { offset: CHAIR_IN, yaw: 0 },
      kitShown: 0, kitTarget: 0,
    });
  }

  // Books in hands or brought back to the table: per-slot instances, hidden by a zero scale.
  const closedGeo = new EnvBuilder()
    .add(roundedBox(0.18, 0.25, 0.042, 0.01, 1), '#ffffff', { p: [0, 0, 0] })
    .add(new THREE.BoxGeometry(0.165, 0.235, 0.044), '#f2ead8', { p: [0.006, 0, 0] })
    .build();
  const coverGeo = new EnvBuilder();
  const pageGeo = new EnvBuilder();
  for (const sd of [-1, 1]) {
    // Each half hinges at the spine (local y axis) and opens 22° toward the reader (+z).
    const a = sd * 0.38;
    const c = Math.cos(a), sn = Math.sin(a);
    coverGeo.add(roundedBox(0.17, 0.25, 0.012, 0.004, 1), '#ffffff', { p: [sd * 0.085 * c, 0, 0.085 * Math.abs(sn) - 0.006], r: [0, -a, 0] });
    pageGeo.add(roundedBox(0.16, 0.235, 0.022, 0.004, 1), '#f6eedc', { p: [sd * 0.083 * c, 0, 0.083 * Math.abs(sn) + 0.012], r: [0, -a, 0] });
    for (let l = 0; l < 6; l++) pageGeo.add(new THREE.BoxGeometry(0.1, 0.006, 0.002), '#bfb39a', { p: [sd * 0.08 * c, 0.08 - l * 0.032, 0.08 * Math.abs(sn) + 0.024], r: [0, -a, 0] });
  }
  const pools = { closed: closedGeo, covers: coverGeo.build(), pages: pageGeo.build() };
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  const pool = (g: THREE.BufferGeometry) => {
    const m = new THREE.InstancedMesh(g, propMat, MAX_SLOTS);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_SLOTS; i++) { m.setMatrixAt(i, zeroM); m.setColorAt(i, new THREE.Color('#ffffff')); }
    m.frustumCulled = false;
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const held = { closed: pool(pools.closed), covers: pool(pools.covers), pages: pool(pools.pages) };

  // Glow sprites for the lamps and the pendant (one draw).
  const glowN = MAX_SLOTS + 1;
  const gPos = new Float32Array(glowN * 3), gSize = new Float32Array(glowN), gAmt = new Float32Array(glowN), gCol = new Float32Array(glowN * 3);
  seats.forEach((s, i) => { s.lamp.world.toArray(gPos, i * 3); gSize[i] = s.lamp.glow; s.lamp.tint.toArray(gCol, i * 3); });
  gPos.set([PENDANT.x, PENDANT.y - 0.05, PENDANT.z], MAX_SLOTS * 3);
  gSize[MAX_SLOTS] = 1.6;
  new THREE.Color('#ffd9a0').toArray(gCol, MAX_SLOTS * 3);
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
  gGeo.setAttribute('aSize', new THREE.BufferAttribute(gSize, 1));
  gGeo.setAttribute('aAmt', new THREE.BufferAttribute(gAmt, 1).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('aCol', new THREE.BufferAttribute(gCol, 3));
  const gMat = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uMap: { value: materials().glowTex }, uScale: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize; attribute float aAmt; attribute vec3 aCol;
      uniform float uPx; uniform float uScale;
      varying float vA; varying vec3 vC;
      void main() {
        vA = aAmt; vC = aCol;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aAmt > 0.001 ? aSize * uScale * uPx / -mv.z : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying float vA; varying vec3 vC;
      void main() {
        float m = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vC * vA, m * vA);
        #include <colorspace_fragment>
      }`,
  });
  const glow = new THREE.Points(gGeo, gMat);
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  group.add(glow);

  // Soft window haze (day): a big additive quad just inside the window.
  const hazeMat = new THREE.MeshBasicMaterial({ map: materials().glowTex, color: '#ffd8a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 4.6), hazeMat);
  haze.position.set(WALL_X + 0.45, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z0 + WINDOW.z1) / 2);
  haze.rotation.y = Math.PI / 2;
  haze.renderOrder = 2;
  group.add(haze);

  // Floor blob shadows (instanced): chairs, people, cats and static furniture.
  const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ map: materials().glowTex, color: '#000000', transparent: true, opacity: 1, depthWrite: false });
  blobMat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <color_pars_vertex>', 'attribute float aStr; varying float vStr;\n#include <color_pars_vertex>')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvStr = aStr;');
    s.fragmentShader = s.fragmentShader.replace('#include <color_pars_fragment>', 'varying float vStr;\n#include <color_pars_fragment>')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vStr;');
  };
  const BLOBS = 40;
  const blobs = new THREE.InstancedMesh(blobGeo, blobMat, BLOBS);
  blobGeo.setAttribute('aStr', new THREE.InstancedBufferAttribute(new Float32Array(BLOBS), 1).setUsage(THREE.DynamicDrawUsage));
  blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blobs.renderOrder = 1;
  blobs.frustumCulled = false;
  group.add(blobs);
  const _m = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const statics: [number, number, number, number, number][] = [
    // x, z, w, d, strength
    [SOFA.x, SOFA.z, SOFA.len + 0.5, 1.3, 0.5], [COFFEE.x, COFFEE.z, 1.3, 1.3, 0.35],
    ...STOOLS.map(([x, z]): [number, number, number, number, number] => [x, z, 0.6, 0.6, 0.35]),
    [WALL_X + 0.4, (COUNTER.z0 + COUNTER.z1) / 2, 1.0, COUNTER.z1 - COUNTER.z0 + 0.4, 0.3],
    [WALL_X + 0.35, SHELF.z0 + 1.5, 0.9, 3.4, 0.3],
    [1.48, WALL_Z + 0.42, 0.7, 0.7, 0.35], [3.72, WALL_Z + 0.45, 0.6, 0.6, 0.35], [WALL_X + 0.45, 4.15, 0.6, 0.6, 0.35],
    [WELL.x - 0.4, 2.9, 0.6, 0.6, 0.35], [-2.6, WALL_Z + 0.45, 0.55, 0.55, 0.35],
  ];
  const blobAttr = blobGeo.getAttribute('aStr') as THREE.InstancedBufferAttribute;
  statics.forEach(([x, z, w, d, st], i) => { blobs.setMatrixAt(i, _m.makeScale(w, 1, d).setPosition(x, 0.031, z)); blobAttr.setX(i, st); });
  const FIRST_DYNAMIC = statics.length;
  for (let i = FIRST_DYNAMIC; i < BLOBS; i++) blobs.setMatrixAt(i, zero);
  blobs.userData.first = FIRST_DYNAMIC;

  // Fixed light rig entries: pendant and window spill.
  lightRig.pos[PENDANT_LAMP].set(PENDANT.x, PENDANT.y - 0.3, PENDANT.z, 6.6);
  lightRig.pos[WINDOW_LAMP].set(WALL_X + 0.9, 2.3, (WINDOW.z0 + WINDOW.z1) / 2, 4.6);
  const pendantTint = new THREE.Color('#ffd9a0');

  // ---- per frame ----------------------------------------------------------------------
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _qq = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0);
  const _cm = new THREE.Matrix4();
  let glowScale = 1;
  const smoothLevel = (x: number) => x * x * (3 - 2 * x);

  return {
    group, seats, window: win, door, blobs, books, held,
    update(t, dt, atmo) {
      stUniforms.stTime.value = t;
      // Lamps: fade toward their target, tiny flicker, feed the shader rig.
      for (let i = 0; i < MAX_SLOTS; i++) {
        const L = seats[i].lamp;
        const step = dt / LAMP_FADE;
        L.level = L.target > L.level ? Math.min(L.target, L.level + step) : Math.max(L.target, L.level - step);
        const lv = smoothLevel(L.level) * (1 + 0.025 * Math.sin(t * 7.3 + i * 1.7) * Math.sin(t * 2.9 + i));
        lightRig.level[i] = lv * atmo.lampEmit;
        lightRig.col[i].set(L.tint.r, L.tint.g, L.tint.b).multiplyScalar(2.6 * atmo.lampLight * lv);
        lightRig.pos[i].set(L.world.x, L.world.y, L.world.z, L.reach);
        gAmt[i] = lv * atmo.lampGlow * 0.55;
      }
      lightRig.level[PENDANT_LAMP] = atmo.pendant;
      lightRig.col[PENDANT_LAMP].set(pendantTint.r, pendantTint.g, pendantTint.b).multiplyScalar(2.5 * atmo.pendant);
      gAmt[MAX_SLOTS] = 0.45 * atmo.pendant * atmo.lampGlow;
      lightRig.col[WINDOW_LAMP].set(atmo.spill.r, atmo.spill.g, atmo.spill.b).multiplyScalar(atmo.spillI);
      (gGeo.attributes.aAmt as THREE.BufferAttribute).needsUpdate = true;
      gMat.uniforms.uScale.value = glowScale;
      hazeMat.opacity = 0.16 * atmo.beam * (haze.visible ? 1 : 0);
      hazeMat.color.copy(atmo.sun);

      // Chairs and mugs follow their seats.
      for (let i = 0; i < MAX_SLOTS; i++) {
        const s = seats[i];
        const a = s.anchor;
        const c = Math.cos(a.rotation.y), sn = Math.sin(a.rotation.y);
        _p.set(a.position.x + sn * s.chair.offset, 0, a.position.z + c * s.chair.offset);
        _qq.setFromAxisAngle(_y, a.rotation.y + s.chair.yaw);
        chairs.setMatrixAt(i, _cm.compose(_p, _qq, _s.set(1, 1, 1)));
        // Kit unpacks with a little pop.
        s.kitShown += (s.kitTarget - s.kitShown) * (1 - Math.exp(-10 * dt));
        if (Math.abs(s.kitTarget - s.kitShown) < 0.002) s.kitShown = s.kitTarget;
        const k = s.kitShown;
        s.kit.visible = k > 0.01;
        const pop = k < 1 ? k * (1 + 0.12 * Math.sin(k * Math.PI)) : 1;
        s.kit.scale.setScalar(Math.max(0.001, pop));
        if (s.kit.visible) {
          s.mug.updateWorldMatrix(true, false);
          mugs.setMatrixAt(i, s.mug.matrixWorld);
        } else mugs.setMatrixAt(i, zero);
      }
      chairs.instanceMatrix.needsUpdate = true;
      mugs.instanceMatrix.needsUpdate = true;
    },
    setQuality(q) {
      glowScale = q.glow * 1.0;
      haze.visible = q.haze;
      win.setLow(q.simpleRain);
    },
    setPx(px) { gMat.uniforms.uPx.value = px; },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      [shellMat, furnMat, propMat, gMat, hazeMat, blobMat, books.material as THREE.Material].forEach((m) => m.dispose());
      win.dispose();
    },
  };
}

export { N_LAMPS };
