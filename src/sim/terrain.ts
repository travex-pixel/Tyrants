import { RNG, fbm, clamp, lerp } from "./rng";
import type { BiomeId, Island, Vec2 } from "./types";

export const VOID_HEIGHT = -6;

export interface IslandGenOptions {
  id: number;
  name: string;
  biome: BiomeId;
  ox: number;
  oz: number;
  size: number;
  seed: number;
  ownerFaction: string | null;
  lakes?: boolean;
  treeDensity?: number;
}

/** Vertex height lookup (size+1 per side). */
export function vertexHeight(isl: Island, vx: number, vz: number): number {
  const n = isl.size + 1;
  vx = clamp(vx, 0, isl.size);
  vz = clamp(vz, 0, isl.size);
  return isl.heights[vz * n + vx];
}

/** Bilinear terrain height at world coordinates. Returns VOID_HEIGHT outside the island. */
export function heightAt(isl: Island, wx: number, wz: number): number {
  const lx = wx - isl.ox;
  const lz = wz - isl.oz;
  if (lx < 0 || lz < 0 || lx >= isl.size || lz >= isl.size) return VOID_HEIGHT;
  const x0 = Math.floor(lx);
  const z0 = Math.floor(lz);
  const fx = lx - x0;
  const fz = lz - z0;
  const h00 = vertexHeight(isl, x0, z0);
  const h10 = vertexHeight(isl, x0 + 1, z0);
  const h01 = vertexHeight(isl, x0, z0 + 1);
  const h11 = vertexHeight(isl, x0 + 1, z0 + 1);
  return lerp(lerp(h00, h10, fx), lerp(h01, h11, fx), fz);
}

export function isVoidAt(isl: Island, wx: number, wz: number): boolean {
  return heightAt(isl, wx, wz) < -0.5;
}
export function isWaterAt(isl: Island, wx: number, wz: number): boolean {
  const h = heightAt(isl, wx, wz);
  return h > -0.5 && h < isl.waterLevel;
}

export function cellOf(isl: Island, wx: number, wz: number): { cx: number; cz: number } | null {
  const cx = Math.floor(wx - isl.ox);
  const cz = Math.floor(wz - isl.oz);
  if (cx < 0 || cz < 0 || cx >= isl.size || cz >= isl.size) return null;
  return { cx, cz };
}

export function cellCenter(isl: Island, cx: number, cz: number): Vec2 {
  return { x: isl.ox + cx + 0.5, z: isl.oz + cz + 0.5 };
}

/** Cell-level walkability derived from heights (ignores dynamic obstacles). 0 ok, 2 void/water/steep. */
export function terrainCellState(isl: Island, cx: number, cz: number): number {
  const h00 = vertexHeight(isl, cx, cz);
  const h10 = vertexHeight(isl, cx + 1, cz);
  const h01 = vertexHeight(isl, cx, cz + 1);
  const h11 = vertexHeight(isl, cx + 1, cz + 1);
  const min = Math.min(h00, h10, h01, h11);
  const max = Math.max(h00, h10, h01, h11);
  if (min < isl.waterLevel + 0.02) return 2; // water or void
  if (max - min > 1.15) return 2; // too steep (cliff)
  return 0;
}

/** Recompute terrain-derived blocking; preserves dynamic obstacles (value 1) only where terrain is OK. */
export function rebuildBlocked(isl: Island, obstacleCells: Set<number>): void {
  const n = isl.size;
  if (isl.blocked.length !== n * n) isl.blocked = new Array(n * n).fill(0);
  for (let cz = 0; cz < n; cz++) {
    for (let cx = 0; cx < n; cx++) {
      const i = cz * n + cx;
      const ts = terrainCellState(isl, cx, cz);
      isl.blocked[i] = ts === 2 ? 2 : obstacleCells.has(i) ? 1 : 0;
    }
  }
  isl.navVersion++;
}

