// The view out of the big window: one glass mesh whose shader paints a layered
// backdrop (sky, hazy city, trees) from two small canvas textures, with parallax
// from the view ray so the layers slide as the camera orbits. Day/night and
// rain/clear are uniforms; rain draws streaks outside plus droplets and running
// drops on the glass. Low tier swaps the procedural drops for a scrolling texture.
import * as THREE from 'three';
import { rng } from './toon';

const W = 1024, H = 512;

/** Far layer: R = building mask, G = window mask, B = window id. */
function paintCity(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const r = rng(7);
  let x = -10;
  while (x < W) {
    const w = 40 + r() * 90, h = 120 + r() * 230 + (r() < 0.2 ? 80 : 0);
    const top = H - h;
    g.fillStyle = 'rgb(255,0,0)';
    g.fillRect(x, top, w, h);
    if (r() < 0.4) g.fillRect(x + w * 0.3, top - 18 - r() * 20, w * 0.35, 30);
    // Windows: a grid, some lit.
    const cols = Math.max(2, Math.floor(w / 13)), rows = Math.floor(h / 17);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (r() < 0.62) continue;
      const wx = x + 5 + i * ((w - 10) / cols), wy = top + 8 + j * 17;
      g.fillStyle = `rgb(255,255,${Math.floor(30 + r() * 225)})`;
      g.fillRect(wx, wy, 5, 7);
    }
    x += w + r() * 14;
  }
  return c;
}

/** Near layer: R = foliage mask, G = foliage light (sunlit side), B = trunk mask. */
function paintTrees(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const r = rng(19);
  const trees = 9;
  for (let t = 0; t < trees; t++) {
    const cx = (t + 0.15 + r() * 0.7) * (W / trees), top = 170 + r() * 110;
    g.fillStyle = 'rgb(0,0,255)';
    g.beginPath(); g.moveTo(cx - 9, H); g.lineTo(cx - 5, top + 150); g.lineTo(cx + 5, top + 150); g.lineTo(cx + 9, H); g.fill();
    // Crown: back blobs first (darker), front blobs last; each blob lit from the upper left.
    const blobs = 34 + Math.floor(r() * 10);
    for (let k = 0; k < blobs; k++) {
      const f = k / blobs;
      const bx = cx + (r() - 0.5) * 170, by = top + 20 + r() * 160 + f * 20, br = 14 + r() * 18;
      const base = 40 + f * 90;
      const grd = g.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.05, bx, by, br);
      grd.addColorStop(0, `rgb(255,${Math.min(255, base + 150)},0)`);
      grd.addColorStop(0.55, `rgb(255,${base + 40},0)`);
      grd.addColorStop(0.9, `rgb(255,${base * 0.8},0)`);
      grd.addColorStop(1, `rgba(255,${base * 0.8},0,0)`);
      g.fillStyle = grd;
      g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
    }
  }
  return c;
}

