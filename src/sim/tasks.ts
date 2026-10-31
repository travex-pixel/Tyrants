import type { Building, Creature, Faction, JobId, ResourceType, Task, World } from "./types";
import { BUILDINGS, SPECIES } from "./species";
import { dist2 } from "./rng";
import { buildingsOf, creaturesOf, nearestDropoff, nearestNode } from "./query";
import { findFlatSpot } from "./terrain";
import { worldRng, saveRng } from "./world";

function addTask(w: World, t: Omit<Task, "id" | "assignedTo" | "createdAt" | "attempts">): Task {
  const task: Task = { ...t, id: w.nextId++, assignedTo: null, createdAt: w.time, attempts: 0 };
  w.tasks[task.id] = task;
  return task;
}

function countTasks(w: World, faction: string, pred: (t: Task) => boolean): number {
  let n = 0;
  for (const id in w.tasks) {
    const t = w.tasks[id];
    if (t.faction === faction && pred(t)) n++;
  }
  return n;
}

export function removeTask(w: World, taskId: number, refund = true) {
  const t = w.tasks[taskId];
  if (!t) return;
  if (t.assignedTo !== null) {
    const c = w.creatures[t.assignedTo];
    if (c && c.taskId === taskId) c.taskId = null;
  }
  if (t.nodeId !== undefined) {
    const n = w.nodes[t.nodeId];
    if (n && n.reservedBy === t.assignedTo && t.assignedTo !== null) n.reservedBy = null;
  }
  if (t.itemId !== undefined) {
    const it = w.items[t.itemId];
    if (it) it.reservedBy = null;
  }
  // Refund reserved materials for delivery tasks that never left the stockpile
  if (refund && t.kind === "deliverMaterial" && t.resource && t.amount && !t.assignedTo) {
    const f = w.factions[t.faction];
    if (f) f.stock[t.resource] += t.amount;
  }
  delete w.tasks[taskId];
}

/** Creature abandons its task (keeps the task open for others). */
export function unassignTask(w: World, c: Creature, failed = false) {
  if (c.taskId === null) return;
  const t = w.tasks[c.taskId];
  if (t) {
    t.assignedTo = null;
    if (failed) t.attempts++;
    if (t.nodeId !== undefined) {
      const n = w.nodes[t.nodeId];
      if (n && n.reservedBy === c.id) n.reservedBy = null;
    }
    if (t.itemId !== undefined) {
      const it = w.items[t.itemId];
      if (it && it.reservedBy === c.id) it.reservedBy = null;
    }
    if (t.kind === "deliverMaterial") {
      // if the creature already picked up the material, the delivered amount travels with the creature (handled by drop)
      if (t.attempts > 4) removeTask(w, t.id, true);
    } else if (t.attempts > 4) {
      removeTask(w, t.id, false);
    }
  }
  c.taskId = null;
}

/** Periodic task generation for all factions. Keeps a bounded set of open tasks based on real needs. */
export function generateTasks(w: World) {
  const rng = worldRng(w);
  // Cleanup stale tasks
  for (const id in w.tasks) {
    const t = w.tasks[id];
    let stale = false;
    if (t.kind === "gatherNode") {
      const n = t.nodeId !== undefined ? w.nodes[t.nodeId] : undefined;
      if (!n || n.amount <= 0 || (n.reservedBy !== null && n.reservedBy !== t.assignedTo)) stale = true;
    } else if (t.kind === "haulItem") {
      if (t.itemId === undefined || !w.items[t.itemId]) stale = true;
    } else if (t.kind === "deliverMaterial" || t.kind === "construct") {
      const b = t.buildingId !== undefined ? w.buildings[t.buildingId] : undefined;
      if (!b || b.complete) stale = true;
      else if (t.kind === "construct" && !materialsDelivered(b)) stale = true;
    } else if (t.kind === "tendFarm") {
      const b = t.buildingId !== undefined ? w.buildings[t.buildingId] : undefined;
      if (!b || !b.complete) stale = true;
    } else if (t.kind === "exploreSpot") {
      if (w.time - t.createdAt > 240 && t.assignedTo === null) stale = true;
    }
    if (t.assignedTo !== null && !w.creatures[t.assignedTo]) t.assignedTo = null;
    if (stale) removeTask(w, t.id, !t.assignedTo);
  }

  for (const fid in w.factions) {
    const f = w.factions[fid];
    const creatures = creaturesOf(w, fid);
    if (creatures.length === 0) continue;
    const islandIds = new Set(creatures.map((c) => c.islandId));
    for (const islandId of islandIds) {
      generateFactionTasks(w, f, islandId, creatures.filter((c) => c.islandId === islandId).length);
    }
  }
  saveRng(w, rng);
}

export function materialsDelivered(b: Building): boolean {
  for (const k in b.cost) if ((b.delivered[k as ResourceType] ?? 0) < (b.cost[k as ResourceType] ?? 0)) return false;
  return true;
}