export function generateIsland(o: IslandGenOptions): Island {
  const n = o.size;
  const heights = new Array((n + 1) * (n + 1)).fill(VOID_HEIGHT);
  const rng = new RNG(o.seed);
  const waterLevel = 0.55;
  const cx = n / 2;
  const cz = n / 2;
  const radius = n * 0.44;
  const shapeSeed = rng.int(1, 100000);
  const hillSeed = rng.int(1, 100000);
  const lakeSeed = rng.int(1, 100000);
  const lakes = o.lakes !== false;
  const freq = 2.2 / n;

  for (let vz = 0; vz <= n; vz++) {
    for (let vx = 0; vx <= n; vx++) {
      const dx = vx - cx;
      const dz = vz - cz;
      const d = Math.sqrt(dx * dx + dz * dz);
      const ang = Math.atan2(dz, dx);
      // Wobbly coastline
      const wob = fbm(Math.cos(ang) * 1.7 + 10, Math.sin(ang) * 1.7 + 10, shapeSeed, 3) - 0.5;
      const r = radius * (1 + wob * 0.42);
      const mask = clamp(1 - d / r, -1, 1);
      if (mask <= 0.02) continue; // void
      const edge = Math.min(1, mask / 0.3); // 0 at coast .. 1 inland
      const hills = fbm(vx * freq * 2.5, vz * freq * 2.5, hillSeed, 4) - 0.45;
      let h = waterLevel + 0.12 + edge * 0.9 + hills * 3.3 * Math.pow(edge, 0.6);
      // central mountain-ish bump
      h += Math.max(0, mask - 0.55) * 2.0;
      // lakes
      if (lakes) {
        const lk = fbm(vx * freq * 2.2 + 50, vz * freq * 2.2 + 50, lakeSeed, 3);
        if (lk > 0.66 && mask > 0.25 && mask < 0.8) {
          const depth = (lk - 0.66) / 0.14;
          h = Math.min(h, waterLevel - 0.25 - depth * 0.6);
        }
      }
      // smooth beach at the coast: pull coastal cells toward a gentle plateau
      if (edge < 1) h = lerp(waterLevel + 0.1, h, edge);
      heights[vz * (n + 1) + vx] = h;
    }
  }

  // Smooth pass to avoid spiky terrain (two iterations)
  for (let it = 0; it < 2; it++) {
    const copy = heights.slice();
    for (let vz = 1; vz < n; vz++) {
      for (let vx = 1; vx < n; vx++) {
        const i = vz * (n + 1) + vx;
        if (copy[i] < -0.5) continue;
        let sum = 0;
        let c = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            const v = copy[(vz + dz) * (n + 1) + vx + dx];
            if (v > -0.5) {
              sum += v;
              c++;
            }
          }
        heights[i] = lerp(copy[i], sum / c, 0.5);
      }
    }
  }

  const isl: Island = {
    id: o.id,
    name: o.name,
    biome: o.biome,
    ox: o.ox,
    oz: o.oz,
    size: n,
    seed: o.seed,
    heights,
    waterLevel,
    blocked: new Array(n * n).fill(0),
    dirty: true,
    navVersion: 0,
    ownerFaction: o.ownerFaction,
    center: { x: o.ox + cx, z: o.oz + cz },
    spawnPoint: { x: o.ox + cx, z: o.oz + cz },
  };
  rebuildBlocked(isl, new Set());
  // Pick a flat spawn point near the centre
  const sp = findFlatSpot(isl, isl.center.x, isl.center.z, 3, rng) ?? isl.center;
  isl.spawnPoint = sp;
  return isl;
}

/** Find a walkable, flat-ish spot near (x,z) with clearance radius r (cells). */
export function findFlatSpot(isl: Island, x: number, z: number, r: number, rng: RNG, maxTries = 80, minDist = 0): Vec2 | null {
  let best: Vec2 | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < maxTries; i++) {
    const ang = rng.next() * Math.PI * 2;
    const rad = minDist + (i / maxTries) * (isl.size * 0.4);
    const px = x + Math.cos(ang) * rad;
    const pz = z + Math.sin(ang) * rad;
    const score = flatness(isl, px, pz, r);
    if (score !== null && score < bestScore) {
      bestScore = score;
      best = { x: px, z: pz };
      if (score < 0.15) break;
    }
  }
  return best;
}

/** Returns height variance over a disc of radius r (cells) or null if any cell is unwalkable. */
export function flatness(isl: Island, x: number, z: number, r: number): number | null {
  let min = Infinity;
  let max = -Infinity;
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const c = cellOf(isl, x + dx, z + dz);
      if (!c) return null;
      if (isl.blocked[c.cz * isl.size + c.cx] !== 0) return null;
      const h = heightAt(isl, x + dx, z + dz);
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  return max - min;
}

export function isBuildable(isl: Island, x: number, z: number, footprint: number): boolean {
  const f = flatness(isl, x, z, footprint);
  return f !== null && f < 0.9;
}

/** Modify terrain heights in a radius; returns true if anything changed. */
export function terraform(isl: Island, wx: number, wz: number, radius: number, delta: number): boolean {
  const n = isl.size + 1;
  const lx = wx - isl.ox;
  const lz = wz - isl.oz;
  let changed = false;
  const minH = isl.waterLevel - 1.2;
  const maxH = 6.5;
  for (let vz = Math.floor(lz - radius); vz <= Math.ceil(lz + radius); vz++) {
    for (let vx = Math.floor(lx - radius); vx <= Math.ceil(lx + radius); vx++) {
      if (vx < 1 || vz < 1 || vx >= n - 1 || vz >= n - 1) continue;
      const i = vz * n + vx;
      const h = isl.heights[i];
      if (h < -0.5) continue; // cannot grow the island into the void
      const d = Math.hypot(vx - lx, vz - lz) / radius;
      if (d > 1) continue;
      const falloff = 0.5 + 0.5 * Math.cos(d * Math.PI);
      const nh = clamp(h + delta * falloff, minH, maxH);
      if (nh !== h) {
        isl.heights[i] = nh;
        changed = true;
      }
    }
  }
  if (changed) isl.dirty = true;
  return changed;
}
