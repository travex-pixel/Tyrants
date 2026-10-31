import type { Building, Creature, Faction, GroundItem, Island, ResourceNode, ResourceType, World } from "./types";
import { dist2 } from "./rng";
import { heightAt, isVoidAt } from "./terrain";

export function islandAt(w: World, x: number, z: number): Island | null {
  for (const isl of w.islands) {
    if (x >= isl.ox && z >= isl.oz && x < isl.ox + isl.size && z < isl.oz + isl.size && !isVoidAt(isl, x, z)) return isl;
  }
  return null;
}
export function islandById(w: World, id: number): Island {
  return w.islands.find((i) => i.id === id) ?? w.islands[0];
}

export function groundY(w: World, islandId: number, x: number, z: number): number {
  const isl = islandById(w, islandId);
  const h = heightAt(isl, x, z);
  return Math.max(h, isl.waterLevel);
}

export function creaturesOf(w: World, faction: string): Creature[] {
  const out: Creature[] = [];
  for (const id in w.creatures) if (w.creatures[id].faction === faction) out.push(w.creatures[id]);
  return out;
}
export function buildingsOf(w: World, faction: string, type?: string): Building[] {
  const out: Building[] = [];
  for (const id in w.buildings) {
    const b = w.buildings[id];
    if (b.faction === faction && (!type || b.type === type)) out.push(b);
  }
  return out;
}

/** Drop-off points for a faction on an island: completed storage huts or campfires. */
export function nearestDropoff(w: World, faction: string, islandId: number, x: number, z: number): Building | null {
  let best: Building | null = null;
  let bd = Infinity;
  for (const id in w.buildings) {
    const b = w.buildings[id];
    if (b.faction !== faction || b.islandId !== islandId || !b.complete) continue;
    if (b.type !== "storage" && b.type !== "campfire") continue;
    const d = dist2(b.x, b.z, x, z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

export function nearestNode(
  w: World,
  islandId: number,
  x: number,
  z: number,
  pred: (n: ResourceNode) => boolean,
  maxDist = 60,
): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bd = maxDist * maxDist;
  for (const id in w.nodes) {
    const n = w.nodes[id];
    if (n.islandId !== islandId || n.amount <= 0 || !pred(n)) continue;
    const d = dist2(n.x, n.z, x, z);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}

export function nearestCreature(w: World, x: number, z: number, maxDist: number, pred?: (c: Creature) => boolean): Creature | null {
  let best: Creature | null = null;
  let bd = maxDist * maxDist;
  for (const id in w.creatures) {
    const c = w.creatures[id];
    if (pred && !pred(c)) continue;
    const d = dist2(c.x, c.z, x, z);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

export function creaturesNear(w: World, x: number, z: number, r: number, islandId?: number): Creature[] {
  const out: Creature[] = [];
  const r2 = r * r;
  for (const id in w.creatures) {
    const c = w.creatures[id];
    if (islandId !== undefined && c.islandId !== islandId) continue;
    if (dist2(c.x, c.z, x, z) <= r2) out.push(c);
  }
  return out;
}

export function nearestBuilding(w: World, x: number, z: number, maxDist: number, pred?: (b: Building) => boolean): Building | null {
  let best: Building | null = null;
  let bd = maxDist * maxDist;
  for (const id in w.buildings) {
    const b = w.buildings[id];
    if (pred && !pred(b)) continue;
    const d = dist2(b.x, b.z, x, z);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

export function itemsNear(w: World, islandId: number, x: number, z: number, r: number): GroundItem[] {
  const out: GroundItem[] = [];
  const r2 = r * r;
  for (const id in w.items) {
    const it = w.items[id];
    if (it.islandId === islandId && dist2(it.x, it.z, x, z) <= r2) out.push(it);
  }
  return out;
}

export function factionFood(f: Faction): number {
  return f.stock.food;
}

export function totalStock(f: Faction): number {
  return f.stock.wood + f.stock.stone + f.stock.food;
}

export function population(w: World, faction: string): number {
  let n = 0;
  for (const id in w.creatures) if (w.creatures[id].faction === faction) n++;
  return n;
}

export function housingCapacity(w: World, faction: string): number {
  let n = 0;
  for (const id in w.buildings) {
    const b = w.buildings[id];
    if (b.faction === faction && b.complete && b.type === "house") n += 3;
  }
  return n;
}

export function canAfford(f: Faction, cost: Partial<Record<ResourceType, number>>): boolean {
  for (const k in cost) if (f.stock[k as ResourceType] < (cost[k as ResourceType] ?? 0)) return false;
  return true;
}