function generateFactionTasks(w: World, f: Faction, islandId: number, pop: number) {
  const fid = f.id;
  const dropoffs = buildingsOf(w, fid).filter((b) => b.islandId === islandId && b.complete && (b.type === "storage" || b.type === "campfire"));
  const anchor = dropoffs[0] ?? null;
  const ax = anchor ? anchor.x : w.islands.find((i) => i.id === islandId)!.spawnPoint.x;
  const az = anchor ? anchor.z : w.islands.find((i) => i.id === islandId)!.spawnPoint.z;

  // ── Construction ──
  for (const b of buildingsOf(w, fid)) {
    if (b.islandId !== islandId || b.complete) continue;
    if (!materialsDelivered(b)) {
      for (const k in b.cost) {
        const res = k as ResourceType;
        const need = (b.cost[res] ?? 0) - (b.delivered[res] ?? 0);
        const inFlight = sumTasks(w, (t) => t.kind === "deliverMaterial" && t.buildingId === b.id && t.resource === res);
        let remaining = need - inFlight;
        while (remaining > 0 && f.stock[res] > 0 && dropoffs.length > 0) {
          const amt = Math.min(remaining, 4, f.stock[res]);
          f.stock[res] -= amt; // reserve materials now; refunded if task is cancelled
          addTask(w, { job: "haul", faction: fid, islandId, kind: "deliverMaterial", buildingId: b.id, resource: res, amount: amt, x: b.x, z: b.z, priority: 1.6 });
          remaining -= amt;
        }
      }
    } else {
      const builders = countTasks(w, fid, (t) => t.kind === "construct" && t.buildingId === b.id);
      const want = BUILDINGS[b.type].work > 15 ? 2 : 1;
      for (let i = builders; i < want; i++) addTask(w, { job: "build", faction: fid, islandId, kind: "construct", buildingId: b.id, x: b.x, z: b.z, priority: 1.5 });
    }
  }

  // ── Hauling loose items ──
  for (const id in w.items) {
    const it = w.items[id];
    if (it.islandId !== islandId || it.reservedBy !== null || it.vy !== 0) continue;
    if (!anchor) continue;
    // only one faction hauls an item: the nearest drop-off owner (first come first served)
    if (countTasks(w, fid, (t) => t.kind === "haulItem" && t.itemId === it.id) > 0) continue;
    let claimed = false;
    for (const tid in w.tasks) if (w.tasks[tid].kind === "haulItem" && w.tasks[tid].itemId === it.id) claimed = true;
    if (claimed) continue;
    if (dist2(it.x, it.z, ax, az) > 40 * 40) continue;
    addTask(w, { job: "haul", faction: fid, islandId, kind: "haulItem", itemId: it.id, resource: it.type, amount: it.amount, x: it.x, z: it.z, priority: 1.1 });
  }

  // ── Gathering (demand driven) ──
  if (dropoffs.length > 0) {
    const demand = resourceDemand(w, f, islandId, pop);
    for (const res of ["wood", "stone", "food"] as ResourceType[]) {
      const open = countTasks(w, fid, (t) => t.kind === "gatherNode" && t.resource === res && t.islandId === islandId);
      let toCreate = demand[res] - open;
      const lumberCamps = res === "wood" ? buildingsOf(w, fid, "lumber").filter((b) => b.complete && b.islandId === islandId) : [];
      let guard = 0;
      while (toCreate > 0 && guard++ < 6) {
        const near = lumberCamps.length > 0 && toCreate <= lumberCamps.length * 3 ? lumberCamps[toCreate % lumberCamps.length] : anchor!;
        const node = nearestNode(w, islandId, near.x, near.z, (n) => n.resource === res && n.reservedBy === null && n.kind !== "crop" && !taskForNode(w, n.id), 60);
        if (!node) break;
        addTask(w, { job: "gather", faction: fid, islandId, kind: "gatherNode", nodeId: node.id, resource: res, x: node.x, z: node.z, priority: res === "food" && f.stock.food < pop * 1.5 ? 1.8 : 1 });
        toCreate--;
      }
    }
  }

  // ── Farms ──
  for (const b of buildingsOf(w, fid, "farm")) {
    if (b.islandId !== islandId || !b.complete) continue;
    const tenders = countTasks(w, fid, (t) => t.kind === "tendFarm" && t.buildingId === b.id);
    const want = b.cropTimer >= 1 ? 2 : 1;
    for (let i = tenders; i < want; i++) addTask(w, { job: "farm", faction: fid, islandId, kind: "tendFarm", buildingId: b.id, x: b.x, z: b.z, priority: b.cropTimer >= 1 ? 1.7 : 1 });
  }

  // ── Exploration ──
  let unfound = 0;
  for (const id in w.discoveries) {
    const d = w.discoveries[id];
    if (d.islandId === islandId && !d.found) unfound++;
  }
  if (unfound > 0 && pop >= 3) {
    const open = countTasks(w, fid, (t) => t.kind === "exploreSpot" && t.islandId === islandId);
    if (open < 1) {
      const isl = w.islands.find((i) => i.id === islandId)!;
      const rng = worldRng(w);
      // target a random unfound discovery's general area (not its exact position: exploring has to actually find it)
      const targets = Object.values(w.discoveries).filter((d) => d.islandId === islandId && !d.found);
      const d = rng.pick(targets);
      const spot = findFlatSpot(isl, d.x + rng.range(-5, 5), d.z + rng.range(-5, 5), 0, rng, 20);
      if (spot) addTask(w, { job: "explore", faction: fid, islandId, kind: "exploreSpot", x: spot.x, z: spot.z, priority: 0.7 });
      saveRng(w, rng);
    }
  }
}

