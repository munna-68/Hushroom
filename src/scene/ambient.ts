// Cheap ambient life as GPU points: steam rising off occupied seats' mugs and dust
// motes drifting in the window light (they fade wherever the window light doesn't
// reach). Fixed pools sized for the high tier; lower tiers draw fewer.
import * as THREE from 'three';
import { materials, rng } from './toon';
import { WINDOW_LIGHT_GLSL, stUniforms } from './envMaterial';
import { WALL_X, WINDOW } from './hall';

export const MAX_STEAM_PER_MUG = 6;
export const MAX_MOTES = 90;

export interface Steam {
  points: THREE.Points;
  /** Mug world position per seat (y < −10 hides that seat's steam). */
  setSource(seat: number, p: THREE.Vector3 | null): void;
  setCount(perMug: number): void;
  update(t: number): void;
  dispose(): void;
}

export function createSteam(seats: number): Steam {
  const n = seats * MAX_STEAM_PER_MUG;
  const pos = new Float32Array(n * 3).fill(-50);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) seed[i] = (i % MAX_STEAM_PER_MUG) / MAX_STEAM_PER_MUG + Math.floor(i / MAX_STEAM_PER_MUG) * 0.37;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uMap: { value: materials().glowTex }, uCol: { value: new THREE.Color('#fff4e6') } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime; uniform float uPx;
      varying float vA;
      void main() {
        float k = fract(uTime * 0.2 + aSeed);
        vec3 p = position + vec3(sin(k * 6.0 + aSeed * 9.0) * 0.025, 0.05 + k * 0.3, cos(k * 5.0 + aSeed * 7.0) * 0.02);
        vA = smoothstep(0.0, 0.15, k) * (1.0 - k) * step(-10.0, position.y) * step(-100.0, aSeed);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 0.24 * (1.0 + k) * uPx / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uCol; varying float vA;
      void main() { gl_FragColor = vec4(uCol, texture2D(uMap, gl_PointCoord).a * vA * 0.16); }`,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  return {
    points,
    setSource(s, p) {
      for (let k = 0; k < MAX_STEAM_PER_MUG; k++) {
        const i = (s * MAX_STEAM_PER_MUG + k) * 3;
        if (p) { pos[i] = p.x + (k - 2.5) * 0.006; pos[i + 1] = p.y; pos[i + 2] = p.z; } else pos[i + 1] = -50;
      }
      (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    },
    setCount(per) {
      // Draw only the first `per` particles of each mug by sorting them first in each block.
      g.setDrawRange(0, n);
      for (let s = 0; s < seats; s++) for (let k = 0; k < MAX_STEAM_PER_MUG; k++) seed[s * MAX_STEAM_PER_MUG + k] = k < per ? k / per + s * 0.37 : -1e3;
      (g.attributes.aSeed as THREE.BufferAttribute).needsUpdate = true;
    },
    update(t) { mat.uniforms.uTime.value = t; },
    dispose() { g.dispose(); mat.dispose(); },
  };
}

export interface Motes {
  points: THREE.Points;
  setCount(n: number): void;
  update(t: number, amount: number, color: THREE.Color): void;
  dispose(): void;
}

/** Dust motes seeded along the day sun's path through the window. */
export function createMotes(sunDir: THREE.Vector3): Motes {
  const pos = new Float32Array(MAX_MOTES * 3);
  const seed = new Float32Array(MAX_MOTES);
  const r = rng(55);
  const d = sunDir.clone().negate();
  for (let i = 0; i < MAX_MOTES; i++) {
    const z = THREE.MathUtils.lerp(WINDOW.z0, WINDOW.z1, r()), y = THREE.MathUtils.lerp(WINDOW.y0, WINDOW.y1, r());
    const t = 0.5 + r() * 6.5;
    const p = new THREE.Vector3(WALL_X, y, z).addScaledVector(d, t);
    if (p.y < 0.2) p.y = 0.2 + r() * 0.6;
    p.toArray(pos, i * 3);
    seed[i] = r() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...stUniforms, uTime: { value: 0 }, uPx: { value: 1 }, uMap: { value: materials().glowTex }, uAmt: { value: 0 }, uCol: { value: new THREE.Color() } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${WINDOW_LIGHT_GLSL}
      attribute float aSeed;
      uniform float uTime; uniform float uPx; uniform float uAmt;
      varying float vA;
      void main() {
        float t = uTime * 0.05 + aSeed;
        vec3 p = position + vec3(sin(t * 1.3) * 0.35, sin(t * 0.9 + aSeed) * 0.25, cos(t * 1.1) * 0.35);
        vA = uAmt * stWindowLight(p) * (0.4 + 0.6 * sin(uTime * 0.7 + aSeed * 3.0) * sin(uTime * 0.7 + aSeed * 3.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = vA > 0.001 ? 0.07 * uPx / -mv.z : 0.0;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uCol; varying float vA;
      void main() { gl_FragColor = vec4(uCol, texture2D(uMap, gl_PointCoord).a * vA); }`,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  return {
    points,
    setCount(n) { g.setDrawRange(0, Math.min(MAX_MOTES, n)); points.visible = n > 0; },
    update(t, amount, color) { mat.uniforms.uTime.value = t; mat.uniforms.uAmt.value = amount; mat.uniforms.uCol.value.copy(color); },
    dispose() { g.dispose(); mat.dispose(); },
  };
}
