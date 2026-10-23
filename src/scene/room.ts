// The study hall (layout from the golden-hour / rainy-night references): a corner
// room with a big window, window counter and stools, three bays of bookshelves, a
// teal door wall, the long table on a teal rug, a lounge with a sofa, and a
// balustrade over the stairwell. Static pieces merge into two meshes (shell and
// furniture); books, chairs and mugs are instanced; seat kits are per seat.
import * as THREE from 'three';
import { EnvBuilder } from './envGeo';
import { envMaterial, lightRig, LOWER_LAMP, N_LAMPS, PENDANT_LAMP, STAIR_LAMP, WINDOW_LAMP, stUniforms } from './envMaterial';
import { buildWindowView, type WindowView } from './windowView';
import { backpackGeo, buildKit, buildLamp, chairGeo, mugGeo, type LampInfo } from './props';
import { frame } from './paintings';
import { buildDoor, buildDoorCasing, buildHallwayCorridor } from './hallway';
import { cyl, materials, rng, roundedBox, sphere, torus } from './toon';
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

// ---- shell ------------------------------------------------------------------------

function buildShell(): THREE.BufferGeometry {
  const b = new EnvBuilder();
  const r = rng(42);
  const WELL_X0 = WELL.x; // 3.68
  const WELL_X1 = WELL.x1; // 5.63
  const WELL_Z0 = WELL.z0; // -1.65
  const WELL_Z1 = WELL.z1; // 2.60
  const stairwellWidth = WELL_X1 - WELL_X0; // 1.95m
  const L_stair = WELL_Z1 - WELL_Z0; // 4.25m
  const Z_stair = (WELL_Z0 + WELL_Z1) / 2; // 0.475m

  // Floor: warm wood underlay showing through the plank seams, then staggered oak planks across the full room & right wing.
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WALL_X + 0.6, 0.04, WELL_Z0 - WALL_Z + 0.3), '#5a3622', { p: [(WALL_X + FLOOR_X1) / 2, -0.035, (WALL_Z + WELL_Z0) / 2] });
  b.add(new THREE.BoxGeometry(WELL_X0 - WALL_X + 0.3, 0.04, WELL_Z1 - WELL_Z0 + 0.01), '#5a3622', { p: [(WALL_X + WELL_X0) / 2, -0.035, (WELL_Z0 + WELL_Z1) / 2] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WELL_X1 + 0.3, 0.04, WELL_Z1 - WELL_Z0 + 0.01), '#5a3622', { p: [(WELL_X1 + FLOOR_X1) / 2, -0.035, (WELL_Z0 + WELL_Z1) / 2] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WALL_X + 0.6, 0.04, FLOOR_Z1 - WELL_Z1 + 0.3), '#5a3622', { p: [(WALL_X + FLOOR_X1) / 2, -0.035, (WELL_Z1 + FLOOR_Z1) / 2] });
  const PW = 0.34;
  for (let z = WALL_Z; z < FLOOR_Z1 - 0.01; z += PW) {
    const zc = z + PW / 2;
    const inWellZ = zc >= WELL_Z0 && zc <= WELL_Z1;
    const spans: [number, number][] = inWellZ ? [[WALL_X, WELL_X0], [WELL_X1, FLOOR_X1]] : [[WALL_X, FLOOR_X1]];
    for (const [spanX0, spanX1] of spans) {
      let x = spanX0 - r() * 1.6;
      while (x < spanX1) {
        const len = 1.5 + r() * 2.2;
        const x0 = Math.max(spanX0, x), x1 = Math.min(spanX1, x + len);
        if (x1 - x0 > 0.05) {
          const k = 0.88 + r() * 0.18;
          const c = new THREE.Color(r() < 0.25 ? '#b56d3b' : '#bd7a44').multiplyScalar(k);
          b.add(new THREE.BoxGeometry(x1 - x0 - 0.012, 0.03, PW - 0.012), '#' + c.getHexString(), { p: [(x0 + x1) / 2, -0.015, zc] });
        }
        x += len;
      }
    }
  }

  // Raised honey-oak border nosing around stairwell rim (sits slightly proud at Y = 0.005 to cover all cut plank edges cleanly)
  // Front rim under front balustrade
  b.add(roundedBox(stairwellWidth + 0.24, 0.036, 0.22, 0.008, 1), '#b8743c', {
    p: [(WELL_X0 + WELL_X1) / 2, -0.012, WELL_Z1 + 0.09],
  });
  // Left rim under left balustrade
  b.add(roundedBox(0.22, 0.036, L_stair + 0.22, 0.008, 1), '#b8743c', {
    p: [WELL_X0 - 0.09, -0.012, Z_stair],
  });
  // Right rim along right stairwell edge
  b.add(roundedBox(0.22, 0.036, L_stair + 0.22, 0.008, 1), '#b8743c', {
    p: [WELL_X1 + 0.09, -0.012, Z_stair],
  });
  // Rear rim under entry threshold
  b.add(roundedBox(stairwellWidth + 0.24, 0.036, 0.22, 0.008, 1), '#b8743c', {
    p: [(WELL_X0 + WELL_X1) / 2, -0.012, WELL_Z0 - 0.09],
  });
  // Rug under the table: teal with a thin gold double border, sized with clear floor margin before the stair railing.
  const RW = 6.16, RD = 3.76;
  b.add(roundedBox(RW, 0.024, RD, 0.01, 1), '#244f4c', { p: [0, 0.012, 0] });
  b.add(roundedBox(RW - 0.06, 0.026, RD - 0.06, 0.01, 1), '#2a5c58', { p: [0, 0.013, 0] });
  for (const inset of [0.2, 0.29]) {
    const w = RW - inset * 2, d = RD - inset * 2, t = 0.028;
    b.add(new THREE.BoxGeometry(w, 0.004, t), '#c9a457', { p: [0, 0.027, d / 2] });
    b.add(new THREE.BoxGeometry(w, 0.004, t), '#c9a457', { p: [0, 0.027, -d / 2] });
    b.add(new THREE.BoxGeometry(t, 0.004, d), '#c9a457', { p: [w / 2, 0.027, 0] });
    b.add(new THREE.BoxGeometry(t, 0.004, d), '#c9a457', { p: [-w / 2, 0.027, 0] });
  }
  // Round rug under the coffee table: teal ring around cream, centered in front of the L-shaped sofa.
  const rugX = COFFEE.x - 0.04, rugZ = COFFEE.z - 0.04;
  b.add(cyl(1.22, 1.22, 0.02, 48), '#2f6d6a', { p: [rugX, 0.01, rugZ] });
  b.add(cyl(1.1, 1.1, 0.024, 48), '#e6d6ba', { p: [rugX, 0.012, rugZ] });
  b.add(new THREE.TorusGeometry(0.98, 0.012, 3, 48), '#cdb994', { p: [rugX, 0.025, rugZ], r: [Math.PI / 2, 0, 0] });

  // Warm woven runner rug in the right-hand reading alcove (along the back wall past the second column)
  const grX = 7.55, grZ = -3.45, grW = 2.6, grD = 1.35;
  b.add(roundedBox(grW, 0.018, grD, 0.008, 1), '#244f4c', { p: [grX, 0.009, grZ] });
  b.add(roundedBox(grW - 0.14, 0.02, grD - 0.14, 0.008, 1), '#2a5c58', { p: [grX, 0.011, grZ] });
  b.add(roundedBox(grW - 0.28, 0.022, grD - 0.28, 0.006, 1), '#c9a457', { p: [grX, 0.013, grZ] });
  b.add(roundedBox(grW - 0.36, 0.024, grD - 0.36, 0.006, 1), '#ead9bc', { p: [grX, 0.015, grZ] });

  const T = 0.3;
  // Left wall (window wall): cream plaster with the window cut out. Shape x = −world z.
  const lw = new THREE.Shape();
  lw.moveTo(-FLOOR_Z1, 0); lw.lineTo(-(WALL_Z - T), 0); lw.lineTo(-(WALL_Z - T), WALL_H); lw.lineTo(-FLOOR_Z1, WALL_H); lw.closePath();
  const hole = new THREE.Path();
  hole.moveTo(-WINDOW.z1, WINDOW.y0); hole.lineTo(-WINDOW.z0, WINDOW.y0); hole.lineTo(-WINDOW.z0, WINDOW.y1); hole.lineTo(-WINDOW.z1, WINDOW.y1); hole.closePath();
  lw.holes.push(hole);
  b.add(new THREE.ExtrudeGeometry(lw, { depth: T, bevelEnabled: false }), CREAM_WALL, { p: [WALL_X - T, 0, 0], r: [0, Math.PI / 2, 0] });
  // Back wall (door wall): deep teal, door opening, extending across the full right wing.
  const dx0 = DOOR.x - DOOR.w / 2, dx1 = DOOR.x + DOOR.w / 2;
  const bw = new THREE.Shape();
  bw.moveTo(WALL_X - T, 0); bw.lineTo(dx0, 0); bw.lineTo(dx0, DOOR.h); bw.lineTo(dx1, DOOR.h); bw.lineTo(dx1, 0); bw.lineTo(FLOOR_X1 + T, 0); bw.lineTo(FLOOR_X1 + T, WALL_H); bw.lineTo(WALL_X - T, WALL_H); bw.closePath();
  b.add(new THREE.ExtrudeGeometry(bw, { depth: T, bevelEnabled: false }), TEAL_WALL, { p: [0, 0, WALL_Z - T] });
  const PX2 = 5.56;
  // Right-hand enclosing wall at x = FLOOR_X1 (warm cream plaster upper wall + full honey-oak wainscoting below)
  b.add(new THREE.BoxGeometry(T, WALL_H, FLOOR_Z1 - WALL_Z + T), CREAM_WALL, {
    p: [FLOOR_X1 + T / 2, WALL_H / 2, (FLOOR_Z1 + WALL_Z - T) / 2],
  });
  // Wall tops read as a cut section (along left wall, back wall, and right wall).
  b.add(new THREE.BoxGeometry(T + 0.02, 0.03, FLOOR_Z1 - WALL_Z + T), '#6e4730', { p: [WALL_X - T / 2, WALL_H + 0.015, (FLOOR_Z1 + WALL_Z - T) / 2] });
  b.add(new THREE.BoxGeometry(FLOOR_X1 - WALL_X + 2 * T, 0.03, T + 0.02), '#6e4730', { p: [(FLOOR_X1 + WALL_X) / 2, WALL_H + 0.015, WALL_Z - T / 2] });
  b.add(new THREE.BoxGeometry(T + 0.02, 0.03, FLOOR_Z1 - WALL_Z + T), '#6e4730', { p: [FLOOR_X1 + T / 2, WALL_H + 0.015, (FLOOR_Z1 + WALL_Z - T) / 2] });
  // Crown moulding along left wall, back wall, and right wall (at classic cornice height y = 5.30 and upper frieze cap).
  for (const cy of [5.30, WALL_H - 0.16]) {
    b.add(roundedBox(0.12, 0.14, FLOOR_Z1 - WALL_Z, 0.03, 1), '#e2c8a0', { p: [WALL_X + 0.05, cy, (FLOOR_Z1 + WALL_Z) / 2] });
    b.add(roundedBox(FLOOR_X1 - WALL_X + T, 0.14, 0.12, 0.03, 1), '#24504f', { p: [(FLOOR_X1 + WALL_X + T) / 2, cy, WALL_Z + 0.05] });
    b.add(roundedBox(0.12, 0.14, FLOOR_Z1 - WALL_Z, 0.03, 1), '#e2c8a0', { p: [FLOOR_X1 - 0.05, cy, (FLOOR_Z1 + WALL_Z) / 2] });
  }

  // Back wall wainscot: wood panels, top rail, baseboard (gaps at the door and pilasters).
  const WH = 1.28;
  const runs: [number, number][] = [[WALL_X, dx0 - 0.13], [dx1 + 0.13, PX2 - 0.2], [PX2 + 0.2, FLOOR_X1]];
  for (const [a, c] of runs) {
    const w = c - a;
    b.add(new THREE.BoxGeometry(w, WH, 0.04), '#9e5f34', { p: [(a + c) / 2, WH / 2, WALL_Z + 0.02] });
    b.add(roundedBox(w, 0.06, 0.09, 0.02, 1), '#b87240', { p: [(a + c) / 2, WH, WALL_Z + 0.045] });
    b.add(roundedBox(w, 0.16, 0.06, 0.015, 1), '#7a482c', { p: [(a + c) / 2, 0.08, WALL_Z + 0.05] });
    const n = Math.max(1, Math.round(w / 1.05));
    for (let k = 0; k < n; k++) {
      const pw = w / n;
      b.add(roundedBox(pw - 0.2, WH - 0.42, 0.03, 0.02, 1), '#ab6839', { p: [a + pw * (k + 0.5), 0.2 + (WH - 0.36) / 2, WALL_Z + 0.05] });
    }
  }
  // Right wall wainscot (along x = FLOOR_X1 from WALL_Z to FLOOR_Z1) matching the back wall wood paneling
  const rwLen = FLOOR_Z1 - WALL_Z;
  const rwMidZ = (FLOOR_Z1 + WALL_Z) / 2;
  b.add(new THREE.BoxGeometry(0.04, WH, rwLen), '#9e5f34', { p: [FLOOR_X1 - 0.02, WH / 2, rwMidZ] });
  b.add(roundedBox(0.09, 0.06, rwLen, 0.02, 1), '#b87240', { p: [FLOOR_X1 - 0.045, WH, rwMidZ] });
  b.add(roundedBox(0.06, 0.16, rwLen, 0.015, 1), '#7a482c', { p: [FLOOR_X1 - 0.05, 0.08, rwMidZ] });
  const rwN = Math.max(1, Math.round(rwLen / 1.05));
  for (let k = 0; k < rwN; k++) {
    const pzLen = rwLen / rwN;
    b.add(roundedBox(0.03, WH - 0.42, pzLen - 0.2, 0.02, 1), '#ab6839', {
      p: [FLOOR_X1 - 0.05, 0.2 + (WH - 0.36) / 2, WALL_Z + pzLen * (k + 0.5)],
    });
  }
  // Left wall: teal panelled wainscot beyond the counter, cream pier, baseboard.
  b.add(new THREE.BoxGeometry(0.04, 0.98, FLOOR_Z1 - COUNTER.z1), TEAL_PANEL, { p: [WALL_X + 0.02, 0.49, (FLOOR_Z1 + COUNTER.z1) / 2] });
  b.add(roundedBox(0.09, 0.06, FLOOR_Z1 - COUNTER.z1, 0.02, 1), OAK, { p: [WALL_X + 0.045, 0.98, (FLOOR_Z1 + COUNTER.z1) / 2] });
  b.add(roundedBox(0.06, 0.14, FLOOR_Z1 - WALL_Z, 0.015, 1), '#7a482c', { p: [WALL_X + 0.03, 0.07, (FLOOR_Z1 + WALL_Z) / 2] });

  // Twin cream pilasters on the back wall (left of the door at PX = 1.0, and right of the door at PX2 = 5.56).
  for (const PX of [1.0, PX2]) {
    b.add(roundedBox(0.36, WALL_H - 0.16, 0.14, 0.03, 1), '#e7d3b0', { p: [PX, (WALL_H - 0.16) / 2, WALL_Z + 0.07] });
    b.add(roundedBox(0.44, 0.12, 0.2, 0.03, 1), '#e2cba4', { p: [PX, 0.06, WALL_Z + 0.1] });
    b.add(roundedBox(0.44, 0.1, 0.2, 0.03, 1), '#e2cba4', { p: [PX, WH + 0.04, WALL_Z + 0.1] });
    b.add(roundedBox(0.44, 0.12, 0.2, 0.03, 1), '#e2cba4', { p: [PX, 5.26, WALL_Z + 0.1] });
    b.add(roundedBox(0.44, 0.12, 0.2, 0.03, 1), '#e2cba4', { p: [PX, WALL_H - 0.18, WALL_Z + 0.1] });
  }

  // Structural stairwell enclosure walls & lower library landing floor (warm cream plaster + honey-oak wainscoting, zero dark voids)
  const wellWallCream = '#edd9b8';
  const wellWainscot = '#b5723c';
  const wellPanel = '#c68148';
  const wellRail = '#cf8c52';
  const wellBase = '#8c532e';

  // Left stairwell wall (below upper floor, Y: -2.25 to -0.05)
  b.add(new THREE.BoxGeometry(0.14, 1.32, L_stair + 0.12), wellWallCream, { p: [WELL_X0 - 0.07, -0.71, Z_stair] });
  b.add(new THREE.BoxGeometry(0.15, 0.92, L_stair + 0.12), wellWainscot, { p: [WELL_X0 - 0.065, -1.80, Z_stair] });
  b.add(new THREE.BoxGeometry(0.17, 0.055, L_stair + 0.08), wellRail, { p: [WELL_X0 - 0.05, -1.34, Z_stair] });
  b.add(new THREE.BoxGeometry(0.17, 0.12, L_stair + 0.08), wellBase, { p: [WELL_X0 - 0.05, -2.16, Z_stair] });
  for (let pz = WELL_Z0 + 0.45; pz < WELL_Z1 - 0.25; pz += 0.82) {
    b.add(roundedBox(0.03, 0.56, 0.64, 0.01, 1), wellPanel, { p: [WELL_X0 + 0.015, -1.75, pz] });
  }

  // Front stairwell wall under front balustrade (Y: -2.25 to -0.05)
  b.add(new THREE.BoxGeometry(stairwellWidth + 0.24, 1.32, 0.14), wellWallCream, { p: [(WELL_X0 + WELL_X1) / 2, -0.71, WELL_Z1 + 0.07] });
  b.add(new THREE.BoxGeometry(stairwellWidth + 0.24, 0.92, 0.15), wellWainscot, { p: [(WELL_X0 + WELL_X1) / 2, -1.80, WELL_Z1 + 0.065] });
  b.add(new THREE.BoxGeometry(stairwellWidth + 0.2, 0.055, 0.17), wellRail, { p: [(WELL_X0 + WELL_X1) / 2, -1.34, WELL_Z1 + 0.05] });
  b.add(new THREE.BoxGeometry(stairwellWidth + 0.2, 0.12, 0.17), wellBase, { p: [(WELL_X0 + WELL_X1) / 2, -2.16, WELL_Z1 + 0.05] });

  // Back stairwell wall under entry threshold (Y: -2.25 to -0.05)
  b.add(new THREE.BoxGeometry(stairwellWidth + 0.24, 1.32, 0.14), wellWallCream, { p: [(WELL_X0 + WELL_X1) / 2, -0.71, WELL_Z0 - 0.07] });
  b.add(new THREE.BoxGeometry(stairwellWidth + 0.24, 0.92, 0.15), wellWainscot, { p: [(WELL_X0 + WELL_X1) / 2, -1.80, WELL_Z0 - 0.065] });
  b.add(new THREE.BoxGeometry(stairwellWidth + 0.2, 0.055, 0.17), wellRail, { p: [(WELL_X0 + WELL_X1) / 2, -1.34, WELL_Z0 - 0.05] });

  // Right stairwell wall (below upper floor, Y: -2.25 to -0.05)
  b.add(new THREE.BoxGeometry(0.14, 1.32, L_stair + 0.12), wellWallCream, { p: [WELL_X1 + 0.07, -0.71, Z_stair] });
  b.add(new THREE.BoxGeometry(0.15, 0.92, L_stair + 0.12), wellWainscot, { p: [WELL_X1 + 0.065, -1.80, Z_stair] });
  b.add(new THREE.BoxGeometry(0.17, 0.055, L_stair + 0.08), wellRail, { p: [WELL_X1 + 0.05, -1.34, Z_stair] });
  b.add(new THREE.BoxGeometry(0.17, 0.12, L_stair + 0.08), wellBase, { p: [WELL_X1 + 0.05, -2.16, Z_stair] });
  for (let pz = WELL_Z0 + 0.45; pz < WELL_Z1 - 0.25; pz += 0.82) {
    b.add(roundedBox(0.03, 0.56, 0.64, 0.01, 1), wellPanel, { p: [WELL_X1 - 0.015, -1.75, pz] });
  }

  // Complete lower library landing floor at Y = -2.22m spanning the entire stairwell (no void under the stairs)
  const lowerFloorW = stairwellWidth + 0.45;
  const lowerFloorD = L_stair + 0.55;
  b.add(new THREE.BoxGeometry(lowerFloorW, 0.14, lowerFloorD), '#a66838', {
    p: [(WELL_X0 + WELL_X1) / 2, -2.22 - 0.07, Z_stair],
  });
  // Staggered warm honey-oak planks on the lower landing floor
  for (let lz = WELL_Z0 - 0.15; lz < WELL_Z1 + 0.12; lz += 0.28) {
    const lzc = lz + 0.14;
    for (let lx = WELL_X0 - 0.05; lx < WELL_X1 + 0.02; lx += 0.95) {
      const lx0 = Math.max(WELL_X0 - 0.05, lx);
      const lx1 = Math.min(WELL_X1 + 0.05, lx + 0.93);
      const col = ((Math.round(lz * 10 + lx * 5) % 2) === 0) ? '#c9884e' : '#bf7c43';
      b.add(new THREE.BoxGeometry(lx1 - lx0 - 0.01, 0.024, 0.268), col, {
        p: [(lx0 + lx1) / 2, -2.215, lzc],
      });
    }
  }
  // Cozy lower landing rug at the foot of the stairs
  const lrX = (WELL_X0 + WELL_X1) / 2, lrZ = WELL_Z1 - 0.68;
  b.add(roundedBox(1.52, 0.018, 1.05, 0.008, 1), '#2a5c58', { p: [lrX, -2.202, lrZ] });
  b.add(roundedBox(1.36, 0.02, 0.89, 0.008, 1), '#efe0c4', { p: [lrX, -2.20, lrZ] });
  b.add(roundedBox(1.22, 0.022, 0.75, 0.006, 1), '#c9a457', { p: [lrX, -2.198, lrZ] });
  b.add(roundedBox(1.16, 0.024, 0.69, 0.006, 1), '#2f6d6a', { p: [lrX, -2.196, lrZ] });

  // Oak fascia trim board along the drop-off edges
  b.add(new THREE.BoxGeometry(0.04, 0.22, L_stair), '#b06d3a', {
    p: [WELL_X0 + 0.015, -0.11, Z_stair],
  });
  b.add(new THREE.BoxGeometry(stairwellWidth, 0.22, 0.04), '#b06d3a', {
    p: [(WELL_X0 + WELL_X1) / 2, -0.11, WELL_Z1 - 0.015],
  });
  b.add(new THREE.BoxGeometry(0.04, 0.22, L_stair), '#b06d3a', {
    p: [WELL_X1 - 0.015, -0.11, Z_stair],
  });

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
  const x = WALL_X - 0.13;
  const zc = (z0 + z1) / 2, yc = (y0 + y1) / 2;
  const W = z1 - z0, H = y1 - y0;
  const F = '#c8884a';
  const F_DARK = '#9e622e';
  const F_LIGHT = '#df9e5c';
  const REVEAL = '#d6b68a';

  // 1. Deep architectural wall reveal / jamb lining the entire wall thickness (x: WALL_X - 0.30 to WALL_X + 0.02)
  const revDepth = 0.32;
  const revX = WALL_X - 0.14;
  // Left & right vertical reveals
  b.add(new THREE.BoxGeometry(revDepth, H + 0.04, 0.045), REVEAL, { p: [revX, yc, z0 + 0.02] });
  b.add(new THREE.BoxGeometry(revDepth, H + 0.04, 0.045), REVEAL, { p: [revX, yc, z1 - 0.02] });
  // Top head reveal
  b.add(new THREE.BoxGeometry(revDepth, 0.045, W + 0.04), REVEAL, { p: [revX, y1 - 0.02, zc] });
  // Recessed wood jamb liners inside the reveal
  b.add(roundedBox(0.24, H, 0.055, 0.012, 1), F, { p: [WALL_X - 0.1, yc, z0 + 0.028] });
  b.add(roundedBox(0.24, H, 0.055, 0.012, 1), F, { p: [WALL_X - 0.1, yc, z1 - 0.028] });
  b.add(roundedBox(0.24, 0.055, W, 0.012, 1), F, { p: [WALL_X - 0.1, y1 - 0.028, zc] });

  // 2. Projecting bullnose oak inner window sill (stool) & molded apron underneath
  const sillDepth = 0.42; // spans from x = WALL_X - 0.28 out into room at WALL_X + 0.14
  b.add(roundedBox(sillDepth, 0.06, W + 0.42, 0.02, 2), F_LIGHT, {
    p: [WALL_X - 0.07, y0 + 0.02, zc],
  });
  // Supportive molded apron trim below the sill on the room face
  b.add(roundedBox(0.065, 0.09, W + 0.32, 0.018, 1), F_DARK, {
    p: [WALL_X + 0.032, y0 - 0.045, zc],
  });

  // 3. Stepped outer casing & pediment header on the room side (x = WALL_X + 0.035)
  b.add(roundedBox(0.085, 0.18, W + 0.36, 0.025, 1), F, { p: [WALL_X + 0.04, y1 + 0.08, zc] });
  b.add(roundedBox(0.115, 0.055, W + 0.44, 0.015, 1), F_DARK, { p: [WALL_X + 0.055, y1 + 0.18, zc] });
  b.add(roundedBox(0.085, H + 0.16, 0.17, 0.025, 1), F, { p: [WALL_X + 0.04, yc + 0.04, z0 - 0.08] });
  b.add(roundedBox(0.085, H + 0.16, 0.17, 0.025, 1), F, { p: [WALL_X + 0.04, yc + 0.04, z1 + 0.08] });

  // 4. Heavy outer sash frame in the glass plane
  b.add(roundedBox(0.14, 0.08, W, 0.02, 1), F_DARK, { p: [x, y0 + 0.05, zc] });
  b.add(roundedBox(0.14, 0.08, W, 0.02, 1), F_DARK, { p: [x, y1 - 0.04, zc] });
  b.add(roundedBox(0.14, H, 0.08, 0.02, 1), F_DARK, { p: [x, yc, z0 + 0.04] });
  b.add(roundedBox(0.14, H, 0.08, 0.02, 1), F_DARK, { p: [x, yc, z1 - 0.04] });

  // 5. Deep 3D beveled mullions (muntin bars) dividing the 4x4 panes
  for (let c = 1; c < cols; c++) {
    const mz = z0 + (W * c) / cols;
    b.add(roundedBox(0.13, H - 0.08, 0.085, 0.022, 1), F_DARK, { p: [x - 0.01, yc, mz] });
    b.add(roundedBox(0.075, H - 0.08, 0.062, 0.018, 1), F_LIGHT, { p: [x + 0.032, yc, mz] });
  }
  for (let rr = 1; rr < rows; rr++) {
    const my = y0 + (H * rr) / rows;
    b.add(roundedBox(0.13, 0.085, W - 0.08, 0.022, 1), F_DARK, { p: [x - 0.01, my, zc] });
    b.add(roundedBox(0.075, 0.062, W - 0.08, 0.018, 1), F_LIGHT, { p: [x + 0.032, my, zc] });
  }

  // 6. Cozy books stacked on the inner window sill
  const sillY = y0 + 0.052;
  const sillX = WALL_X + 0.02;
  const sillBooks: [number, number, number, string, number][] = [
    [-0.28, 0.22, 0.16, '#3f6b8a', 0.08],
    [-0.28, 0.20, 0.15, '#c97a4a', -0.12],
    [-0.28, 0.18, 0.14, '#d9a441', 0.05],
    [1.62, 0.23, 0.16, '#4f7d5c', -0.14],
    [1.62, 0.21, 0.15, '#b6584a', 0.09],
  ];
  let curY1 = sillY, curY2 = sillY;
  sillBooks.forEach(([bz, bw, bd, col, rot], idx) => {
    const bh = 0.034;
    const by = idx < 3 ? (curY1 += bh) - bh / 2 : (curY2 += bh) - bh / 2;
    b.add(roundedBox(bd, bh, bw, 0.007, 1), col, { p: [sillX, by, bz], r: [0, rot, 0] });
    b.add(new THREE.BoxGeometry(bd - 0.015, bh - 0.008, bw - 0.015), '#f4ebd9', { p: [sillX + 0.004, by, bz], r: [0, rot, 0] });
  });
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
  // Fitted oak corner return filler sealing the 20cm reveal between SHELF.z0 (-5.0) and the back wall (WALL_Z = -5.2)
  const gapZ = z0 - WALL_Z;
  if (gapZ > 0.01) {
    b.add(roundedBox(depth - 0.01, h, gapZ + 0.02, 0.012, 1), OAK_DARK, { p: [xc, h / 2, WALL_Z + gapZ / 2] });
    b.add(roundedBox(depth + 0.05, 0.08, gapZ + 0.06, 0.015, 1), OAK_DARK, { p: [xc + 0.02, h + 0.04, WALL_Z + gapZ / 2] });
  }
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
  const th = '#ece2cc';

  // 1. Main left-wall sofa section (runs along Z with back against WALL_X = -4.9, seat facing +X toward the coffee table & round rug)
  // Built in local space facing +z (back at -z); rotated +Math.PI/2 around Y so local +z -> world +x, local -x -> world +z.
  const sb = new EnvBuilder();
  sb.add(roundedBox(len, 0.26, 0.94, 0.08, 2), S3, { p: [0, 0.17, 0] }, { ao: 0.3 });
  for (let k = 0; k < 2; k++) {
    const cw = (len - 0.36) / 2;
    sb.add(roundedBox(cw - 0.04, 0.15, 0.74, 0.07, 2), S2, { p: [(-0.5 + k) * cw, 0.36, 0.06] });
  }
  sb.add(roundedBox(len, 0.62, 0.26, 0.1, 2), S, { p: [0, 0.47, -0.36] }, { ao: 0.25 });
  for (let k = 0; k < 2; k++) {
    const cw = (len - 0.36) / 2;
    sb.add(roundedBox(cw - 0.06, 0.42, 0.2, 0.09, 2), S2, { p: [(-0.5 + k) * cw, 0.6, -0.2], r: [0.18, 0, 0] });
  }
  for (const sd of [-1, 1]) sb.add(roundedBox(0.26, 0.56, 0.96, 0.11, 2), S, { p: [sd * (len / 2 - 0.1), 0.3, 0] }, { ao: 0.3 });
  for (const lx of [-len / 2 + 0.12, len / 2 - 0.12]) for (const lz of [-0.36, 0.36]) sb.add(cyl(0.035, 0.03, 0.06, 8), OAK_DEEP, { p: [lx, 0.03, lz] });
  // Green/teal cushion nestled visibly between the seated student and the sleeping orange tabby cat
  sb.add(roundedBox(0.42, 0.38, 0.15, 0.07, 2), '#2f6f69', { p: [-0.04, 0.62, -0.10], r: [0.26, 0.14, 0.04] });
  // Cream knit blanket with fringe draped over the +Z arm (local -x = -len/2 + 0.1, matching reference image)
  const ax = -len / 2 + 0.1;
  sb.add(roundedBox(0.34, 0.035, 0.54, 0.016, 2), th, { p: [ax, 0.6, 0.02] });
  sb.add(roundedBox(0.035, 0.42, 0.54, 0.016, 2), th, { p: [ax - 0.15, 0.4, 0.02], r: [0, 0, 0.06] });
  sb.add(roundedBox(0.2, 0.035, 0.52, 0.016, 2), th, { p: [ax + 0.22, 0.45, 0.03], r: [0, 0, -0.35] });
  for (let k = 0; k < 5; k++) sb.add(new THREE.BoxGeometry(0.04, 0.4, 0.008), '#d6c8ad', { p: [ax - 0.168, 0.4, -0.22 + k * 0.11], r: [0, 0, 0.06] });
  b.add(sb.build(), null, { p: [x, 0, z], r: [0, Math.PI / 2, 0] });

  // 2. Lower-left corner sofa section (runs along X at z2 = 5.26, back at +Z, seat facing -Z toward the coffee table & round rug)
  // Built in local space facing +z (back at -z); rotated Math.PI around Y so local +z -> world -z, local -x -> world +x.
  const len2 = 1.76, x2 = -3.14, z2 = 5.26;
  const sb2 = new EnvBuilder();
  sb2.add(roundedBox(len2, 0.26, 0.94, 0.08, 2), S3, { p: [0, 0.17, 0] }, { ao: 0.3 });
  for (let k = 0; k < 2; k++) {
    const cw = (len2 - 0.36) / 2;
    sb2.add(roundedBox(cw - 0.05, 0.15, 0.74, 0.07, 2), S2, { p: [(-0.5 + k) * cw, 0.36, 0.06] });
  }
  sb2.add(roundedBox(len2, 0.62, 0.26, 0.1, 2), S, { p: [0, 0.47, -0.36] }, { ao: 0.25 });
  for (let k = 0; k < 2; k++) {
    const cw = (len2 - 0.36) / 2;
    sb2.add(roundedBox(cw - 0.06, 0.42, 0.2, 0.09, 2), S2, { p: [(-0.5 + k) * cw, 0.6, -0.2], r: [0.18, 0, 0] });
  }
  for (const sd of [-1, 1]) sb2.add(roundedBox(0.26, 0.56, 0.96, 0.11, 2), S, { p: [sd * (len2 / 2 - 0.1), 0.3, 0] }, { ao: 0.3 });
  for (const lx of [-len2 / 2 + 0.12, len2 / 2 - 0.12]) for (const lz of [-0.36, 0.36]) sb2.add(cyl(0.035, 0.03, 0.06, 8), OAK_DEEP, { p: [lx, 0.03, lz] });
  // Folded cream throw / pillow on the right (+X) armrest (local -x = -len2/2 + 0.12, matching reference image)
  const armRight = -len2 / 2 + 0.12;
  sb2.add(roundedBox(0.34, 0.12, 0.56, 0.04, 2), '#eadfc8', { p: [armRight + 0.04, 0.61, 0.02], r: [0, 0, -0.08] });
  b.add(sb2.build(), null, { p: [x2, 0, z2], r: [0, Math.PI, 0] });

  // 3. Round coffee table with a plant and a closed teal book, positioned in front of both sofa sections.
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

