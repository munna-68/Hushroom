// Cheap ambient life: rain-streaked window shader and GPU-animated point
// sprites (dust motes, mug steam, fairy lights). All motion is in shaders.
import * as THREE from 'three';
import { materials } from './toon';

export function rainWindowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSpeed: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      precision mediump float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uSpeed;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 uv = vUv;
        float t = uTime * uSpeed;
        vec3 col = mix(vec3(0.11, 0.2, 0.36), vec3(0.025, 0.05, 0.14), smoothstep(0.0, 0.95, uv.y));
        // moon haze
        col += vec3(0.35, 0.45, 0.7) * 0.25 * smoothstep(0.32, 0.0, length((uv - vec2(0.72, 0.8)) * vec2(1.2, 1.0)));
        col += vec3(0.9, 0.95, 1.0) * 0.5 * smoothstep(0.065, 0.055, length((uv - vec2(0.72, 0.8)) * vec2(1.2, 1.0)));
        // distant rooftops and warm windows
        float roof = step(uv.y, 0.16 + 0.05 * step(0.5, h(vec2(floor(uv.x * 7.0), 1.0))) + 0.03 * h(vec2(floor(uv.x * 13.0), 2.0)));
        col = mix(col, vec3(0.04, 0.06, 0.12), roof);
        vec2 wg = floor(uv * vec2(40.0, 60.0));
        float lit = roof * step(0.86, h(wg)) * step(uv.y, 0.15) * step(0.5, fract(uv.x * 40.0)) * step(0.4, fract(uv.y * 60.0));
        col += lit * vec3(1.0, 0.72, 0.38) * 0.6;
        // falling rain outside
        vec2 ru = vec2(uv.x * 90.0, uv.y * 2.0 + t * 1.6);
        float colId = floor(ru.x);
        float y = fract(ru.y + h(vec2(colId, 3.0)) * 10.0);
        float streak = smoothstep(0.08, 0.0, abs(fract(ru.x) - 0.5)) * smoothstep(0.0, 0.08, y) * smoothstep(0.22, 0.08, y) * step(0.55, h(vec2(colId, 4.0)));
        col += streak * vec3(0.45, 0.55, 0.75) * 0.35;
        // droplets on glass (static) with a soft highlight
        vec2 g = uv * vec2(18.0, 22.0);
        vec2 id = floor(g); vec2 f = fract(g) - 0.5;
        vec2 o = vec2(h(id), h(id + 7.1)) - 0.5;
        float r = 0.08 + 0.12 * h(id + 3.3);
        float d = length(f - o * 0.6);
        float drop = smoothstep(r, r * 0.6, d) * step(0.45, h(id + 9.7));
        col = mix(col, col * 1.25 + vec3(0.06, 0.08, 0.12), drop);
        col += drop * smoothstep(r * 0.5, 0.0, length(f - o * 0.6 - vec2(-0.03, 0.04))) * 0.25;
        // running drops with trails
        float lane = floor(uv.x * 11.0);
        float lx = fract(uv.x * 11.0) - 0.5 + 0.12 * sin(uv.y * 9.0 + lane);
        float sp = 0.06 + 0.08 * h(vec2(lane, 5.0));
        float py = fract(-t * sp + h(vec2(lane, 6.0)));
        float dy = uv.y - py;
        float run = smoothstep(0.06, 0.0, abs(lx)) * smoothstep(0.012, 0.0, abs(dy) - 0.006);
        float trail = smoothstep(0.03, 0.0, abs(lx)) * step(0.0, dy) * smoothstep(0.25, 0.0, dy) * 0.35;
        col += (run + trail) * vec3(0.55, 0.65, 0.85) * step(0.35, h(vec2(lane, 8.0)));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export type PointMode = 0 | 1 | 2; // 0 twinkle, 1 drift (motes), 2 rise (steam)

export function glowPoints(positions: Float32Array, mode: PointMode, color: THREE.ColorRepresentation, size: number, opacity: number): THREE.Points {
  const n = positions.length / 3;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) seeds[i] = (Math.sin(i * 91.7) * 0.5 + 0.5) * 100;
  g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uMode: { value: mode }, uColor: { value: new THREE.Color(color) },
      uSize: { value: size }, uOpacity: { value: opacity }, uPx: { value: 1 }, uMap: { value: materials().glowTex },
    },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime; uniform int uMode; uniform float uSize; uniform float uPx;
      varying float vA;
      void main() {
        vec3 p = position;
        float a = 1.0;
        if (uMode == 1) {
          float t = uTime * 0.05 + aSeed;
          p += vec3(sin(t * 1.3) * 0.5, sin(t * 0.9 + aSeed) * 0.35, cos(t * 1.1) * 0.5);
          a = 0.5 + 0.5 * sin(uTime * 0.6 + aSeed * 3.0);
        } else if (uMode == 2) {
          float k = fract(uTime * 0.22 + aSeed * 0.37);
          p += vec3(sin(k * 6.0 + aSeed) * 0.03, k * 0.32, cos(k * 5.0 + aSeed) * 0.02);
          a = smoothstep(0.0, 0.15, k) * (1.0 - k);
        } else {
          a = 0.7 + 0.3 * sin(uTime * 1.7 + aSeed * 5.0);
        }
        vA = a;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * uPx * (1.0 + (uMode == 2 ? (fract(uTime * 0.22 + aSeed * 0.37)) : 0.0)) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; uniform sampler2D uMap;
      varying float vA;
      void main() {
        float m = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(uColor, m * vA * uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  return pts;
}