function taskForNode(w: World, nodeId: number): boolean {
  for (const id in w.tasks) if (w.tasks[id].nodeId === nodeId) return true;
  return false;
}

function sumTasks(w: World, pred: (t: Task) => boolean): number {
  let s = 0;
  for (const id in w.tasks) {
    const t = w.tasks[id];
    if (pred(t)) s += t.amount ?? 0;
  }
  return s;
}

/** Desired number of simultaneous gather tasks per resource. Based on stock, population, pending construction. */
export function resourceDemand(w: World, f: Faction, islandId: number, pop: number): Record<ResourceType, number> {
  const d: Record<ResourceType, number> = { wood: 0, stone: 0, food: 0 };
  const pending: Record<ResourceType, number> = { wood: 0, stone: 0, food: 0 };
  for (const b of buildingsOf(w, f.id)) {
    if (b.complete || b.islandId !== islandId) continue;
    for (const k in b.cost) pending[k as ResourceType] += Math.max(0, (b.cost[k as ResourceType] ?? 0) - (b.delivered[k as ResourceType] ?? 0));
  }
  const lumber = buildingsOf(w, f.id, "lumber").filter((b) => b.complete && b.islandId === islandId).length;
  d.wood = Math.min(pop, 1 + lumber * 3 + (f.stock.wood < 20 + pending.wood ? 1 : 0) + (pending.wood > f.stock.wood ? 1 : 0));
  d.stone = f.stock.stone < 10 + pending.stone ? 1 + (pending.stone > f.stock.stone ? 1 : 0) : 0;
  d.food = f.stock.food < pop * 2.5 ? 1 + (f.stock.food < pop ? 1 : 0) : 0;
  // Priorities from the overlord scale demand
  d.wood = Math.round(d.wood * f.jobPriorities.gather);
  d.stone = Math.round(d.stone * f.jobPriorities.gather);
  d.food = Math.round(d.food * Math.max(f.jobPriorities.gather, f.jobPriorities.farm));
  return d;
}

/** Choose the best open task for a creature. */
export function pickTask(w: World, c: Creature): Task | null {
  const f = w.factions[c.faction];
  if (!f) return null;
  const species = SPECIES[c.species];
  let best: Task | null = null;
  let bestScore = 0.35; // minimum motivation
  for (const id in w.tasks) {
    const t = w.tasks[id];
    if (t.faction !== c.faction || t.islandId !== c.islandId || t.assignedTo !== null) continue;
    if (t.kind === "gatherNode") {
      const n = t.nodeId !== undefined ? w.nodes[t.nodeId] : undefined;
      if (!n || n.reservedBy !== null) continue;
    }
    const d = Math.sqrt(dist2(c.x, c.z, t.x, t.z));
    let score = t.priority * f.jobPriorities[t.job] * species.jobAffinity[t.job];
    score *= 1 / (1 + d / 18);
    if (c.traits.includes("hardworking")) score *= 1.25;
    if (c.traits.includes("curious") && t.job === "explore") score *= 2.2;
    if (c.traits.includes("greedy") && t.job === "gather") score *= 1.3;
    if (c.traits.includes("lazy") && (t.job === "build" || t.job === "haul")) score *= 0.6;
    if (t.kind === "gatherNode" && t.resource === "wood") score *= 1 + c.skills.woodcutting / 200;
    if (t.kind === "construct") score *= 1 + c.skills.construction / 200;
    if (t.kind === "tendFarm") score *= 1 + c.skills.farming / 200;
    if (c.hunger > 55 && t.kind !== "gatherNode") score *= 0.6;
    if (t.attempts > 0) score *= 0.7;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

export function assignTask(w: World, c: Creature, t: Task) {
  t.assignedTo = c.id;
  c.taskId = t.id;
  if (t.nodeId !== undefined) {
    const n = w.nodes[t.nodeId];
    if (n) n.reservedBy = c.id;
  }
  if (t.itemId !== undefined) {
    const it = w.items[t.itemId];
    if (it) it.reservedBy = c.id;
  }
}

export const JOB_LIST: JobId[] = ["gather", "build", "farm", "haul", "explore"];