function createTurnedNewelPost(height = 1.04): THREE.BufferGeometry {
  const b = new EnvBuilder();
  const honeyOak = '#b8743c';
  const darkerOak = '#9c5f30';

  // Square base plinth
  b.add(new THREE.BoxGeometry(0.115, 0.34, 0.115), darkerOak, { p: [0, 0.17, 0] }, { ao: 0.25 });

  // Decorative base collar molding
  b.add(new THREE.BoxGeometry(0.13, 0.03, 0.13), honeyOak, { p: [0, 0.35, 0] });

  // Turned middle shaft
  const shaftH = height - 0.52;
  b.add(new THREE.CylinderGeometry(0.046, 0.052, shaftH, 16), honeyOak, { p: [0, 0.36 + shaftH / 2, 0] });

  // Upper square block where handrail joins
  b.add(new THREE.BoxGeometry(0.105, 0.14, 0.105), darkerOak, { p: [0, height - 0.11, 0] });

  // Acorn / sphere finial cap
  b.add(new THREE.CylinderGeometry(0.045, 0.058, 0.025, 16), honeyOak, { p: [0, height - 0.025, 0] });
  b.add(new THREE.SphereGeometry(0.052, 16, 16), honeyOak, { p: [0, height + 0.03, 0], s: [1, 1.18, 1] });

  return b.build();
}