/** Low tier: pre-drawn rain on glass, scrolled in the shader. */
function paintRain(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  const r = rng(31);
  for (let i = 0; i < 140; i++) {
    const x = r() * 256, y = r() * 256, rad = 1 + r() * 2.6;
    g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.5})`;
    g.beginPath(); g.ellipse(x, y, rad, rad * 1.25, 0, 0, Math.PI * 2); g.fill();
    if (r() < 0.25) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x - 0.6, y - 30 * r(), 1.2, 30 * r()); }
  }
  return c;
}

export interface WindowView {
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  setLow(low: boolean): void;
  dispose(): void;
}

/**
 * Glass for a window in the plane x = const, facing +x, spanning z0..z1 and y0..y1.
 * The view looks out toward −x.
 */
export function buildWindowView(z0: number, z1: number, y0: number, y1: number, x: number): WindowView {
  const tex = (cv: HTMLCanvasElement, rep = false) => {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = rep ? THREE.RepeatWrapping : THREE.MirroredRepeatWrapping;
    t.wrapT = rep ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  const city = tex(paintCity()), trees = tex(paintTrees()), rain = tex(paintRain(), true);
  const uniforms: Record<string, THREE.IUniform> = {
    uTime: { value: 0 },
    uCity: { value: city }, uTrees: { value: trees }, uRainTex: { value: rain },
    uSize: { value: new THREE.Vector2(z1 - z0, y1 - y0) },
    uSkyTop: { value: new THREE.Color() }, uSkyBot: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0.75, 0.3, 0) },
    uCityCol: { value: new THREE.Color() }, uCityHaze: { value: 0.5 },
    uTreeCol: { value: new THREE.Color() }, uTreeLit: { value: new THREE.Color() },
    uLights: { value: 0 }, uStars: { value: 0 }, uRain: { value: 0 }, uGlass: { value: new THREE.Color() },
    uLow: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      varying vec3 vWorld;
      uniform float uTime;
      uniform sampler2D uCity, uTrees, uRainTex;
      uniform vec2 uSize;
      uniform vec3 uSkyTop, uSkyBot, uSunCol, uCityCol, uTreeCol, uTreeLit, uGlass;
      uniform vec3 uSun;
      uniform float uCityHaze, uLights, uStars, uRain, uLow;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        // View ray in window space: u along +z, v up, n outward (−x).
        vec3 rd = normalize(vWorld - cameraPosition);
        vec2 slope = vec2(rd.z, rd.y * 0.32) / max(-rd.x, 0.2);
        vec2 p = vUv * uSize; // metres across the pane
        // Layers at increasing depth slide further with the view.
        vec2 pt = p + slope * 1.6;
        vec2 pc = p + slope * 4.0;
        vec2 uvT = vec2(pt.x / 6.0 + 0.12, pt.y / 3.4 - 0.05);
        vec2 uvC = vec2(pc.x / 8.0 + 0.3, pc.y / 5.2 + 0.12);
        float sy = clamp(vUv.y * 0.75 + 0.2, 0.0, 1.0);
        vec3 col = mix(uSkyBot, uSkyTop, smoothstep(0.0, 1.0, sy));
        vec2 sd = (vUv - uSun.xy) * vec2(uSize.x / uSize.y, 1.0);
        col += uSunCol * (exp(-length(sd) * 3.2) * 0.9 + exp(-length(sd) * 10.0) * 0.6) * uSun.z;
        // stars on clear nights
        vec2 sg = floor(vUv * vec2(70.0, 60.0));
        float st = step(0.985, h(sg)) * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + h(sg + 3.1) * 40.0)) * smoothstep(0.35, 0.8, vUv.y);
        col += vec3(0.8, 0.85, 1.0) * st * 0.6;
        // city
        vec3 c = texture2D(uCity, uvC).rgb;
        float bm = c.r * step(0.0, uvC.y) * step(uvC.y, 1.0);
        vec3 city = mix(uCityCol, col, uCityHaze * (0.4 + 0.6 * smoothstep(0.0, 0.7, uvC.y)));
        col = mix(col, city, bm);
        float tw = 0.65 + 0.35 * sin(uTime * (0.6 + c.b * 2.0) + c.b * 60.0);
        tw *= step(0.12, fract(c.b * 7.3 + floor(uTime * 0.05 + c.b * 3.0) * 0.37));
        col += vec3(1.0, 0.72, 0.38) * c.g * bm * uLights * tw * 0.9;
        // trees
        vec3 t = texture2D(uTrees, uvT).rgb;
        float tm = smoothstep(0.3, 0.7, t.r) * step(uvT.y, 1.0);
        vec3 tree = mix(uTreeCol, uTreeLit, smoothstep(0.1, 0.95, t.g));
        tree = mix(tree, col, uCityHaze * 0.42);
        col = mix(col, tree, tm);
        col = mix(col, uTreeCol * 0.7, t.b * (1.0 - tm) * step(uvT.y, 1.0));
        // rain: grey veil, streaks outside, drops on the glass
        col = mix(col, mix(uSkyBot, uSkyTop, 0.5), uRain * 0.22);
        float t0 = uTime;
        if (uRain > 0.01) {
          if (uLow > 0.5) {
            vec3 rt = texture2D(uRainTex, vec2(vUv.x * 2.2, vUv.y * 2.0 + t0 * 0.06)).rgb;
            col += rt * uRain * 0.22 * (uGlass + 0.15);
          } else {
            vec2 ru = vec2(vUv.x * 80.0, vUv.y * 2.4 + t0 * 1.7);
            float cid = floor(ru.x);
            float y = fract(ru.y + h(vec2(cid, 3.0)) * 10.0);
            float streak = smoothstep(0.1, 0.0, abs(fract(ru.x) - 0.5)) * smoothstep(0.0, 0.08, y) * smoothstep(0.24, 0.08, y) * step(0.55, h(vec2(cid, 4.0)));
            col += streak * (uGlass + 0.12) * 0.45 * uRain;
            vec2 g = vUv * vec2(26.0, 24.0);
            vec2 id = floor(g); vec2 f = fract(g) - 0.5;
            vec2 o = vec2(h(id), h(id + 7.1)) - 0.5;
            float r = 0.07 + 0.11 * h(id + 3.3);
            float d = length((f - o * 0.6) * vec2(1.0, 0.85));
            float drop = smoothstep(r, r * 0.55, d) * step(0.42, h(id + 9.7)) * uRain;
            col = mix(col, col * 1.18 + uGlass * 0.18, drop);
            col += drop * smoothstep(r * 0.5, 0.0, length(f - o * 0.6 - vec2(-0.03, 0.04))) * 0.3 * (uGlass + 0.2);
            float lane = floor(vUv.x * 13.0);
            float lx = fract(vUv.x * 13.0) - 0.5 + 0.1 * sin(vUv.y * 9.0 + lane);
            float sp = 0.05 + 0.08 * h(vec2(lane, 5.0));
            float py = fract(-t0 * sp + h(vec2(lane, 6.0)));
            float dy = vUv.y - py;
            float run = smoothstep(0.06, 0.0, abs(lx)) * smoothstep(0.012, 0.0, abs(dy) - 0.006);
            float trail = smoothstep(0.03, 0.0, abs(lx)) * step(0.0, dy) * smoothstep(0.22, 0.0, dy) * 0.35;
            col += (run + trail) * (uGlass + 0.15) * 0.8 * step(0.35, h(vec2(lane, 8.0))) * uRain;
          }
        }
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(z1 - z0, y1 - y0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = Math.PI / 2; // face +x; local +x → world −z, so flip uv.x below
  mesh.scale.x = -1;
  mesh.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
  return {
    mesh, uniforms,
    setLow(low) { uniforms.uLow.value = low ? 1 : 0; },
    dispose() { geo.dispose(); mat.dispose(); city.dispose(); trees.dispose(); rain.dispose(); },
  };
}
