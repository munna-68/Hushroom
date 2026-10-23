// Camera: a framed three-quarter view that adapts to the container's aspect ratio
// (whole room on wide screens, the table and nearest seats on portrait), plus a
// small clamped orbit and zoom with damping. Input listens on the canvas only.
import * as THREE from 'three';

const deg = THREE.MathUtils.degToRad;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

/** Default framings; t = 0 portrait, 1 landscape. Tuned against the reference images. */
const PORT = { az: deg(60), pitch: deg(45), fov: 44, target: new THREE.Vector3(0.35, 0.55, -0.1), halfW: 1.95, halfH: 3.0 };
const LAND = { az: deg(36), pitch: deg(40), fov: 40, target: new THREE.Vector3(-0.75, 0.45, 0.05), halfW: 5.9, halfH: 3.32 };

export const LIMITS = { yaw: deg(20), pitchMin: deg(30), pitchMax: deg(50), zoomMin: 0.92, zoomMax: 1.32 };

export interface CameraView { yaw: number; pitch: number; zoom: number }

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  resize(w: number, h: number): void;
  update(dt: number, t: number, still: boolean): void;
  resetView(): void;
  setView(v: Partial<CameraView>, instant?: boolean): void;
  view(): CameraView;
  dispose(): void;
}

export function createCameraRig(canvas: HTMLCanvasElement): CameraRig {
  const camera = new THREE.PerspectiveCamera(32, 1, 0.3, 80);
  const target = new THREE.Vector3();
  const base = { az: LAND.az, pitch: LAND.pitch, dist: 16 };
  let width = 1, height = 1;
  // Goal and current orbit (yaw is relative to the default azimuth; pitch absolute).
  const goal = { yaw: 0, pitch: LAND.pitch, zoom: 1 };
  const cur = { ...goal };
  const par = { x: 0, y: 0, tx: 0, ty: 0 };

  function frame() {
    const a = width / height;
    const t = THREE.MathUtils.smoothstep(a, 0.62, 1.45);
    camera.fov = lerp(PORT.fov, LAND.fov, t);
    camera.aspect = a;
    camera.updateProjectionMatrix();
    base.az = lerp(PORT.az, LAND.az, t);
    const pitch = lerp(PORT.pitch, LAND.pitch, t);
    if (Math.abs(base.pitch - pitch) > 1e-4) { goal.pitch += pitch - base.pitch; cur.pitch += pitch - base.pitch; }
    base.pitch = pitch;
    target.lerpVectors(PORT.target, LAND.target, t);
    const vf = deg(camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * a);
    base.dist = Math.max(lerp(PORT.halfW, LAND.halfW, t) / Math.tan(hf), lerp(PORT.halfH, LAND.halfH, t) / Math.tan(vf));
  }

  function place(time: number, still: boolean) {
    const az = base.az + cur.yaw + (still ? 0 : 0.012 * Math.sin(time * 0.07) + par.x * 0.025);
    const pitch = cur.pitch + (still ? 0 : 0.006 * Math.sin(time * 0.05 + 1) + par.y * 0.012);
    const d = base.dist / cur.zoom;
    camera.position.set(
      target.x + d * Math.cos(pitch) * Math.sin(az),
      target.y + d * Math.sin(pitch),
      target.z + d * Math.cos(pitch) * Math.cos(az),
    );
    camera.lookAt(target);
  }

  // ---- input ------------------------------------------------------------------
  const pts = new Map<number, { x: number; y: number }>();
  let pinch0 = 0, zoom0 = 1;
  const onDown = (e: PointerEvent) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoom0 = goal.zoom;
    }
  };
  const onMove = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') { par.tx = (e.offsetX / width - 0.5) * 2; par.ty = (e.offsetY / height - 0.5) * 2; }
      return;
    }
    if (pts.size === 1) {
      const k = 2.6 / Math.max(320, Math.min(width, height));
      goal.yaw = clamp(goal.yaw - (e.clientX - p.x) * k, -LIMITS.yaw, LIMITS.yaw);
      goal.pitch = clamp(goal.pitch + (e.clientY - p.y) * k * 0.8, LIMITS.pitchMin, LIMITS.pitchMax);
    }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      goal.zoom = clamp(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0, LIMITS.zoomMin, LIMITS.zoomMax);
    }
  };
  const onUp = (e: PointerEvent) => { pts.delete(e.pointerId); };
  const onLeave = () => { par.tx = par.ty = 0; };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    goal.zoom = clamp(goal.zoom * Math.exp(-e.deltaY * 0.0015), LIMITS.zoomMin, LIMITS.zoomMax);
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    camera,
    resize(w, h) { width = Math.max(1, w); height = Math.max(1, h); frame(); },
    update(dt, t, still) {
      const k = 1 - Math.exp(-9 * dt);
      cur.yaw += (goal.yaw - cur.yaw) * k;
      cur.pitch += (goal.pitch - cur.pitch) * k;
      cur.zoom += (goal.zoom - cur.zoom) * k;
      const kp = 1 - Math.exp(-3 * dt);
      par.x += (par.tx - par.x) * kp; par.y += (par.ty - par.y) * kp;
      place(t, still);
    },
    resetView() { goal.yaw = 0; goal.pitch = base.pitch; goal.zoom = 1; },
    setView(v, instant) {
      if (v.yaw !== undefined) goal.yaw = clamp(v.yaw, -LIMITS.yaw, LIMITS.yaw);
      if (v.pitch !== undefined) goal.pitch = clamp(v.pitch, LIMITS.pitchMin, LIMITS.pitchMax);
      if (v.zoom !== undefined) goal.zoom = clamp(v.zoom, LIMITS.zoomMin, LIMITS.zoomMax);
      if (instant) Object.assign(cur, goal);
    },
    view: () => ({ ...cur }),
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
}
