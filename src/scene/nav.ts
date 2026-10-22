// Walk graph over the room (hall.ts): all-pairs shortest paths, computed once, and
// path queries from any point. Scripted paths, not free roaming (PROJECT.md §7).
import * as THREE from 'three';
import { NAV_EDGES, NAV_NODES } from './hall';

export class Nav {
  readonly names: string[];
  readonly pos: THREE.Vector2[];
  private idx = new Map<string, number>();
  private dist: Float32Array;
  private next: Int16Array;
  private n: number;

  constructor() {
    this.names = Object.keys(NAV_NODES);
    this.n = this.names.length;
    this.pos = this.names.map((k) => new THREE.Vector2(...NAV_NODES[k]));
    this.names.forEach((k, i) => this.idx.set(k, i));
    const n = this.n;
    this.dist = new Float32Array(n * n).fill(Infinity);
    this.next = new Int16Array(n * n).fill(-1);
    for (let i = 0; i < n; i++) { this.dist[i * n + i] = 0; this.next[i * n + i] = i; }
    for (const [a, b] of NAV_EDGES) {
      const i = this.idx.get(a)!, j = this.idx.get(b)!;
      const d = this.pos[i].distanceTo(this.pos[j]);
      this.dist[i * n + j] = this.dist[j * n + i] = d;
      this.next[i * n + j] = j; this.next[j * n + i] = i;
    }
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const d = this.dist[i * n + k] + this.dist[k * n + j];
      if (d < this.dist[i * n + j]) { this.dist[i * n + j] = d; this.next[i * n + j] = this.next[i * n + k]; }
    }
  }

  node(name: string): THREE.Vector2 { return this.pos[this.idx.get(name)!]; }
  has(name: string) { return this.idx.has(name); }

  /** Node sequence from node a to node b (inclusive). */
  route(a: string, b: string): string[] {
    let i = this.idx.get(a)!;
    const j = this.idx.get(b)!;
    const out = [this.names[i]];
    while (i !== j) {
      i = this.next[i * this.n + j];
      if (i < 0) break;
      out.push(this.names[i]);
    }
    return out;
  }

  cost(a: string, b: string) { return this.dist[this.idx.get(a)! * this.n + this.idx.get(b)!]; }

  /**
   * Points to walk from (x, z) to node `to`: enters the graph at the node that
   * minimises (straight distance + remaining path), so a re-route mid-walk turns
   * round toward the goal instead of doubling back to an old node.
   */
  pathFrom(x: number, z: number, to: string, out: THREE.Vector2[]): THREE.Vector2[] {
    const t = this.idx.get(to)!;
    let best = -1, bestCost = Infinity;
    for (let i = 0; i < this.n; i++) {
      const c = Math.hypot(this.pos[i].x - x, this.pos[i].y - z) * 1.15 + this.dist[i * this.n + t];
      if (c < bestCost) { bestCost = c; best = i; }
    }
    out.length = 0;
    for (const nm of this.route(this.names[best], to)) out.push(this.node(nm).clone());
    // Skip a first node that lies behind us relative to the second.
    if (out.length >= 2) {
      const a = out[0], b = out[1];
      const ab = b.clone().sub(a), ap = new THREE.Vector2(x - a.x, z - a.y);
      if (ab.dot(ap) > 0 && ap.length() < ab.length()) out.shift();
    }
    return out;
  }
}