function createTurnedBaluster(height = 0.84): THREE.BufferGeometry {
  const b = new EnvBuilder();
  const honeyOak = '#b8743c';
  const darkerOak = '#9c5f30';

  // Base
  b.add(new THREE.BoxGeometry(0.034, 0.14, 0.034), honeyOak, { p: [0, 0.07, 0] });

  // Turned spindle
  b.add(new THREE.CylinderGeometry(0.015, 0.019, height - 0.24, 10), honeyOak, { p: [0, height * 0.5, 0] });

  // Torus ring
  b.add(new THREE.TorusGeometry(0.02, 0.006, 8, 12), darkerOak, { p: [0, height * 0.38, 0], r: [Math.PI / 2, 0, 0] });

  // Top block
  b.add(new THREE.BoxGeometry(0.032, 0.10, 0.032), honeyOak, { p: [0, height - 0.05, 0] });

  return b.build();
}

function addBalustradeRun(
  b: EnvBuilder,
  postGeo: THREE.BufferGeometry,
  balusterGeo: THREE.BufferGeometry,
  ax: number, az: number,
  bx: number, bz: number,
  railHeight = 0.92,
  includeStartPost = true,
  includeEndPost = true,
) {
  const honeyOak = '#b8743c';
  const darkerOak = '#9c5f30';
  const dx = bx - ax, dz = bz - az;
  const L = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const mx = (ax + bx) / 2, mz = (az + bz) / 2;

  // Bottom shoe rail
  b.add(new THREE.BoxGeometry(0.075, 0.045, L), darkerOak, { p: [mx, 0.0225, mz], r: [0, ry, 0] });

  // Moulded top handrail
  b.add(roundedBox(0.088, 0.055, L, 0.015, 1), honeyOak, { p: [mx, railHeight, mz], r: [0, ry, 0] });

  // Sub-rail under top handrail
  b.add(new THREE.BoxGeometry(0.06, 0.022, L), darkerOak, { p: [mx, railHeight - 0.035, mz], r: [0, ry, 0] });

  // Evenly spaced balusters
  const spacing = 0.135;
  const count = Math.max(1, Math.floor((L - 0.18) / spacing));
  const actualStep = (L - 0.16) / count;
  for (let i = 0; i <= count; i++) {
    const dist = 0.08 + i * actualStep;
    if (dist < 0.09 || dist > L - 0.09) continue;
    const t = dist / L;
    const px = ax + dx * t;
    const pz = az + dz * t;
    b.add(balusterGeo, null, { p: [px, 0.045, pz] });
  }

  if (includeStartPost) {
    b.add(postGeo, null, { p: [ax, 0, az] });
  }
  if (includeEndPost) {
    b.add(postGeo, null, { p: [bx, 0, bz] });
  }
}

