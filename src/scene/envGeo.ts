// Geometry builder for the environment: like GeoBuilder (toon.ts) but indexed, with
// an `aux` attribute for the environment material: x = sway weight (plants),
// y = lamp index + 1 for emissive parts, z = emissive strength.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { V3 } from './toon';

export interface EnvXf { p?: V3; r?: V3; s?: number | V3 }
export interface EnvPart {
  /** Sway weight for foliage (0 = rigid). */
  sway?: number;
  /** Lamp index whose level drives this part's glow, and how strongly it glows. */
  emit?: number;
  glow?: number;
  /** Darken toward the part's own bottom by this much (soft self-occlusion). */
  ao?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function indexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}

export class EnvBuilder {
  private parts: THREE.BufferGeometry[] = [];

  /** color === null keeps the geometry's own colour/aux (a previously built piece). */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | null, xf: EnvXf = {}, o: EnvPart = {}): this {
    const g = geo.clone();
    const keep = color === null ? ['position', 'normal', 'color', 'aux'] : ['position', 'normal'];
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    indexed(g);
    const n = g.attributes.position.count;
    if (color !== null) {
      const col = new Float32Array(n * 3);
      _c.set(color);
      const pos = g.attributes.position as THREE.BufferAttribute;
      let y0 = Infinity, y1 = -Infinity;
      if (o.ao) for (let i = 0; i < n; i++) { const y = pos.getY(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (let i = 0; i < n; i++) {
        let k = 1;
        if (o.ao && y1 > y0) { const t = (pos.getY(i) - y0) / (y1 - y0); k = 1 - o.ao * (1 - t) * (1 - t); }
        col[i * 3] = _c.r * k; col[i * 3 + 1] = _c.g * k; col[i * 3 + 2] = _c.b * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const aux = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { aux[i * 3] = o.sway ?? 0; aux[i * 3 + 1] = o.emit !== undefined ? o.emit + 1 : 0; aux[i * 3 + 2] = o.glow ?? 0; }
      g.setAttribute('aux', new THREE.BufferAttribute(aux, 3));
    } else if (!g.attributes.aux) {
      g.setAttribute('aux', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    }
    _p.set(...(xf.p ?? [0, 0, 0]));
    _q.setFromEuler(_e.set(...(xf.r ?? [0, 0, 0])));
    const s = xf.s ?? 1;
    if (typeof s === 'number') _s.setScalar(s); else _s.set(...s);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    this.parts.push(g);
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
