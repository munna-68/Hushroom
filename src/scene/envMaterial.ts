// Scene lighting shared by every lit material (room, props, characters, cats).
//
// Real lights stay few (hemisphere, sun/moon, fill). On top of them, injected into
// each material's shader:
//  - fake lamps: a fixed uniform array (8 seat lamps, the pendant, window spill)
//    evaluated per fragment with a soft falloff and a downward bias, so each lamp
//    lays a warm pool on the table and tints nearby faces, hands and paper;
//  - window-masked sun/moon: the first directional light only reaches a point if
//    the ray toward it passes through a window pane (mullions cut the patches) and
//    misses the table top, so window-grid patches land on the floor on every tier,
//    with or without a shadow map.
// The environment material adds soft wrapped diffuse, analytic contact shading,
// plant sway and per-vertex emissive tied to a lamp's level.
import * as THREE from 'three';
import { TABLE, TABLE_TOP, WALL_X, WALL_Z, WINDOW } from './hall';

/** 8 seat lamps, the pendant, the window spill. */
export const N_LAMPS = 10;
export const PENDANT_LAMP = 8;
export const WINDOW_LAMP = 9;

/** Live values every patched material reads (shared uniform objects, set once per frame). */
export const lightRig = {
  pos: Array.from({ length: N_LAMPS }, () => new THREE.Vector4(0, -50, 0, 1)),
  col: Array.from({ length: N_LAMPS }, () => new THREE.Vector3()),
  level: new Array<number>(N_LAMPS).fill(0),
  sunDir: new THREE.Vector3(0.9, 0.25, -0.35).normalize(),
};

const U = {
  stLampPos: { value: lightRig.pos },
  stLampCol: { value: lightRig.col },
  stLampLevel: { value: lightRig.level },
  stEmitGain: { value: 1 },
  stSunDir: { value: lightRig.sunDir },
  stWin: { value: new THREE.Vector4(WALL_X - 0.15, WINDOW.z0, WINDOW.z1, 0.03) },
  stWinY: { value: new THREE.Vector4(WINDOW.y0, WINDOW.y1, WINDOW.cols, WINDOW.rows) },
  stMull: { value: WINDOW.mull },
  stTable: { value: new THREE.Vector4(-TABLE.len / 2, TABLE.len / 2, -TABLE.depth / 2, TABLE.depth / 2) },
  stTime: { value: 0 },
  stWrap: { value: 0.45 },
  stAOk: { value: 1 },
  /** 0 turns the scene lighting off for renders outside the room (avatar thumbnails). */
  stOn: { value: 1 },
};
export const stUniforms = U;

const PARS = /* glsl */ `
#define ST_LAMPS ${N_LAMPS}
uniform vec4 stLampPos[ST_LAMPS];
uniform vec3 stLampCol[ST_LAMPS];
uniform vec3 stSunDir;
uniform vec4 stWin;
uniform vec4 stWinY;
uniform float stMull;
uniform vec4 stTable;
uniform float stOn;

float stBox(float x, float a, float b, float e) { return smoothstep(a - e, a + e, x) * (1.0 - smoothstep(b - e, b + e, x)); }

// How much of the sun/moon reaches p through the window (0..1).
float stWindowLight(vec3 p) {
  vec3 s = stSunDir;
  if (s.x > -0.02) return 0.0;
  float t = (stWin.x - p.x) / s.x;
  if (t <= 0.0) return 0.0;
  vec3 q = p + s * t;
  float e = stWin.w * (0.25 + t * 0.14);
  float inside = stBox(q.z, stWin.y, stWin.z, e) * stBox(q.y, stWinY.x, stWinY.y, e);
  if (inside <= 0.001) return 0.0;
  vec2 size = vec2((stWin.z - stWin.y) / stWinY.z, (stWinY.y - stWinY.x) / stWinY.w);
  vec2 cell = vec2(q.z - stWin.y, q.y - stWinY.x) / size;
  vec2 dl = abs(fract(cell + 0.5) - 0.5) * size;
  float m = smoothstep(stMull - e, stMull + e, min(dl.x, dl.y));
  float occ = 1.0;
  if (p.y < ${TABLE_TOP.toFixed(3)} - 0.03 && s.y > 0.01) {
    float tt = (${TABLE_TOP.toFixed(3)} - p.y) / s.y;
    vec2 h = p.xz + s.xz * tt;
    float et = 0.015 + tt * 0.06;
    occ = 1.0 - stBox(h.x, stTable.x, stTable.y, et) * stBox(h.y, stTable.z, stTable.w, et);
  }
  return inside * m * occ;
}

// Fake lamps: soft falloff, light mostly downward (shaded bulbs).
vec3 stLampLight(vec3 p, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ST_LAMPS; i++) {
    vec3 c = stLampCol[i];
    if (c.r + c.g + c.b < 0.002) continue;
    vec4 L = stLampPos[i];
    vec3 d = L.xyz - p;
    float dist = length(d);
    float x = 1.0 - dist / L.w;
    if (x <= 0.0) continue;
    vec3 l = d / max(dist, 1e-4);
    float ndl = clamp(dot(n, l) * 0.6 + 0.4, 0.0, 1.0);
    float down = mix(0.3, 1.0, smoothstep(-0.3, 0.5, l.y));
    sum += c * (x * x) * ndl * down;
  }
  return sum;
}
`;

/** Directional light 0 is the sun/moon: mask it by the window. */
const LIGHTS_BEGIN = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\t#if UNROLLED_LOOP_INDEX == 0\n\t\tdirectLight.color *= stSun;\n\t\t#endif',
);

