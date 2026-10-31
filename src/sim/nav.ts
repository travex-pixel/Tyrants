import type { Island, Vec2 } from "./types";
import { cellOf, cellCenter } from "./terrain";

/** Binary min-heap for A*. */
class Heap {
  private a: { i: number; f: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(i: number, f: number) {
    const a = this.a;
    a.push({ i, f });
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (a[p].f <= a[k].f) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1;
        const r = l + 1;
        let m = k;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top.i;
  }
}

const pathCache = new Map<string, { v: number; path: Vec2[] | null; t: number }>();
let cacheHits = 0;
let cacheMisses = 0;
export const navStats = () => ({ cacheHits, cacheMisses, size: pathCache.size });

function cacheKey(isl: Island, a: number, b: number) {
  return `${isl.id}:${a}:${b}`;
}

/** Nearest walkable cell index to a world position (spiral search). */
export function nearestWalkableCell(isl: Island, wx: number, wz: number, maxR = 6): number | null {
  const c = cellOf(isl, wx, wz);
  const n = isl.size;
  const cx = c ? c.cx : Math.round(Math.min(n - 1, Math.max(0, wx - isl.ox)));
  const cz = c ? c.cz : Math.round(Math.min(n - 1, Math.max(0, wz - isl.oz)));
  if (c && isl.blocked[cz * n + cx] === 0) return cz * n + cx;
  for (let r = 1; r <= maxR; r++) {
    let best: number | null = null;
    let bestD = Infinity;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        if (isl.blocked[z * n + x] !== 0) continue;
        const d = (x + 0.5 + isl.ox - wx) ** 2 + (z + 0.5 + isl.oz - wz) ** 2;
        if (d < bestD) {
          bestD = d;
          best = z * n + x;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}

export function isWalkable(isl: Island, wx: number, wz: number): boolean {
  const c = cellOf(isl, wx, wz);
  return !!c && isl.blocked[c.cz * isl.size + c.cx] === 0;
}

/**
 * Grid A* with 8-neighbour movement (no corner cutting). Returns world-space waypoints
 * (smoothed by removing collinear points), or null if unreachable.
 */
export function findPath(isl: Island, from: Vec2, to: Vec2, maxExpand = 4000): Vec2[] | null {
  const n = isl.size;
  const s = nearestWalkableCell(isl, from.x, from.z, 4);
  const g = nearestWalkableCell(isl, to.x, to.z, 4);
  if (s === null || g === null) return null;
  if (s === g) return [to.x === to.x ? { x: to.x, z: to.z } : cellCenter(isl, g % n, Math.floor(g / n))];

  const key = cacheKey(isl, s, g);
  const cached = pathCache.get(key);
  if (cached && cached.v === isl.navVersion) {
    cacheHits++;
    return cached.path ? cached.path.map((p) => ({ x: p.x, z: p.z })) : null;
  }
  cacheMisses++;

  const gScore = new Float32Array(n * n).fill(Infinity);
  const came = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  const heap = new Heap();
  const gx = g % n;
  const gz = Math.floor(g / n);
  const h = (i: number) => {
    const dx = Math.abs((i % n) - gx);
    const dz = Math.abs(Math.floor(i / n) - gz);
    return Math.max(dx, dz) + 0.41 * Math.min(dx, dz);
  };
  gScore[s] = 0;
  heap.push(s, h(s));
  let expanded = 0;
  let found = false;
  const blocked = isl.blocked;
  while (heap.size > 0 && expanded < maxExpand) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    expanded++;
    if (cur === g) {
      found = true;
      break;
    }
    const cx = cur % n;
    const cz = Math.floor(cur / n);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
        const ni = nz * n + nx;
        if (blocked[ni] !== 0 || closed[ni]) continue;
        if (dx !== 0 && dz !== 0) {
          // no corner cutting
          if (blocked[cz * n + nx] !== 0 || blocked[nz * n + cx] !== 0) continue;
        }
        const cost = dx !== 0 && dz !== 0 ? 1.4142 : 1;
        const ng = gScore[cur] + cost;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(ni));
        }
      }
    }
  }
  let path: Vec2[] | null = null;
  if (found) {
    const cells: number[] = [];
    let c = g;
    while (c !== -1) {
      cells.push(c);
      c = came[c];
    }
    cells.reverse();
    // Collinear simplification
    const pts: Vec2[] = [];
    for (let i = 0; i < cells.length; i++) {
      const ci = cells[i];
      const p = cellCenter(isl, ci % n, Math.floor(ci / n));
      if (i > 0 && i < cells.length - 1) {
        const a = cells[i - 1];
        const b = cells[i + 1];
        const d1x = (ci % n) - (a % n);
        const d1z = Math.floor(ci / n) - Math.floor(a / n);
        const d2x = (b % n) - (ci % n);
        const d2z = Math.floor(b / n) - Math.floor(ci / n);
        if (d1x === d2x && d1z === d2z) continue;
      }
      pts.push(p);
    }
    // Snap final point to requested target if it is walkable (so creatures reach precise spots)
    if (isWalkable(isl, to.x, to.z)) pts[pts.length - 1] = { x: to.x, z: to.z };
    if (pts.length > 1) pts.shift(); // first point is the creature's own cell
    path = pts;
  }
  if (pathCache.size > 1500) {
    // evict oldest third
    const keys = Array.from(pathCache.keys()).slice(0, 500);
    for (const k of keys) pathCache.delete(k);
  }
  pathCache.set(key, { v: isl.navVersion, path: path ? path.map((p) => ({ ...p })) : null, t: Date.now() });
  return path;
}

export function clearPathCache() {
  pathCache.clear();
}