function addBookRow(b: EnvBuilder, width: number, x: number, y: number, z: number) {
  const palette = ['#8b261d', '#1e4d3b', '#243b55', '#9c622b', '#5c2c45', '#3b5338', '#7a4928'];
  let cursor = -width / 2 + 0.03;
  let idx = 0;
  while (cursor < width / 2 - 0.04) {
    const bW = 0.028 + ((idx * 17) % 18) * 0.0012;
    const bH = 0.19 + ((idx * 23) % 10) * 0.006;
    const bD = 0.17 + ((idx * 13) % 6) * 0.005;
    const color = palette[idx % palette.length];
    b.add(new THREE.BoxGeometry(bW, bH, bD), color, { p: [x + cursor + bW / 2, y + bH / 2, z] }, { ao: 0.2 });
    cursor += bW + 0.004;
    idx++;
  }
}

function buildBalustrade(b: EnvBuilder) {
  const honeyOak = '#c27c42';
  const darkerOak = '#a66534';
  const agedBrass = '#d8a94e';
  const walnutWood = '#9a5d32';

  const holeMinX = WELL.x; // 3.68
  const holeMaxX = WELL.x1; // 5.63
  const holeMinZ = WELL.z0; // -1.65 (Back: stair entry)
  const holeMaxZ = WELL.z1; // 2.60 (Front: lower landing & front balustrade)

  const postGeo = createTurnedNewelPost(1.04);
  const balusterGeo = createTurnedBaluster(0.85);

  // 1. BALUSTRADES (Complete 3-sided U-shaped guardrail around the stairwell opening; back edge Z = holeMinZ is the stair entry)
  // Left side balustrade along X = holeMinX from Z = holeMinZ to Z = holeMaxZ
  addBalustradeRun(b, postGeo, balusterGeo, holeMinX, holeMinZ, holeMinX, holeMaxZ, 0.92, true, true);

  // Front balustrade run across front edge (Z = holeMaxZ) from X = holeMinX to X = holeMaxX
  addBalustradeRun(b, postGeo, balusterGeo, holeMinX, holeMaxZ, holeMaxX, holeMaxZ, 0.92, false, true);

  // Right side balustrade along X = holeMaxX from Z = holeMaxZ back to Z = holeMinZ
  addBalustradeRun(b, postGeo, balusterGeo, holeMaxX, holeMaxZ, holeMaxX, holeMinZ, 0.92, false, true);

  // 2. FLUSH TOP LANDING NOSING & FULL-WIDTH STAIRS (DESCENDING FORWARD TOWARD +Z WITH ZERO SIDE GAPS)
  const stairXCenter = (holeMinX + holeMaxX) / 2; // 4.655, centered in the stairwell
  const stairWidth = (holeMaxX - holeMinX) - 0.08; // 1.87m: spans wall-to-wall between the left and right stringers
  const numSteps = 12;
  const stepRise = 0.185;
  const stepRun = 0.255;
  const totalRun = numSteps * stepRun; // 3.06m
  const totalDrop = numSteps * stepRise; // 2.22m

  // Flush top landing nosing plank at Z = holeMinZ, Y = 0 spanning the full entry width
  b.add(roundedBox(stairWidth + 0.08, 0.036, 0.18, 0.008, 1), honeyOak, {
    p: [stairXCenter, -0.012, holeMinZ - 0.03],
  });

  // Steps descending forward in +Z direction
  for (let i = 0; i < numSteps; i++) {
    const treadY = -(i + 1) * stepRise;
    const treadZ = holeMinZ + (i + 0.5) * stepRun;

    // Closed vertical riser (starts strictly under previous tread / nosing plank)
    const riserTop = i === 0 ? -0.012 : -(i * stepRise);
    const riserH = riserTop - treadY + 0.018;
    b.add(
      new THREE.BoxGeometry(stairWidth + 0.02, riserH, 0.024),
      darkerOak,
      { p: [stairXCenter, (riserTop + treadY) / 2, holeMinZ + i * stepRun + 0.01] },
      { ao: 0.08 },
    );

    // Solid under-step carriage block so there is never any gap between or behind steps
    b.add(
      new THREE.BoxGeometry(stairWidth + 0.04, stepRise + 0.04, stepRun + 0.02),
      darkerOak,
      { p: [stairXCenter, treadY - stepRise / 2, treadZ] },
    );

    // Horizontal oak tread
    b.add(
      roundedBox(stairWidth + 0.02, 0.036, stepRun + 0.03, 0.008, 1),
      honeyOak,
      { p: [stairXCenter, treadY, treadZ] },
      { ao: 0.06 },
    );

    // Rounded front bullnose nosing on front edge of each tread (facing +Z)
    b.add(
      new THREE.CylinderGeometry(0.018, 0.018, stairWidth + 0.02, 12),
      honeyOak,
      { p: [stairXCenter, treadY, treadZ + stepRun / 2 + 0.01], r: [0, 0, Math.PI / 2] },
    );

    // Warm recessed architectural step light fixture on every 3rd step along both stringers
    if (i % 3 === 1) {
      b.add(
        new THREE.BoxGeometry(0.018, 0.05, 0.10),
        '#fff0b8',
        { p: [holeMaxX - 0.035, treadY + 0.09, treadZ] },
        { emit: LOWER_LAMP, glow: 1.8 },
      );
    }
  }

  // 3. SOLID FULL-DEPTH TIMBER STRINGERS FLUSH AGAINST BOTH STAIRWELL WALLS
  const stringerLength = Math.hypot(totalRun, totalDrop) + 0.25;
  const pitchAngle = Math.atan2(totalDrop, totalRun);

  for (const xPos of [holeMinX + 0.03, holeMaxX - 0.03]) {
    b.add(
      new THREE.BoxGeometry(0.06, 0.34, stringerLength),
      darkerOak,
      {
        p: [xPos, -totalDrop / 2 - 0.09, holeMinZ + totalRun / 2],
        r: [pitchAngle, 0, 0],
      },
      { ao: 0.1 },
    );
  }

  const lowerLandingY = -totalDrop; // -2.22m

  // 4. DESCENDING OAK HANDRAILS ALONG BOTH STAIRWELL WALLS
  const wallHandrailLength = stringerLength - 0.12;
  const midY = -totalDrop / 2;
  const midZ = holeMinZ + totalRun / 2;

  for (const side of [-1, 1]) {
    const hX = side < 0 ? holeMinX + 0.075 : holeMaxX - 0.075;
    // Moulded descending top handrail
    b.add(
      new THREE.CylinderGeometry(0.028, 0.028, wallHandrailLength, 14),
      honeyOak,
      {
        p: [hX, midY + 0.86, midZ],
        r: [Math.PI / 2 + pitchAngle, 0, 0],
      },
    );
    // Brass wall brackets supporting the descending handrail
    for (const frac of [0.2, 0.5, 0.8]) {
      const bz = holeMinZ + totalRun * frac;
      const by = -totalDrop * frac + 0.80;
      b.add(
        new THREE.BoxGeometry(0.06, 0.022, 0.022),
        agedBrass,
        { p: [hX - side * 0.03, by, bz] },
      );
    }
  }

  // 5. LOWER LIBRARY HALL LANDING, BOOKSHELF & PLANT AT BOTTOM OF STAIRS

  // Lower library bookshelf against front wall of bottom landing (facing -Z)
  b.add(
    roundedBox(1.52, 2.02, 0.26, 0.02, 1),
    walnutWood,
    { p: [stairXCenter + 0.04, lowerLandingY + 1.01, holeMaxZ - 0.15] },
    { ao: 0.15 },
  );

  // 4 shelves of books
  for (let row = 0; row < 4; row++) {
    const sy = lowerLandingY + 0.35 + row * 0.44;
    b.add(
      new THREE.BoxGeometry(1.44, 0.03, 0.24),
      honeyOak,
      { p: [stairXCenter + 0.04, sy, holeMaxZ - 0.15] },
    );
    addBookRow(b, 1.32, stairXCenter + 0.04, sy + 0.015, holeMaxZ - 0.15);
  }

  // Welcoming potted plant on the lower landing beside the bookshelf
  plant(b, holeMinX + 0.26, holeMaxZ - 0.42, {
    pot: '#efe8dc', potType: 'ceramic', style: 'bush',
    potR: 0.13, potH: 0.2, leaves: 14, height: 0.55, spread: 0.9, y0: lowerLandingY, seed: 314,
  });

  // 6. WARM LIGHT SOURCES IN THE STAIRWELL & RIGHT GALLERY
  // (A) Warm brass sconce in lower library hall (above bookshelf illuminating the landing)
  const scX = stairXCenter + 0.04;
  b.add(
    new THREE.CylinderGeometry(0.07, 0.07, 0.02, 16),
    agedBrass,
    { p: [scX, lowerLandingY + 2.08, holeMaxZ - 0.02], r: [Math.PI / 2, 0, 0] },
  );
  b.add(
    new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8),
    agedBrass,
    { p: [scX, lowerLandingY + 2.08, holeMaxZ - 0.08] },
  );
  b.add(
    new THREE.CylinderGeometry(0.055, 0.095, 0.16, 16),
    '#fff3d1',
    { p: [scX, lowerLandingY + 2.15, holeMaxZ - 0.12] },
    { emit: LOWER_LAMP, glow: 2.2 },
  );

  // (B) Warm brass wall sconce & framed botanical plaque on the left stairwell wall above the lower steps
  const swX = holeMinX + 0.015, swY = -0.46, swZ = 1.72;
  b.add(cyl(0.055, 0.06, 0.018, 14), agedBrass, { p: [swX, swY, swZ], r: [0, 0, Math.PI / 2] });
  b.add(new THREE.BoxGeometry(0.08, 0.02, 0.02), agedBrass, { p: [swX + 0.04, swY - 0.02, swZ] });
  b.add(cyl(0.055, 0.038, 0.13, 14), '#fff3cf', { p: [swX + 0.08, swY + 0.05, swZ] }, { emit: LOWER_LAMP, glow: 2.0 });
  const pqZ = 1.15, pqY = -0.48;
  b.add(roundedBox(0.026, 0.42, 0.34, 0.008, 1), darkerOak, { p: [swX, pqY, pqZ] });
  b.add(new THREE.BoxGeometry(0.03, 0.34, 0.26), '#f5ead4', { p: [swX + 0.003, pqY, pqZ] });
  b.add(new THREE.BoxGeometry(0.032, 0.20, 0.14), '#4e7d52', { p: [swX + 0.005, pqY, pqZ] });

  // (C) Matching warm glowing stairwell window on the right stairwell wall above the lower steps
  const rwX = holeMaxX - 0.02, rwY = -0.52, rwZ = 1.42;
  b.add(roundedBox(0.045, 0.62, 0.96, 0.015, 1), darkerOak, { p: [rwX, rwY, rwZ] });
  b.add(new THREE.BoxGeometry(0.028, 0.52, 0.86), '#fff3cf', { p: [rwX - 0.008, rwY, rwZ] }, { emit: STAIR_LAMP, glow: 1.9 });
  b.add(new THREE.BoxGeometry(0.05, 0.56, 0.032), honeyOak, { p: [rwX - 0.005, rwY, rwZ] });
  b.add(new THREE.BoxGeometry(0.05, 0.032, 0.90), honeyOak, { p: [rwX - 0.005, rwY, rwZ] });

  // (D) Warm brass wall sconces on the back wall flanking the stairwell & right gallery
  for (const [bx, by] of [[4.95, 2.25], [6.25, 2.25], [8.85, 2.25]] as [number, number][]) {
    b.add(cyl(0.065, 0.072, 0.022, 16), agedBrass, { p: [bx, by, WALL_Z + 0.04], r: [Math.PI / 2, 0, 0] });
    b.add(new THREE.BoxGeometry(0.024, 0.024, 0.14), agedBrass, { p: [bx, by - 0.02, WALL_Z + 0.10] });
    b.add(cyl(0.075, 0.048, 0.16, 16), '#fff3d1', { p: [bx, by + 0.09, WALL_Z + 0.16] }, { emit: STAIR_LAMP, glow: 2.2 });
  }

  // (E) Cozy open-front library bookcase / credenza in the right-hand reading alcove against the back wall
  const credX = 7.55, credZ = WALL_Z + 0.24;
  b.add(new THREE.BoxGeometry(1.85, 0.88, 0.04), darkerOak, { p: [credX, 0.44, credZ - 0.16] });
  for (const sx of [-0.90, 0.90]) {
    b.add(roundedBox(0.05, 0.88, 0.36, 0.01, 1), honeyOak, { p: [credX + sx, 0.44, credZ] });
  }
  b.add(roundedBox(1.92, 0.05, 0.40, 0.015, 1), honeyOak, { p: [credX, 0.89, credZ] });
  b.add(roundedBox(1.88, 0.08, 0.38, 0.015, 1), darkerOak, { p: [credX, 0.04, credZ] });
  for (const sy of [0.08, 0.46]) {
    b.add(new THREE.BoxGeometry(1.76, 0.03, 0.34), honeyOak, { p: [credX, sy, credZ + 0.01] });
    addBookRow(b, 1.66, credX, sy + 0.015, credZ + 0.04);
  }
  // Warm reading lamp & stacked books on top of the right-alcove credenza
  b.add(cyl(0.08, 0.10, 0.03, 14), agedBrass, { p: [credX - 0.55, 0.93, credZ] });
  b.add(cyl(0.018, 0.018, 0.24, 10), agedBrass, { p: [credX - 0.55, 1.05, credZ] });
  b.add(new THREE.SphereGeometry(0.14, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), '#ffe9b8', { p: [credX - 0.55, 1.18, credZ] }, { emit: STAIR_LAMP, glow: 2.0 });
  b.add(roundedBox(0.24, 0.04, 0.18, 0.008, 1), '#3b6e6c', { p: [credX + 0.42, 0.935, credZ + 0.02], r: [0, 0.14, 0] });
  b.add(roundedBox(0.21, 0.038, 0.16, 0.008, 1), '#c96f4a', { p: [credX + 0.42, 0.974, credZ + 0.02], r: [0, -0.08, 0] });

  // Clean up reusable template geometries
  postGeo.dispose();
  balusterGeo.dispose();
}