function inject(shader: THREE.WebGLProgramParametersWithUniforms) {
  Object.assign(shader.uniforms, U);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', `${PARS}\nvoid main() {`)
    .replace('#include <lights_fragment_begin>', /* glsl */ `
      vec3 stWorldPos = ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;
      vec3 stWorldN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
      float stSun = mix( 1.0, stWindowLight( stWorldPos ), stOn );
      ${LIGHTS_BEGIN}`)
    .replace('#include <lights_fragment_end>', /* glsl */ `#include <lights_fragment_end>
      reflectedLight.directDiffuse += stOn * stLampLight( stWorldPos, stWorldN ) * BRDF_Lambert( diffuseColor.rgb );`);
}

const patched = new WeakSet<THREE.Material>();

/** Give an existing lit material (toon/lambert, skinned or not) the scene's lamps and window light. */
export function patchLighting(m: THREE.Material) {
  if (patched.has(m)) return;
  patched.add(m);
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => { prev.call(m, s, r); inject(s); };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + '|stLit';
  m.needsUpdate = true;
}

// ---- environment material ----------------------------------------------------

/**
 * Soft matte material for the room: vertex colours, wrapped diffuse, analytic
 * contact shading near walls, floor and under the table, plant sway (aux.x),
 * and emissive tied to a lamp's level (aux.y = lamp index + 1, aux.z = strength).
 */
export function envMaterial(opts: { sway?: boolean; emit?: boolean } = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  const sway = !!opts.sway, emit = !!opts.emit;
  m.onBeforeCompile = (s) => {
    inject(s);
    s.uniforms.stLampLevel = U.stLampLevel;
    s.uniforms.stEmitGain = U.stEmitGain;
    s.uniforms.stTime = U.stTime;
    s.uniforms.stWrap = U.stWrap;
    s.uniforms.stAOk = U.stAOk;
    s.vertexShader = s.vertexShader
      .replace('void main() {', /* glsl */ `
        attribute vec3 aux;
        varying vec2 vEmit;
        uniform float stTime;
        void main() {
          vEmit = aux.yz;`)
      .replace('#include <begin_vertex>', sway ? /* glsl */ `#include <begin_vertex>
        if ( aux.x > 0.0 ) {
          vec4 wp0 = modelMatrix * vec4( transformed, 1.0 );
          float ph = wp0.x * 1.7 + wp0.z * 1.3;
          transformed.x += aux.x * ( sin( stTime * 1.1 + ph ) * 0.6 + sin( stTime * 2.3 + ph * 1.7 ) * 0.25 ) * 0.03;
          transformed.z += aux.x * cos( stTime * 0.9 + ph * 1.3 ) * 0.02;
          transformed.y += aux.x * sin( stTime * 1.7 + ph ) * 0.006;
        }` : '#include <begin_vertex>');
    s.fragmentShader = s.fragmentShader
      .replace('void main() {', /* glsl */ `
        varying vec2 vEmit;
        uniform float stLampLevel[ST_LAMPS];
        uniform float stEmitGain;
        uniform float stAOk;
        // Contact shading: corners, wall feet, under the table.
        float stAO(vec3 p, vec3 n) {
          float a = 1.0;
          float dx = p.x - (${WALL_X.toFixed(2)}), dz = p.z - (${WALL_Z.toFixed(2)});
          a *= mix(0.72, 1.0, smoothstep(0.0, 0.9, min(dx, dz)));
          if (n.y < 0.5) a *= mix(0.62, 1.0, smoothstep(0.0, 0.45, p.y));
          float c = min(dx, 4.0) + min(dz, 4.0);
          a *= mix(0.75, 1.0, smoothstep(0.0, 1.6, c));
          if (p.y < ${(TABLE_TOP - 0.05).toFixed(2)}) {
            float ux = smoothstep(${(TABLE.len / 2 + 0.35).toFixed(2)}, ${(TABLE.len / 2 - 0.25).toFixed(2)}, abs(p.x));
            float uz = smoothstep(${(TABLE.depth / 2 + 0.3).toFixed(2)}, ${(TABLE.depth / 2 - 0.2).toFixed(2)}, abs(p.z));
            a *= 1.0 - 0.42 * ux * uz;
          }
          a *= mix(0.7, 1.0, clamp(smoothstep(-0.8, -0.2, n.y) + step(0.0, n.y), 0.0, 1.0));
          return mix(1.0, a, stAOk);
        }
        void main() {`)
      .replace('#include <lights_lambert_fragment>', /* glsl */ `
        {
          vec3 wp = ( vec4( - vViewPosition, 0.0 ) * viewMatrix ).xyz + cameraPosition;
          vec3 wn = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
          diffuseColor.rgb *= stAO( wp, wn );
        }
        #include <lights_lambert_fragment>`)
      .replace('#include <lights_lambert_pars_fragment>', 'uniform float stWrap;\n' + THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
        'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        'float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + stWrap ) / ( 1.0 + stWrap ) );',
      ))
      .replace('#include <emissivemap_fragment>', emit ? /* glsl */ `#include <emissivemap_fragment>
        if ( vEmit.x > 0.5 ) {
          int li = int( vEmit.x + 0.5 ) - 1;
          totalEmissiveRadiance += vColor.rgb * stLampLevel[ li ] * vEmit.y * stEmitGain;
        }` : '#include <emissivemap_fragment>');
  };
  m.customProgramCacheKey = () => `stEnv|${sway}|${emit}`;
  return m;
}

/** Window-shaped light for unlit shaders (beam, motes): same maths, standalone. */
export const WINDOW_LIGHT_GLSL = PARS;
