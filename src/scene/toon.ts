// Shared materials and the vertex-colour geometry builder used by every object.
// One toon material + one outline material for the whole scene keeps state
// changes and shader programs to a minimum.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function gradientMap(): THREE.DataTexture {
  const steps = [92, 150, 205, 238, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export const OUTLINE_COLOR = new THREE.Color('#171226');

export interface Materials {
  toon: THREE.MeshToonMaterial;
  outline: THREE.ShaderMaterial;
  unlit: THREE.MeshBasicMaterial;
  glowTex: THREE.Texture;
  dispose(): void;
}

let shared: Materials | null = null;

export function materials(): Materials {
  if (shared) return shared;
  const toon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() });
  const outline = new THREE.ShaderMaterial({
    uniforms: { color: { value: OUTLINE_COLOR }, thickness: { value: 0.013 } },
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      attribute float outline;
      uniform float thickness;
      void main() {
        if (outline < 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
        vec4 mv = modelViewMatrix * vec4(position + normal * thickness * outline, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const unlit = new THREE.MeshBasicMaterial({ vertexColors: true });
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  shared = {
    toon, outline, unlit, glowTex,
    dispose() {
      toon.gradientMap?.dispose(); toon.dispose(); outline.dispose(); unlit.dispose(); glowTex.dispose();
      shared = null;
    },
  };
  return shared;
}

export type V3 = [number, number, number];
export interface Xf { p?: V3; r?: V3; s?: number | V3 }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Accumulates primitives with baked colour + transform, merges into one geometry. */
export class GeoBuilder {
  private parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, xf: Xf = {}, outline = 1): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    _p.set(...(xf.p ?? [0, 0, 0]));
    _q.setFromEuler(_e.set(...(xf.r ?? [0, 0, 0])));
    const s = xf.s ?? 1;
    if (typeof s === 'number') _s.setScalar(s); else _s.set(...s);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.set(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('outline', new THREE.BufferAttribute(new Float32Array(n).fill(outline), 1));
    this.parts.push(g);
    if (geo !== g && !geo.userData.keep) geo.dispose();
    return this;
  }

  get empty(): boolean { return this.parts.length === 0; }

  build(): THREE.BufferGeometry {
    const merged = this.parts.length ? mergeGeometries(this.parts, false)! : new THREE.BufferGeometry();
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Toon mesh with its outline as a child sharing the same geometry. */
export function toonMesh(geo: THREE.BufferGeometry, opts: { outline?: boolean; cast?: boolean; receive?: boolean } = {}): THREE.Mesh {
  const m = materials();
  const mesh = new THREE.Mesh(geo, m.toon);
  mesh.castShadow = !!opts.cast;
  mesh.receiveShadow = !!opts.receive;
  mesh.matrixAutoUpdate = true;
  if (opts.outline !== false) {
    const o = new THREE.Mesh(geo, m.outline);
    o.name = 'outline';
    mesh.add(o);
  }
  return mesh;
}

// ---- primitive helpers -----------------------------------------------------

export function roundedBox(w: number, h: number, d: number, r = 0.04, seg = 3): THREE.BufferGeometry {
  r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new THREE.Vector3(), inner = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
    v.sub(inner).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
    v.multiplyScalar(r).add(inner);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

export const sphere = (r: number, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
export const cyl = (rt: number, rb: number, h: number, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
export const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);
export const torus = (r: number, t: number, arc = Math.PI * 2, rs = 8, ts = 18) => new THREE.TorusGeometry(r, t, rs, ts, arc);

export function glowSprite(color: THREE.ColorRepresentation, size: number, opacity = 1): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({
    map: materials().glowTex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.renderOrder = 2;
  return s;
}

export function lightPool(color: THREE.ColorRepresentation, w: number, d: number, opacity: number): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: materials().glowTex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/** Soft dark blob under objects; grounds them without shadow maps. */
export function blobShadow(w: number, d: number, opacity = 0.35): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({
    map: materials().glowTex, color: '#000000', transparent: true, opacity, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/** Simple seeded PRNG so scene variation is stable between reloads. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