function buildPendant(b: EnvBuilder) {
  const { x, y, z } = PENDANT;
  b.add(new THREE.SphereGeometry(0.46, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), '#efe2c4', { p: [x, y, z], s: [1, 0.62, 1] }, { emit: PENDANT_LAMP, glow: 0.35 });
  b.add(new THREE.SphereGeometry(0.44, 24, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#fff3d6', { p: [x, y + 0.001, z], s: [1, 0.1, 1] }, { emit: PENDANT_LAMP, glow: 1.6 });
  b.add(cyl(0.05, 0.07, 0.06, 12), '#c99a4c', { p: [x, y + 0.3, z] });
  b.add(cyl(0.006, 0.006, 6, 4), '#2a2420', { p: [x, y + 3.3, z] });
}

function buildRoomDetails(b: EnvBuilder) {
  const honeyOak = '#b8743c';
  const darkerOak = '#8a522c';
  const walnut = '#5e3a24';
  const agedBrass = '#c89b52';

  // 1. Floating honey-oak display shelf on the left wall above the sofa (x = WALL_X, y = 1.48, z = 3.77)
  const shX = WALL_X + 0.10, shY = 1.48, shZ = 3.77, shLen = 1.12, shDepth = 0.19;
  b.add(roundedBox(shDepth, 0.036, shLen, 0.008, 1), honeyOak, { p: [shX, shY, shZ] }, { ao: 0.18 });
  for (const dz of [-0.42, 0.42]) {
    b.add(roundedBox(0.14, 0.13, 0.032, 0.006, 1), darkerOak, { p: [WALL_X + 0.075, shY - 0.075, shZ + dz] });
  }
  // Mini books & ceramic pot on the floating wall shelf
  const shelfBookCols = ['#3f6b8a', '#b6584a', '#d9a441', '#4f7d5c', '#c97a4a', '#6e3d5c', '#2f6d5f'];
  let bz = shZ - 0.44;
  for (let i = 0; i < shelfBookCols.length; i++) {
    const bt = 0.032 + (i % 3) * 0.008;
    const bh = 0.17 + ((i * 3) % 4) * 0.022;
    b.add(roundedBox(0.14, bh, bt - 0.003, 0.004, 1), shelfBookCols[i], { p: [shX - 0.01, shY + 0.018 + bh / 2, bz + bt / 2] });
    bz += bt;
  }
  // Decorative brass bookend & small potted succulent on the right side of the floating shelf
  b.add(roundedBox(0.11, 0.11, 0.016, 0.004, 1), agedBrass, { p: [shX - 0.01, shY + 0.073, bz + 0.012] });
  plant(b, shX, shZ + 0.34, {
    pot: '#efe8dc', potR: 0.058, potH: 0.085, leaves: 7, height: 0.14, spread: 0.85, leaf: 0.048, y0: shY + 0.018, seed: 91,
  });

  // 2. Classic round wooden & brass library wall clock on the left wall (z = 5.18, y = 2.38)
  const clkX = WALL_X + 0.028, clkY = 2.38, clkZ = 5.18, clkR = 0.27;
  // Turned walnut outer case + brass inner bezel + warm cream dial face
  b.add(cyl(clkR, clkR, 0.052, 28), walnut, { p: [clkX, clkY, clkZ], r: [0, 0, Math.PI / 2] }, { ao: 0.22 });
  b.add(cyl(clkR - 0.032, clkR - 0.032, 0.056, 28), agedBrass, { p: [clkX + 0.004, clkY, clkZ], r: [0, 0, Math.PI / 2] });
  b.add(cyl(clkR - 0.048, clkR - 0.048, 0.06, 28), '#f5ead2', { p: [clkX + 0.006, clkY, clkZ], r: [0, 0, Math.PI / 2] });
  // 12 hour tick marks & clock hands (10:10 golden hour pose)
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    const tr = clkR - 0.078;
    const isCard = h % 3 === 0;
    b.add(
      new THREE.BoxGeometry(0.008, isCard ? 0.032 : 0.018, isCard ? 0.012 : 0.007),
      '#3a2a1d',
      { p: [clkX + 0.036, clkY + Math.cos(a) * tr, clkZ + Math.sin(a) * tr], r: [a, 0, 0] },
    );
  }
  // Hour hand, minute hand, and brass center cap
  b.add(roundedBox(0.01, 0.11, 0.016, 0.003, 1), '#2b1e16', { p: [clkX + 0.038, clkY + 0.03, clkZ - 0.038], r: [-0.95, 0, 0] });
  b.add(roundedBox(0.01, 0.15, 0.012, 0.003, 1), '#2b1e16', { p: [clkX + 0.04, clkY + 0.038, clkZ + 0.055], r: [0.95, 0, 0] });
  b.add(cyl(0.016, 0.016, 0.018, 12), agedBrass, { p: [clkX + 0.038, clkY, clkZ], r: [0, 0, Math.PI / 2] });

  // 3. Turned honey-oak coat stand & ceramic/brass umbrella stand near the entry door (x = 3.36..3.68, z = WALL_Z + 0.34)
  const csX = 3.36, csZ = WALL_Z + 0.34, csH = 1.78;
  b.add(cyl(0.18, 0.21, 0.04, 16), walnut, { p: [csX, 0.02, csZ] }, { ao: 0.3 });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    b.add(
      roundedBox(0.035, 0.26, 0.16, 0.01, 1),
      darkerOak,
      { p: [csX + Math.sin(a) * 0.11, 0.13, csZ + Math.cos(a) * 0.11], r: [0.35, a, 0] },
    );
  }
  b.add(cyl(0.026, 0.038, csH - 0.06, 12), honeyOak, { p: [csX, csH / 2, csZ] });
  b.add(cyl(0.038, 0.038, 0.05, 12), darkerOak, { p: [csX, 1.15, csZ] });
  b.add(sphere(0.042, 12, 8), honeyOak, { p: [csX, csH, csZ], s: [1, 1.25, 1] });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    b.add(
      roundedBox(0.016, 0.12, 0.13, 0.006, 1),
      agedBrass,
      { p: [csX + Math.sin(a) * 0.075, csH - 0.16, csZ + Math.cos(a) * 0.075], r: [-0.35, a, 0] },
    );
  }
  // Warm tan felt fedora / scholar hat perched on one of the top hooks + draped teal scarf
  const hx = csX - 0.08, hy = csH - 0.07, hz = csZ + 0.06;
  b.add(cyl(0.16, 0.16, 0.014, 18), '#c89b62', { p: [hx, hy, hz], r: [0.28, 0.2, 0.35] });
  b.add(cyl(0.095, 0.105, 0.09, 16), '#b88950', { p: [hx - 0.015, hy + 0.045, hz + 0.01], r: [0.28, 0.2, 0.35] });
  b.add(cyl(0.102, 0.104, 0.02, 16), '#6e3d28', { p: [hx - 0.005, hy + 0.018, hz + 0.004], r: [0.28, 0.2, 0.35] });
  b.add(roundedBox(0.065, 0.46, 0.045, 0.018, 1), '#356d68', { p: [csX + 0.08, csH - 0.38, csZ + 0.05], r: [0.06, 0.2, -0.08] });

  // Ceramic & brass umbrella stand beside the coat stand
  const usX = 3.68, usZ = WALL_Z + 0.30, usH = 0.52, usR = 0.125;
  b.add(cyl(usR, usR * 0.88, usH, 18), '#e8dcc4', { p: [usX, usH / 2, usZ] }, { ao: 0.28 });
  b.add(torus(usR, 0.014, 8, 20), agedBrass, { p: [usX, usH - 0.01, usZ], r: [Math.PI / 2, 0, 0] });
  b.add(torus(usR * 0.91, 0.012, 8, 20), agedBrass, { p: [usX, 0.02, usZ], r: [Math.PI / 2, 0, 0] });
  // Two rolled umbrellas inside the stand (burgundy and forest green)
  b.add(cyl(0.014, 0.032, 0.68, 10), '#8c3b32', { p: [usX - 0.03, 0.38, usZ + 0.01], r: [0.08, 0, 0.14] });
  b.add(torus(0.038, 0.009, 6, 12, Math.PI), walnut, { p: [usX - 0.11, 0.72, usZ + 0.035], r: [0, 0.2, 0.14] });
  b.add(cyl(0.014, 0.032, 0.66, 10), '#2d5c46', { p: [usX + 0.035, 0.37, usZ - 0.01], r: [-0.06, 0, -0.12] });
  b.add(torus(0.038, 0.009, 6, 12, Math.PI), honeyOak, { p: [usX + 0.11, 0.70, usZ - 0.03], r: [0, -0.3, -0.12] });
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
  buildHallwayCorridor(fb, group);
  buildPendant(fb);
  buildRoomDetails(fb);
  const paintings: THREE.Mesh[] = [];
  // Two paintings spaced out on the back wall (Misty Evergreen Hills and Golden Hour Sunset)
  paintings.push(frame(fb, 0.76, 0.76, [-1.25, 2.4, WALL_Z], 0, 'hills', 4092));
  paintings.push(frame(fb, 0.76, 0.76, [-0.05, 2.4, WALL_Z], 0, 'sunset', 4092));
  // The third painting on the right wall section past the door (Alpine Mirror Lake)
  paintings.push(frame(fb, 0.76, 0.76, [4.25, 2.4, WALL_Z], 0, 'lake', 4092));
  // Fourth painting on the right gallery wall past the second column
  paintings.push(frame(fb, 0.76, 0.76, [7.05, 2.4, WALL_Z], 0, 'hills', 5120));
  // Two framed paintings on the left lounge wall above the corner sofa
  paintings.push(frame(fb, 0.68, 0.68, [WALL_X, 2.38, 3.32], Math.PI / 2, 'sunset', 6011));
  paintings.push(frame(fb, 0.68, 0.68, [WALL_X, 2.38, 4.22], Math.PI / 2, 'lake', 6012));
  paintings.forEach((p) => group.add(p));
  plant(fb, 1.48, WALL_Z + 0.42, { pot: '#efe8dc', potType: 'ceramic', style: 'tree', potR: 0.21, potH: 0.38, leaves: 26, height: 1.25, seed: 719 });
  plant(fb, WALL_X + 0.38, 5.05, { pot: TERRA, potType: 'terracotta', style: 'bush', potR: 0.17, potH: 0.25, leaves: 22, height: 0.82, droop: 0.5, seed: 6 });
  plant(fb, -2.6, WALL_Z + 0.45, { pot: TERRA, potType: 'terracotta', style: 'pilea', potR: 0.17, potH: 0.25, leaves: 20, height: 0.75, droop: 0.48, seed: 402 });
  plant(fb, 5.95, WALL_Z + 0.45, { pot: '#efe8dc', potType: 'ceramic', style: 'tree', potR: 0.19, potH: 0.34, leaves: 22, height: 1.15, seed: 814 });

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

  // Door on a hinge at its left edge with rotating architectural lever handle.
  const { doorGeo, leverGroup } = buildDoor();
  const door = new THREE.Group();
  door.position.set(DOOR.x - DOOR.w / 2 + 0.02, 0, WALL_Z - 0.06);
  const doorMesh = new THREE.Mesh(doorGeo, shellMat);
  doorMesh.castShadow = true;
  doorMesh.receiveShadow = true;
  door.add(doorMesh);
  door.add(leverGroup);
  door.userData.lever = leverGroup;
  door.userData.manualOpen = false;
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
    [SOFA.x, SOFA.z, 1.25, SOFA.len + 0.4, 0.48],
    [-3.14, 5.26, 2.1, 1.25, 0.48],
    [COFFEE.x, COFFEE.z, 1.3, 1.3, 0.35],
    ...STOOLS.map(([x, z]): [number, number, number, number, number] => [x, z, 0.6, 0.6, 0.35]),
    [WALL_X + 0.4, (COUNTER.z0 + COUNTER.z1) / 2, 1.0, COUNTER.z1 - COUNTER.z0 + 0.4, 0.3],
    [WALL_X + 0.35, SHELF.z0 + 1.5, 0.9, 3.4, 0.3],
    [1.48, WALL_Z + 0.42, 0.7, 0.7, 0.35], [WALL_X + 0.38, 5.05, 0.6, 0.6, 0.35],
    [-2.6, WALL_Z + 0.45, 0.55, 0.55, 0.35], [3.50, WALL_Z + 0.32, 0.75, 0.55, 0.35],
  ];
  const blobAttr = blobGeo.getAttribute('aStr') as THREE.InstancedBufferAttribute;
  statics.forEach(([x, z, w, d, st], i) => { blobs.setMatrixAt(i, _m.makeScale(w, 1, d).setPosition(x, 0.031, z)); blobAttr.setX(i, st); });
  const FIRST_DYNAMIC = statics.length;
  for (let i = FIRST_DYNAMIC; i < BLOBS; i++) blobs.setMatrixAt(i, zero);
  blobs.userData.first = FIRST_DYNAMIC;

  // Fixed light rig entries: pendant, window spill, upper stairwell & right gallery fill, lower landing sconce fill.
  lightRig.pos[PENDANT_LAMP].set(PENDANT.x, PENDANT.y - 0.3, PENDANT.z, 6.6);
  lightRig.pos[WINDOW_LAMP].set(WALL_X + 0.9, 2.3, (WINDOW.z0 + WINDOW.z1) / 2, 4.6);
  lightRig.pos[STAIR_LAMP].set(5.35, 1.85, -0.45, 7.8);
  lightRig.pos[LOWER_LAMP].set(4.65, -0.35, 1.45, 5.8);
  const pendantTint = new THREE.Color('#ffd9a0');
  const stairTint = new THREE.Color('#ffdfa8');

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
      const stairLv = Math.max(0.68, atmo.pendant);
      lightRig.level[STAIR_LAMP] = stairLv;
      lightRig.col[STAIR_LAMP].set(stairTint.r, stairTint.g, stairTint.b).multiplyScalar(2.25 * stairLv);
      lightRig.level[LOWER_LAMP] = Math.max(0.78, atmo.pendant);
      lightRig.col[LOWER_LAMP].set(stairTint.r, stairTint.g, stairTint.b).multiplyScalar(2.65 * Math.max(0.78, atmo.pendant));
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
        if (o instanceof THREE.Mesh) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if ('map' in m && m.map) (m.map as THREE.Texture).dispose();
            }
          }
        }
      });
      paintings.forEach((m) => {
        const mat = m.material as THREE.MeshLambertMaterial;
        mat.map?.dispose();
        mat.dispose();
      });
      [shellMat, furnMat, propMat, gMat, hazeMat, blobMat, books.material as THREE.Material].forEach((m) => m.dispose());
      win.dispose();
    },
  };
}

export { N_LAMPS };
