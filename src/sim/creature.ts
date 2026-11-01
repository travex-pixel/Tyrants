import type { Building, Creature, CreatureState, GroundItem, ResourceNode, ResourceType, SkillId, Task, World } from "./types";
import { SPECIES, BUILDINGS, skillEfficiency, skillLevel } from "./species";
import { RNG, clamp, dist2 } from "./rng";
import { heightAt, isWaterAt, isVoidAt, cellOf } from "./terrain";
import { findPath, nearestWalkableCell, isWalkable } from "./nav";
import { buildingsOf, creaturesNear, islandById, nearestDropoff, nearestNode, nearestBuilding } from "./query";
import { chronicle, effect } from "./chronicle";
import { assignTask, materialsDelivered, pickTask, removeTask, unassignTask, markUnreachable } from "./tasks";
import { rebuildIslandNav } from "./world";
import { unlockAchievement, addXp } from "./progression";
import { boardSkiff, rimTowards } from "./skiffs";
import { addMayhem, damageBuilding } from "./mayhem";

const GRAVITY = 14;
const ARRIVE = 0.22;

export function isNight(w: World): boolean {
  const f = (w.time % w.dayLength) / w.dayLength;
  return f > 0.84;
}
/** Sun height in [-1, 1] for a day fraction; time 0 is mid-morning, sunset at ~0.72, night after 0.74. */
export function sunHeightFor(f: number): number {
  const phase = (f + 0.1) % 1;
  return phase < 0.82 ? Math.sin((phase / 0.82) * Math.PI) : -Math.sin(((phase - 0.82) / 0.18) * Math.PI);
}
export function dayFraction(w: World): number {
  return (w.time % w.dayLength) / w.dayLength;
}

export function remember(c: Creature, kind: string, weight: number, who?: number, x?: number, z?: number, t = 0) {
  c.memory.push({ t, kind, who, x, z, weight });
  if (c.memory.length > 24) c.memory.shift();
}
export function relation(c: Creature, other: number, delta: number) {
  c.relationships[other] = clamp((c.relationships[other] ?? 0) + delta, -100, 100);
}

function setState(c: Creature, s: CreatureState) {
  if (c.state !== s) {
    c.state = s;
    c.stateTime = 0;
  }
}

function speedOf(w: World, c: Creature): number {
  let s = SPECIES[c.species].speed * c.speedMul;
  if (c.carrying) s *= 0.85;
  if (w.time < c.blessedUntil) s *= 1.25;
  if (c.state === "flee") s *= 1.5;
  if (c.scale > 1.5) s *= 1.2;
  if (c.hunger > 85) s *= 0.75;
  if (c.energy < 15) s *= 0.7;
  if (c.traits.includes("lazy") && c.state !== "flee") s *= 0.9;
  return s;
}

/** Nearest walkable standing spot next to a node, or null when the node is boxed in. */
export function reachSpot(w: World, islandId: number, x: number, z: number): { x: number; z: number } | null {
  const isl = islandById(w, islandId);
  const cell = nearestWalkableCell(isl, x, z, 2);
  if (cell === null) return null;
  const sx = isl.ox + (cell % isl.size) + 0.5;
  const sz = isl.oz + Math.floor(cell / isl.size) + 0.5;
  if (dist2(sx, sz, x, z) > 1.75 * 1.75) return null;
  return { x: sx, z: sz };
}

/** Plan a path to target. Returns false if unreachable. */
export function goTo(w: World, c: Creature, x: number, z: number): boolean {
  const isl = islandById(w, c.islandId);
  const path = findPath(isl, { x: c.x, z: c.z }, { x, z });
  if (!path) {
    c.path = null;
    c.target = null;
    return false;
  }
  c.path = path;
  c.pathIndex = 0;
  c.target = { x, z };
  c.stuckTime = 0;
  return true;
}

/** Advance along path; returns true when arrived (or no path). */
function moveAlong(w: World, c: Creature, dt: number, rng: RNG): boolean {
  if (!c.path || c.pathIndex >= c.path.length) return true;
  const wp = c.path[c.pathIndex];
  const dx = wp.x - c.x;
  const dz = wp.z - c.z;
  const d = Math.hypot(dx, dz);
  const sp = speedOf(w, c);
  const step = sp * dt;
  if (d <= Math.max(step, ARRIVE)) {
    c.x = wp.x;
    c.z = wp.z;
    c.pathIndex++;
    if (c.pathIndex >= c.path.length) {
      c.path = null;
      return true;
    }
    return false;
  }
  // separation from nearby creatures (cheap steering)
  let sx = 0;
  let sz = 0;
  const near = creaturesNear(w, c.x, c.z, 0.7, c.islandId);
  for (const o of near) {
    if (o.id === c.id || o.state === "held" || o.state === "thrown") continue;
    const ox = c.x - o.x;
    const oz = c.z - o.z;
    const od = Math.hypot(ox, oz) || 0.01;
    sx += (ox / od) * (0.7 - od);
    sz += (oz / od) * (0.7 - od);
  }
  let mx = dx / d + sx * 0.8;
  let mz = dz / d + sz * 0.8;
  const ml = Math.hypot(mx, mz) || 1;
  mx /= ml;
  mz /= ml;
  const nx = c.x + mx * step;
  const nz = c.z + mz * step;
  const isl = islandById(w, c.islandId);
  if (isWalkable(isl, nx, nz)) {
    c.x = nx;
    c.z = nz;
  } else {
    // try straight toward waypoint ignoring separation
    const px = c.x + (dx / d) * step;
    const pz = c.z + (dz / d) * step;
    if (isWalkable(isl, px, pz)) {
      c.x = px;
      c.z = pz;
    } else {
      c.stuckTime += dt;
    }
  }
  if (c.scale > 1.5 && c.state !== "flee") giantStomp(w, c, dt, rng);
  const targetHeading = Math.atan2(mx, mz);
  let dh = targetHeading - c.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  c.heading += dh * Math.min(1, dt * 9);
  if (c.stuckTime > 1.2) {
    c.stuckTime = 0;
    // re-plan from a walkable cell
    const cell = nearestWalkableCell(isl, c.x, c.z, 3);
    if (cell !== null) {
      c.x = isl.ox + (cell % isl.size) + 0.5;
      c.z = isl.oz + Math.floor(cell / isl.size) + 0.5;
    }
    if (c.target && !goTo(w, c, c.target.x, c.target.z)) {
      c.path = null;
      return true;
    }
    if (rng.chance(0.3)) unassignTask(w, c, true);
  }
  return false;
}

/** Giants are walking disasters: every step bowls bystanders, strips trees and dents buildings. */
function giantStomp(w: World, c: Creature, dt: number, rng: RNG) {
  const key = `stomp_${c.id}`;
  const last = (w.flags[key] as number) ?? -10;
  if (w.time - last < 0.5) return;
  w.flags[key] = w.time;
  let hit = 0;
  for (const o of creaturesNear(w, c.x, c.z, 1.3, c.islandId)) {
    if (o.id === c.id || o.state === "held" || o.state === "thrown" || o.state === "aboard" || o.scale > 1.5) continue;
    interrupt(w, o, rng, true);
    const dx = o.x - c.x;
    const dz = o.z - c.z;
    const d = Math.hypot(dx, dz) || 0.3;
    o.vx = (dx / d) * 5;
    o.vz = (dz / d) * 5;
    o.vy = 5;
    setState(o, "thrown");
    remember(o, "threat", 0.8, c.id, c.x, c.z, w.time);
    hit++;
  }
  if (hit) {
    effect(w, "dust", c.x, c.z, { ttl: 0.6, size: 1.2 });
    addMayhem(w, hit, c.x, c.z);
  }
  const tree = nearestNode(w, c.islandId, c.x, c.z, (n) => n.kind === "tree" && n.amount > 0, 1.1);
  if (tree) {
    tree.amount = Math.max(0, tree.amount - 2);
    const isl = islandById(w, c.islandId);
    const id = w.nextId++;
    w.items[id] = { id, type: "wood", amount: 1, islandId: c.islandId, x: tree.x + rng.range(-0.8, 0.8), z: tree.z + rng.range(-0.8, 0.8), y: Math.max(heightAt(isl, tree.x, tree.z), isl.waterLevel) + 1.5, vx: 0, vz: 0, vy: 1, reservedBy: null };
    if (tree.amount <= 0) {
      tree.kind = "stump";
      tree.regrow = 0.3;
      rebuildIslandNav(w, isl);
    }
  }
  const b = nearestBuilding(w, c.x, c.z, 1.8, (x) => x.type !== "campfire" && x.islandId === c.islandId);
  if (b) damageBuilding(w, b, 8, `${c.name} the giant walked through it`, rng);
  if (c.hunger > 70) {
    const drop = nearestDropoff(w, c.faction, c.islandId, c.x, c.z);
    const f = w.factions[c.faction];
    if (drop && f && f.stock.food > 0 && dist2(drop.x, drop.z, c.x, c.z) < 9) {
      const amt = Math.min(6, f.stock.food);
      f.stock.food -= amt;
      c.hunger = clamp(c.hunger - amt * 8, 0, 100);
      effect(w, "text", c.x, c.z, { text: "NOM", color: "#ffd166", ttl: 1.2, y: 2.5 });
      if (rng.chance(0.5)) chronicle(w, `${c.name} the giant ate ${amt} food straight out of the stores.`, "story", 2, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
    }
  }
}

function gainSkill(w: World, c: Creature, skill: SkillId, xp: number) {
  const before = skillLevel(c.skills[skill]);
  c.skills[skill] += xp;
  const after = skillLevel(c.skills[skill]);
  if (after > before) {
    effect(w, "levelup", c.x, c.z, { ttl: 2 });
    if (after === 3 || after === 5 || after === 8 || after === 10) {
      const adj = after >= 8 ? "legendary" : after >= 5 ? "an expert" : "a competent";
      chronicle(w, `${c.name} has become ${adj} ${skillTitle(skill)}.`, "milestone", after >= 5 ? 2 : 1, { faction: c.faction });
    }
    if (after >= 5 && c.faction === w.playerFaction) unlockAchievement(w, "skill_5");
  }
}
export function skillTitle(s: SkillId) {
  return { woodcutting: "woodcutter", construction: "builder", farming: "farmer", exploration: "explorer", gathering: "forager" }[s];
}

function dropCarried(w: World, c: Creature, rng: RNG, scatter = 0.6): GroundItem | null {
  if (!c.carrying) return null;
  const it: GroundItem = {
    id: w.nextId++, type: c.carrying.type, amount: c.carrying.amount, islandId: c.islandId,
    x: c.x + rng.range(-scatter, scatter), z: c.z + rng.range(-scatter, scatter), y: c.y + 0.6, vx: rng.range(-1, 1), vz: rng.range(-1, 1), vy: 2, reservedBy: null,
  };
  w.items[it.id] = it;
  c.carrying = null;
  return it;
}

/** Called when a creature is grabbed/thrown/struck: cancels current activity. */
export function interrupt(w: World, c: Creature, rng: RNG, dropItems: boolean) {
  if (c.taskId !== null) {
    const t = w.tasks[c.taskId];
    if (t && t.kind === "deliverMaterial" && c.carrying) {
      // material in hand: convert task so it isn't duplicated; the loose item will be hauled
      removeTask(w, t.id, false);
    } else unassignTask(w, c, false);
  }
  if (c.partnerId !== null) {
    const p = w.creatures[c.partnerId];
    if (p && p.partnerId === c.id) {
      p.partnerId = null;
      setState(p, "idle");
    }
    c.partnerId = null;
  }
  if (dropItems && c.carrying) dropCarried(w, c, rng);
  c.path = null;
  c.target = null;
}

function currentTask(w: World, c: Creature): Task | null {
  if (c.taskId === null) return null;
  const t = w.tasks[c.taskId];
  if (!t) {
    c.taskId = null;
    return null;
  }
  return t;
}

function workMul(w: World, c: Creature): number {
  let m = 1;
  if (w.time < c.blessedUntil) m *= 1.5;
  if (c.traits.includes("hardworking")) m *= 1.2;
  if (c.traits.includes("lazy")) m *= 0.85;
  if (c.energy < 25) m *= 0.7;
  if (c.hunger > 80) m *= 0.7;
  if (c.scale > 1.5) m *= 1.8;
  return m;
}

function tryEat(w: World, c: Creature, rng: RNG): boolean {
  const f = w.factions[c.faction];
  const drop = nearestDropoff(w, c.faction, c.islandId, c.x, c.z);
  if (f && drop && f.stock.food > 0) {
    if (goTo(w, c, drop.x + rng.range(-1.2, 1.2), drop.z + rng.range(-1.2, 1.2))) {
      setState(c, "seekFood");
      c.partnerId = null;
      return true;
    }
  }
  const node = nearestNode(w, c.islandId, c.x, c.z, (n) => n.resource === "food" && n.kind !== "crop", 50);
  if (node && goTo(w, c, node.x + 0.6, node.z + 0.6)) {
    setState(c, "seekFood");
    c.followId = node.id; // reuse as node reference while seeking food from a bush
    return true;
  }
  return false;
}

function restSpot(w: World, c: Creature): Building | null {
  if (c.homeId !== null) {
    const h = w.buildings[c.homeId];
    if (h && h.complete) return h;
    c.homeId = null;
  }
  // claim a free house
  for (const b of buildingsOf(w, c.faction, "house")) {
    if (b.islandId === c.islandId && b.complete && b.occupants.length < (BUILDINGS.house.capacity ?? 3)) {
      b.occupants.push(c.id);
      c.homeId = b.id;
      return b;
    }
  }
  return nearestDropoff(w, c.faction, c.islandId, c.x, c.z);
}

function startRest(w: World, c: Creature, rng: RNG): boolean {
  const spot = restSpot(w, c);
  const tx = spot ? spot.x + rng.range(-1.3, 1.3) : c.x;
  const tz = spot ? spot.z + rng.range(-1.3, 1.3) : c.z;
  if (spot && goTo(w, c, tx, tz)) {
    setState(c, "rest");
    return true;
  }
  setState(c, "rest");
  c.path = null;
  return true;
}

/** Decide what to do next. Called when idle or when a periodic re-evaluation triggers. */
function decide(w: World, c: Creature, rng: RNG) {
  c.decisionCooldown = rng.range(0.6, 1.4);
  const night = isNight(w);
  // 0. the hand: jumpy creatures flee it, devout ones gather around it
  for (const pid in w.players) {
    const p = w.players[pid];
    if (w.time - p.lastSeen > 3) continue;
    const d2 = dist2(p.cursorX, p.cursorZ, c.x, c.z);
    if ((c.jumpy ?? 0) >= 3 && d2 < 9) {
      remember(c, "threat", 1, undefined, p.cursorX, p.cursorZ, w.time);
      effect(w, "text", c.x, c.z, { text: "eek!", color: "#dfe6f0", ttl: 0.9, y: 1.4 });
      return;
    }
    if ((c.devout ?? 0) >= 3 && d2 < 36 && d2 > 2.5 && rng.chance(0.6)) {
      if (goTo(w, c, p.cursorX + rng.range(-1, 1), p.cursorZ + rng.range(-1, 1))) {
        setState(c, "wander");
        c.happiness = clamp(c.happiness + 1, 0, 100);
        if (rng.chance(0.15)) effect(w, "heart", c.x, c.z, { ttl: 1, y: 1 });
        return;
      }
    }
  }
  // 1. survival
  if (c.hunger > 72 && tryEat(w, c, rng)) return;
  if ((c.energy < 18 || (night && c.energy < 70 && rng.chance(0.5))) && startRest(w, c, rng)) return;
  // 2. keep following if commanded
  if (c.followId !== null && c.state === "follow") return;
  // 2b. evening bonfire: drift to the campfire and celebrate
  const bonfireUntil = w.flags[`bonfireUntil_${c.faction}`] as number | undefined;
  if (bonfireUntil && w.time < bonfireUntil && rng.chance(0.7)) {
    const cf = nearestDropoff(w, c.faction, c.islandId, c.x, c.z);
    if (cf && cf.type === "campfire") {
      const a = rng.range(0, Math.PI * 2);
      if (dist2(cf.x, cf.z, c.x, c.z) > 9) {
        if (goTo(w, c, cf.x + Math.cos(a) * 2.2, cf.z + Math.sin(a) * 2.2)) {
          setState(c, "wander");
          return;
        }
      } else {
        c.heading = Math.atan2(cf.x - c.x, cf.z - c.z);
        setState(c, "celebrate");
        return;
      }
    }
  }
  // 3. task (lazy creatures skip sometimes)
  if (!(c.traits.includes("lazy") && rng.chance(0.3)) && (!night || c.energy > 60)) {
    const t = pickTask(w, c);
    if (t) {
      assignTask(w, c, t);
      if (beginTask(w, c, t, rng)) return;
      unassignTask(w, c, true);
    }
  }
  // 4. social
  if (c.social < 45 || rng.chance(0.12)) {
    const buddy = creaturesNear(w, c.x, c.z, 7, c.islandId).find((o) => o.id !== c.id && (o.state === "idle" || o.state === "wander") && o.partnerId === null && o.faction === c.faction);
    if (buddy && goTo(w, c, buddy.x + 0.6, buddy.z + 0.4)) {
      c.partnerId = buddy.id;
      buddy.partnerId = c.id;
      buddy.path = null;
      setState(buddy, "idle");
      setState(c, "socialise");
      return;
    }
  }
  // 5. curiosity: wander toward a discovery / glowing thing
  if (c.traits.includes("curious") && rng.chance(0.25)) {
    const ds = Object.values(w.discoveries).filter((d) => d.islandId === c.islandId && dist2(d.x, d.z, c.x, c.z) < 15 * 15);
    if (ds.length && goTo(w, c, ds[0].x + rng.range(-2, 2), ds[0].z + rng.range(-2, 2))) {
      setState(c, "explore");
      return;
    }
  }
  // 6. wander near anchor
  const anchor = nearestDropoff(w, c.faction, c.islandId, c.x, c.z);
  const isl = islandById(w, c.islandId);
  const ax = anchor ? anchor.x : isl.spawnPoint.x;
  const az = anchor ? anchor.z : isl.spawnPoint.z;
  const r = c.traits.includes("curious") ? 12 : 6;
  for (let i = 0; i < 3; i++) {
    const tx = ax + rng.range(-r, r);
    const tz = az + rng.range(-r, r);
    if (isWalkable(isl, tx, tz) && goTo(w, c, tx, tz)) {
      setState(c, "wander");
      return;
    }
  }
  setState(c, "idle");
}

function beginTask(w: World, c: Creature, t: Task, rng: RNG): boolean {
  switch (t.kind) {
    case "gatherNode": {
      const n = t.nodeId !== undefined ? w.nodes[t.nodeId] : undefined;
      if (!n) return false;
      const spot = reachSpot(w, c.islandId, n.x, n.z);
      if (!spot || !goTo(w, c, spot.x, spot.z)) {
        markUnreachable(w, n.id);
        removeTask(w, t.id, false);
        c.taskId = null;
        return false;
      }
      setState(c, "gather");
      return true;
    }
    case "haulItem": {
      const it = t.itemId !== undefined ? w.items[t.itemId] : undefined;
      if (!it || !goTo(w, c, it.x, it.z)) return false;
      setState(c, "carry");
      return true;
    }
    case "deliverMaterial": {
      const d = nearestDropoff(w, c.faction, c.islandId, c.x, c.z);
      if (!d || !goTo(w, c, d.x, d.z)) return false;
      setState(c, "carry");
      return true;
    }
    case "construct": {
      const b = t.buildingId !== undefined ? w.buildings[t.buildingId] : undefined;
      if (!b) return false;
      const ang = rng.range(0, Math.PI * 2);
      const r = BUILDINGS[b.type].footprint + 0.5;
      if (!goTo(w, c, b.x + Math.cos(ang) * r, b.z + Math.sin(ang) * r)) return false;
      setState(c, "build");
      return true;
    }
    case "tendFarm": {
      const b = t.buildingId !== undefined ? w.buildings[t.buildingId] : undefined;
      if (!b) return false;
      const ang = rng.range(0, Math.PI * 2);
      if (!goTo(w, c, b.x + Math.cos(ang) * 2.4, b.z + Math.sin(ang) * 2.4)) return false;
      setState(c, "build");
      return true;
    }
    case "exploreSpot": {
      if (!goTo(w, c, t.x, t.z)) return false;
      setState(c, "explore");
      return true;
    }
  }
  return false;
}

function deliverCarried(w: World, c: Creature, t: Task | null) {
  const f = w.factions[c.faction];
  if (!c.carrying || !f) return;
  if (t && t.kind === "deliverMaterial" && t.buildingId !== undefined) {
    const b = w.buildings[t.buildingId];
    if (b && !b.complete) {
      b.delivered[c.carrying.type] = (b.delivered[c.carrying.type] ?? 0) + c.carrying.amount;
      effect(w, "dust", b.x, b.z, { ttl: 0.8 });
      c.carrying = null;
      return;
    }
    // building gone: return to stock
  }
  f.stock[c.carrying.type] += c.carrying.amount;
  f.stats.gathered += c.carrying.amount;
  if (c.faction === w.playerFaction) {
    w.stats.gathered += c.carrying.amount;
    w.flags.xpGather = ((w.flags.xpGather as number) ?? 0) + c.carrying.amount;
    if ((w.flags.xpGather as number) >= 10) {
      w.flags.xpGather = (w.flags.xpGather as number) - 10;
      addXp(w, 3, "gather");
    }
    if (w.stats.gathered >= 100) unlockAchievement(w, "wood_100");
  }
  gainSkill(w, c, "gathering", 1);
  c.carrying = null;
}

function finishGather(w: World, c: Creature, n: ResourceNode, rng: RNG) {
  const sp = SPECIES[c.species];
  const amt = Math.max(1, Math.floor(Math.min(n.amount, sp.carry + (c.scale > 1.5 ? 6 : 0))));
  n.amount = Math.max(0, n.amount - amt);
  c.carrying = { type: n.resource, amount: amt };
  n.reservedBy = null;
  if (n.resource === "wood") gainSkill(w, c, "woodcutting", 3);
  else gainSkill(w, c, "gathering", 2);
  if (n.amount <= 0) {
    if (n.kind === "tree") {
      n.kind = "stump";
      n.regrow = 0.4; // trees slowly regrow from stumps
      n.amount = 0;
      rebuildIslandNav(w, islandById(w, c.islandId));
    } else if (n.kind === "rock" || n.kind === "crystal") {
      delete w.nodes[n.id];
      rebuildIslandNav(w, islandById(w, c.islandId));
    }
  }
  if (c.traits.includes("clumsy") && rng.chance(0.15)) {
    const it = dropCarried(w, c, rng, 1.0);
    if (it) {
      effect(w, "dust", c.x, c.z, { ttl: 0.6 });
      if (rng.chance(0.3)) chronicle(w, `${c.name} dropped ${it.amount} ${it.type} and pretended it was intentional.`, "story", 1, { faction: c.faction });
    }
  }
}

function goDeliver(w: World, c: Creature, rng: RNG) {
  const t = currentTask(w, c);
  if (t && t.kind === "deliverMaterial" && t.buildingId !== undefined && w.buildings[t.buildingId]) {
    const b = w.buildings[t.buildingId];
    const ang = rng.range(0, Math.PI * 2);
    const r = BUILDINGS[b.type].footprint + 0.4;
    if (goTo(w, c, b.x + Math.cos(ang) * r, b.z + Math.sin(ang) * r)) {
      setState(c, "carry");
      return;
    }
  }
  const d = nearestDropoff(w, c.faction, c.islandId, c.x, c.z);
  if (d && goTo(w, c, d.x + rng.range(-0.8, 0.8), d.z + rng.range(-0.8, 0.8))) {
    setState(c, "carry");
    return;
  }
  // nowhere to deliver: drop it
  dropCarried(w, c, rng);
  if (t) removeTask(w, t.id, false);
  setState(c, "idle");
}

/** Main per-creature update. */
export function updateCreature(w: World, c: Creature, dt: number, rng: RNG) {
  c.age += dt;
  c.stateTime += dt;
  const sp = SPECIES[c.species];
  const isl = islandById(w, c.islandId);
  const night = isNight(w);

  // ── Needs ──
  const resting = c.state === "rest" || c.state === "eat";
  const working = c.state === "gather" || c.state === "build" || c.state === "carry" || c.state === "explore" || c.state === "raid";
  c.hunger = clamp(c.hunger + sp.hungerRate * dt * (resting ? 0.5 : 1) * (c.scale > 1.5 ? 2.5 : 1), 0, 100);
  if (working) c.energy = clamp(c.energy - sp.energyRate * dt * (night ? 1.5 : 1) * (c.traits.includes("hardworking") ? 0.8 : 1), 0, 100);
  else if (c.state === "rest") {
    const home = c.homeId !== null ? w.buildings[c.homeId] : null;
    const atHome = home && dist2(home.x, home.z, c.x, c.z) < 6;
    c.energy = clamp(c.energy + (atHome ? 9 : 4.5) * dt, 0, 100);
  } else if (c.state === "idle" || c.state === "socialise") c.energy = clamp(c.energy + 1.2 * dt, 0, 100);
  c.social = clamp(c.social - 0.35 * dt + (c.state === "socialise" ? 9 * dt : 0), 0, 100);
  if (c.hunger >= 100) c.health = clamp(c.health - 1.5 * dt, 0, 100);
  else if (c.health < 100) c.health = clamp(c.health + (c.state === "rest" ? 2 : 0.5) * dt, 0, 100);

  let target = 72 - c.hunger * 0.3 - (100 - c.energy) * 0.15 - (100 - c.social) * 0.12;
  if (working) target += 8; // busy hands are happy hands
  if (w.time < c.blessedUntil) target += 25;
  if (c.homeId !== null) target += 6;
  for (const m of c.memory) {
    const age = w.time - m.t;
    if (age > 90) continue;
    const k = (1 - age / 90) * m.weight;
    if (m.kind === "thrown" || m.kind === "stolen_from" || m.kind === "struck" || m.kind === "pranked") target -= 12 * k;
    if (m.kind === "helped" || m.kind === "celebrated" || m.kind === "found" || m.kind === "blessed") target += 8 * k;
  }
  c.happiness = clamp(c.happiness + (clamp(target, 0, 100) - c.happiness) * Math.min(1, dt * 0.15), 0, 100);
  const scared = c.memory.some((m) => (m.kind === "struck" || m.kind === "thrown") && w.time - m.t < 12);
  c.mood = scared ? "scared" : c.happiness > 65 ? "happy" : c.happiness < 35 ? "grumpy" : "neutral";
  if (c.memory.length && c.memory[0].t < w.time - 400) c.memory.shift();

  if (c.state === "aboard") return; // flying in a skiff (see skiffs.ts)
  // ── Physics / vertical position (c.y is the absolute world height of the creature's feet) ──
  const groundH = Math.max(heightAt(isl, c.x, c.z), isl.waterLevel);
  if (c.state === "held") {
    c.y = groundH + 1.6 + Math.sin(w.time * 4) * 0.08;
    return;
  }
  if (c.state === "thrown") {
    updateThrown(w, c, dt, rng);
    return;
  }
  if (c.y > groundH + 0.02) {
    c.vy -= GRAVITY * dt;
    c.y += c.vy * dt;
    if (c.y <= groundH) {
      c.y = groundH;
      c.vy = 0;
    }
  } else {
    c.y = groundH;
    c.vy = 0;
  }
  if (c.state === "swim") {
    // paddle to nearest walkable cell
    if (c.path) {
      moveAlong(w, c, dt, rng);
      if (!c.path) setState(c, "recover");
    } else setState(c, "recover");
    if (c.stateTime > 12) setState(c, "recover");
    return;
  }
  if (c.state === "recover") {
    if (c.stateTime > (c.health < 10 ? 10 : 1.6)) {
      setState(c, "idle");
      c.decisionCooldown = 0.2;
    }
    return;
  }
  if (c.health <= 0) {
    interrupt(w, c, rng, true);
    setState(c, "recover");
    c.health = 25;
    c.hunger = Math.min(c.hunger, 90);
    chronicle(w, `${c.name} fainted from hunger. Someone feed them.`, "story", 2, { faction: c.faction });
    return;
  }

  // ── Fear: flee from recent threats ──
  if (c.state !== "flee") {
    const threat = c.memory.find((m) => m.kind === "threat" && w.time - m.t < 1.5 && m.x !== undefined);
    if (threat && !(c.traits.includes("brave") && rng.chance(0.7))) {
      interrupt(w, c, rng, false);
      const dx = c.x - threat.x!;
      const dz = c.z - threat.z!;
      const d = Math.hypot(dx, dz) || 1;
      const tx = c.x + (dx / d) * 5;
      const tz = c.z + (dz / d) * 5;
      if (isWalkable(isl, tx, tz) && goTo(w, c, tx, tz)) setState(c, "flee");
      else setState(c, "flee");
      c.memory = c.memory.filter((m) => m.kind !== "threat");
    }
  }

  c.decisionCooldown -= dt;
  const t = currentTask(w, c);

  // Survival overrides work: a starving or exhausted creature drops what it is doing.
  if (c.decisionCooldown <= 0 && (c.state === "gather" || c.state === "carry" || c.state === "build" || c.state === "explore" || c.state === "wander" || c.state === "follow")) {
    if (c.hunger > 82 && !(c.state === "carry" && c.carrying?.type === "food")) {
      const f = w.factions[c.faction];
      const canEat = (f && f.stock.food > 0 && nearestDropoff(w, c.faction, c.islandId, c.x, c.z)) || nearestNode(w, c.islandId, c.x, c.z, (n) => n.resource === "food" && n.kind !== "crop" && n.amount >= 1, 50);
      if (canEat) {
        interrupt(w, c, rng, false);
        if (c.carrying) {
          // keep what we carry: deliver it after eating (dropCarried would litter the island)
        }
        if (tryEat(w, c, rng)) return;
      }
      c.decisionCooldown = 3;
    } else if (c.energy < 8 && c.state !== "carry") {
      interrupt(w, c, rng, false);
      if (startRest(w, c, rng)) return;
    }
  }

  switch (c.state) {
    case "idle": {
      if (c.decisionCooldown <= 0) decide(w, c, rng);
      break;
    }
    case "wander": {
      if (moveAlong(w, c, dt, rng) || c.stateTime > 14) {
        setState(c, "idle");
        c.decisionCooldown = rng.range(0.5, 2.5);
      } else if (c.decisionCooldown <= 0 && (c.hunger > 72 || c.energy < 18)) decide(w, c, rng);
      break;
    }
    case "seekFood": {
      if (moveAlong(w, c, dt, rng)) {
        const f = w.factions[c.faction];
        const drop = nearestDropoff(w, c.faction, c.islandId, c.x, c.z);
        if (f && drop && dist2(drop.x, drop.z, c.x, c.z) < 9 && f.stock.food > 0) {
          f.stock.food -= 1;
          c.hunger = clamp(c.hunger - 45, 0, 100);
          setState(c, "eat");
        } else {
          const node = nearestNode(w, c.islandId, c.x, c.z, (n) => n.resource === "food" && n.kind !== "crop" && n.amount >= 1, 3);
          if (node) {
            node.amount = Math.max(0, node.amount - 1);
            c.hunger = clamp(c.hunger - 35, 0, 100);
            setState(c, "eat");
          } else {
            setState(c, "idle");
            c.decisionCooldown = 2;
            if (c.hunger > 90 && rng.chance(0.2) && c.faction === w.playerFaction) {
              chronicle(w, `${c.name} is starving and there's nothing to eat.`, "story", 2, { faction: c.faction });
            }
          }
        }
        c.followId = null;
      } else if (c.stateTime > 25) setState(c, "idle");
      break;
    }
    case "eat": {
      if (c.stateTime > 2.2) {
        setState(c, "idle");
        c.decisionCooldown = 0.3;
      }
      break;
    }
    case "rest": {
      if (c.path) moveAlong(w, c, dt, rng);
      else if (c.stateTime > 1 && rng.chance(dt * 0.4)) effect(w, "zzz", c.x, c.z, { ttl: 1.5, y: 0.9 * c.scale });
      if (c.energy > 95 || (!night && c.energy > 60 && c.stateTime > 10) || c.hunger > 90) {
        setState(c, "idle");
        c.decisionCooldown = 0.5;
      }
      break;
    }
    case "gather": {
      const n = t && t.nodeId !== undefined ? w.nodes[t.nodeId] : undefined;
      if (!t || !n || n.amount <= 0) {
        unassignTask(w, c, false);
        setState(c, "idle");
        break;
      }
      if (c.path) {
        if (moveAlong(w, c, dt, rng)) c.stateTime = 0;
        break;
      }
      if (dist2(c.x, c.z, n.x, n.z) > 3.2) {
        // arrived at the end of the path but still not adjacent: the node is boxed in
        markUnreachable(w, n.id);
        removeTask(w, t.id, false);
        c.taskId = null;
        setState(c, "idle");
        break;
      }
      c.heading = Math.atan2(n.x - c.x, n.z - c.z);
      // work
      const mul = (sp.gatherMul[n.resource] ?? 1) * skillEfficiency(n.resource === "wood" ? c.skills.woodcutting : c.skills.gathering) * workMul(w, c);
      const lumberBonus = n.resource === "wood" && nearestBuilding(w, n.x, n.z, 10, (b) => b.type === "lumber" && b.complete && b.faction === c.faction) ? 1.35 : 1;
      const need = 3.4 / (mul * lumberBonus);
      if (c.stateTime >= need) {
        finishGather(w, c, n, rng);
        removeTask(w, t.id, false);
        c.taskId = null;
        if (c.carrying) goDeliver(w, c, rng);
        else setState(c, "idle");
      }
      break;
    }
    case "carry": {
      if (moveAlong(w, c, dt, rng)) {
        if (t && t.kind === "haulItem") {
          const it = t.itemId !== undefined ? w.items[t.itemId] : undefined;
          if (it && !c.carrying) {
            c.carrying = { type: it.type, amount: it.amount };
            delete w.items[it.id];
            removeTask(w, t.id, false);
            c.taskId = null;
            goDeliver(w, c, rng);
          } else {
            removeTask(w, t.id, false);
            c.taskId = null;
            if (c.carrying) goDeliver(w, c, rng);
            else setState(c, "idle");
          }
        } else if (t && t.kind === "deliverMaterial" && !c.carrying) {
          // at stockpile: pick up the reserved material
          c.carrying = { type: t.resource!, amount: t.amount! };
          goDeliver(w, c, rng);
        } else {
          deliverCarried(w, c, t);
          if (t) removeTask(w, t.id, false);
          c.taskId = null;
          setState(c, "idle");
          c.decisionCooldown = 0.2;
        }
      } else if (!c.path) {
        // no path and not arrived: try again
        if (c.carrying) goDeliver(w, c, rng);
        else {
          unassignTask(w, c, true);
          setState(c, "idle");
        }
      }
      break;
    }
    case "build": {
      const b = t && t.buildingId !== undefined ? w.buildings[t.buildingId] : undefined;
      if (!t || !b) {
        unassignTask(w, c, false);
        setState(c, "idle");
        break;
      }
      if (c.path) {
        if (moveAlong(w, c, dt, rng)) c.stateTime = 0;
        break;
      }
      c.heading = Math.atan2(b.x - c.x, b.z - c.z);
      if (t.kind === "construct") {
        if (b.complete || !materialsDelivered(b)) {
          removeTask(w, t.id, false);
          c.taskId = null;
          setState(c, "idle");
          break;
        }
        const workshop = buildingsOf(w, c.faction, "workshop").some((ws) => ws.complete && ws.islandId === c.islandId) ? 1.4 : 1;
        const rate = sp.buildMul * skillEfficiency(c.skills.construction) * workMul(w, c) * workshop;
        b.workDone += rate * dt;
        b.progress = Math.min(1, b.workDone / b.work);
        if (rng.chance(dt * 1.5)) effect(w, "dust", b.x + rng.range(-1, 1), b.z + rng.range(-1, 1), { ttl: 0.5, size: 0.4 });
        if (rng.chance(dt * 0.5)) gainSkill(w, c, "construction", 1);
        if (b.progress >= 1) completeBuilding(w, b, c, rng);
      } else if (t.kind === "tendFarm") {
        if (b.cropTimer >= 1) {
          // harvest
          b.cropTimer = 0;
          c.carrying = { type: "food", amount: 4 + Math.floor(skillLevel(c.skills.farming) / 2) };
          gainSkill(w, c, "farming", 4);
          removeTask(w, t.id, false);
          c.taskId = null;
          effect(w, "sparkle", b.x, b.z, { ttl: 1, color: "#ffd166" });
          goDeliver(w, c, rng);
        } else {
          b.cropTimer = Math.min(1, b.cropTimer + 0.02 * sp.farmMul * skillEfficiency(c.skills.farming) * workMul(w, c) * dt);
          if (rng.chance(dt * 0.3)) gainSkill(w, c, "farming", 1);
          if (c.stateTime > 25 && b.cropTimer < 1) {
            // take a break; the task stays open
            unassignTask(w, c, false);
            setState(c, "idle");
          }
        }
      }
      break;
    }
    case "explore": {
      const arrived = moveAlong(w, c, dt, rng);
      // check discoveries along the way
      for (const id in w.discoveries) {
        const d = w.discoveries[id];
        if (d.found || d.islandId !== c.islandId) continue;
        if (dist2(d.x, d.z, c.x, c.z) < 2.6 * 2.6) {
          d.found = true;
          d.foundBy = c.id;
          const f = w.factions[c.faction];
          if (f) f.essence += d.essence;
          if (c.faction === w.playerFaction) {
            w.stats.discoveries++;
            unlockAchievement(w, "discovery");
            addXp(w, 15, "discovery");
            effect(w, "text", d.x, d.z, { text: "Discovered!", color: "#c7a6ff", ttl: 2, y: 1.6 });
          }
          gainSkill(w, c, "exploration", 8);
          remember(c, "found", 1, undefined, d.x, d.z, w.time);
          effect(w, "sparkle", d.x, d.z, { ttl: 3, color: "#b388ff", size: 2 });
          chronicle(w, `${c.name} discovered ${d.name}! (+${d.essence} essence)`, "discovery", 3, { faction: c.faction, x: d.x, z: d.z, islandId: c.islandId });
          setState(c, "celebrate");
          if (t) removeTask(w, t.id, false);
          c.taskId = null;
          return;
        }
      }
      if (arrived || c.stateTime > 40) {
        if (t) {
          removeTask(w, t.id, false);
          c.taskId = null;
          gainSkill(w, c, "exploration", 2);
        }
        setState(c, "idle");
      }
      break;
    }
    case "socialise": {
      const p = c.partnerId !== null ? w.creatures[c.partnerId] : undefined;
      if (!p || p.state === "held" || p.state === "thrown" || dist2(p.x, p.z, c.x, c.z) > 36) {
        c.partnerId = null;
        setState(c, "idle");
        break;
      }
      if (c.path) {
        moveAlong(w, c, dt, rng);
        break;
      }
      c.heading = Math.atan2(p.x - c.x, p.z - c.z);
      p.heading = Math.atan2(c.x - p.x, c.z - p.z);
      if (c.stateTime > 3.5) {
        socialOutcome(w, c, p, rng);
        c.partnerId = null;
        p.partnerId = null;
        setState(c, "idle");
        setState(p, "idle");
        c.decisionCooldown = 1;
        p.decisionCooldown = 1;
      }
      break;
    }
    case "flee": {
      if (c.path) moveAlong(w, c, dt, rng);
      if (c.stateTime > 2.5 || !c.path) {
        setState(c, "idle");
        c.decisionCooldown = 0.5;
      }
      break;
    }
    case "fight": {
      const p = c.partnerId !== null ? w.creatures[c.partnerId] : undefined;
      if (!p || c.stateTime > 3) {
        if (p) {
          relation(c, p.id, -8);
          c.health = clamp(c.health - 8, 1, 100);
        }
        c.partnerId = null;
        setState(c, "recover");
        break;
      }
      c.heading = Math.atan2(p.x - c.x, p.z - c.z);
      if (rng.chance(dt * 2)) effect(w, "anger", c.x, c.z, { ttl: 0.8, y: 1 });
      break;
    }
    case "follow": {
      const tgt = c.followId !== null ? w.creatures[c.followId] : undefined;
      if (!tgt) {
        c.followId = null;
        setState(c, "idle");
        break;
      }
      if (dist2(tgt.x, tgt.z, c.x, c.z) > 4) {
        if (!c.path || c.stateTime % 1 < dt) goTo(w, c, tgt.x, tgt.z);
        moveAlong(w, c, dt, rng);
      } else {
        c.path = null;
        c.heading = Math.atan2(tgt.x - c.x, tgt.z - c.z);
      }
      if (c.hunger > 85 && c.decisionCooldown <= 0) decide(w, c, rng);
      break;
    }
    case "celebrate": {
      if (c.stateTime > 2.5) {
        setState(c, "idle");
        c.decisionCooldown = 0.3;
      }
      break;
    }
    case "raid": {
      updateRaider(w, c, dt, rng);
      break;
    }
    default:
      setState(c, "idle");
  }
}

function socialOutcome(w: World, a: Creature, b: Creature, rng: RNG) {
  const rel = a.relationships[b.id] ?? 0;
  // Theft
  if (a.traits.includes("greedy") && b.carrying && b.carrying.type === "food" && rng.chance(0.5)) {
    const amt = b.carrying.amount;
    a.carrying = a.carrying ? { type: a.carrying.type, amount: a.carrying.amount } : { type: "food", amount: amt };
    if (!a.carrying || a.carrying.type !== "food") a.carrying = { type: "food", amount: amt };
    else a.carrying.amount = amt;
    b.carrying = null;
    relation(b, a.id, -25);
    relation(a, b.id, -5);
    remember(b, "stolen_from", 1, a.id, undefined, undefined, w.time);
    effect(w, "anger", b.x, b.z, { ttl: 1.2, y: 1 });
    chronicle(w, `${a.name} stole ${amt} food from ${b.name}. ${b.name} will remember this.`, "social", 2, { faction: a.faction, x: a.x, z: a.z, islandId: a.islandId });
    const f = w.factions[a.faction];
    if (f) f.stats.stolen += amt;
    b.decisionCooldown = 0;
    return;
  }
  // Prank
  if (a.traits.includes("mischievous") && rng.chance(0.35)) {
    relation(b, a.id, -10);
    relation(a, b.id, 4);
    remember(b, "pranked", 0.6, a.id, undefined, undefined, w.time);
    effect(w, "anger", b.x, b.z, { ttl: 1, y: 1 });
    if (b.carrying && rng.chance(0.5)) {
      dropCarried(w, b, rng);
      chronicle(w, `${a.name} tripped ${b.name}, who dropped everything.`, "social", 1, { faction: a.faction, x: a.x, z: a.z, islandId: a.islandId });
    }
    return;
  }
  // Grudge fight
  if (rel < -40 && (a.traits.includes("brave") || b.traits.includes("brave") || rng.chance(0.3))) {
    setState(a, "fight");
    setState(b, "fight");
    a.partnerId = b.id;
    b.partnerId = a.id;
    chronicle(w, `${a.name} and ${b.name} came to blows over an old grudge.`, "social", 2, { faction: a.faction, x: a.x, z: a.z, islandId: a.islandId });
    return;
  }
  // Friendly chat
  const d = rng.range(3, 9) + (a.traits.includes("loyal") ? 3 : 0);
  relation(a, b.id, d);
  relation(b, a.id, d);
  effect(w, "heart", (a.x + b.x) / 2, (a.z + b.z) / 2, { ttl: 1.2, y: 1 });
  const nr = a.relationships[b.id];
  if (nr >= 70 && rel < 70) {
    chronicle(w, `${a.name} and ${b.name} are now best mates.`, "social", 2, { faction: a.faction, x: a.x, z: a.z, islandId: a.islandId });
    if (a.faction === w.playerFaction) unlockAchievement(w, "friendship");
  }
  if (nr <= -60 && rel > -60 && a.faction === w.playerFaction) unlockAchievement(w, "rivalry");
}

export function completeBuilding(w: World, b: Building, by: Creature | null, rng: RNG) {
  b.complete = true;
  b.progress = 1;
  const f = w.factions[b.faction];
  if (f) {
    f.stats.built++;
    f.score += BUILDINGS[b.type].work;
  }
  if (b.faction === w.playerFaction) {
    w.stats.built++;
    addXp(w, 10 + Math.round(BUILDINGS[b.type].work), "building");
    unlockAchievement(w, "first_building");
    if (b.type === "house") unlockAchievement(w, "first_house");
    if (b.type === "workshop") unlockAchievement(w, "first_workshop");
    if (b.type === "monument") {
      unlockAchievement(w, "ascended");
      w.flags.ascendedAt = w.time;
      effect(w, "bless", b.x, b.z, { ttl: 4, size: 8 });
      chronicle(w, `The Sky Monument is complete. The archipelago acknowledges its Little Tyrant.`, "milestone", 3, { faction: b.faction, x: b.x, z: b.z, islandId: b.islandId });
    }
  }
  effect(w, "sparkle", b.x, b.z, { ttl: 2.5, size: 2, color: "#ffe08a" });
  const who = by ? ` ${by.name} laid the last stone.` : "";
  const firstOfType = !Object.values(w.buildings).some((o) => o.id !== b.id && o.faction === b.faction && o.type === b.type && o.complete);
  const imp: 1 | 2 | 3 = b.faction === w.playerFaction ? 2 : firstOfType && (b.type === "workshop" || b.type === "monument") ? 3 : firstOfType ? 2 : 1;
  chronicle(w, `${f ? f.name : "Someone"} completed a ${BUILDINGS[b.type].name}.${who}`, "build", imp, { faction: b.faction, x: b.x, z: b.z, islandId: b.islandId });
  // nearby creatures celebrate
  for (const c of creaturesNear(w, b.x, b.z, 7, b.islandId)) {
    if (c.faction !== b.faction || c.state === "held" || c.state === "thrown") continue;
    if (c.state === "idle" || c.state === "wander" || c.state === "build") {
      interrupt(w, c, rng, false);
      setState(c, "celebrate");
      remember(c, "celebrated", 0.6, undefined, undefined, undefined, w.time);
    }
  }
  if (by) gainSkill(w, by, "construction", 6);
}

function updateThrown(w: World, c: Creature, dt: number, rng: RNG) {
  c.vy -= GRAVITY * dt;
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  c.y += c.vy * dt;
  c.heading += dt * 9;
  // which island are we over?
  let isl = islandById(w, c.islandId);
  if (isVoidAt(isl, c.x, c.z)) {
    const other = w.islands.find((i) => !isVoidAt(i, c.x, c.z));
    if (other) {
      isl = other;
      c.islandId = other.id;
    }
  }
  const ground = heightAt(isl, c.x, c.z);
  const water = ground > -0.5 && ground < isl.waterLevel;
  const surface = water ? isl.waterLevel : ground;
  if (ground < -0.5) {
    // over the void: keep falling until well below the island, then the winds return them
    if (c.y < -6) {
      c.vx = 0;
      c.vz = 0;
      fellOff(w, c, rng);
    }
    return;
  }
  if (c.y <= surface) {
    c.y = surface;
    c.vy = 0;
    const speed = Math.hypot(c.vx, c.vz);
    c.vx = 0;
    c.vz = 0;
    if (water) {
      effect(w, "splash", c.x, c.z, { ttl: 1.4, size: 1 + speed * 0.05 });
      effect(w, "text", c.x, c.z, { text: "SPLASH!", color: "#bfe6ff", ttl: 1.4, y: 1.2 });
      if (c.raidTarget && c.carrying) {
        dropCarried(w, c, rng, 1.5);
        chronicle(w, `${c.name}'s raid ended in the lake. The loot floated back to shore.`, "rival", 3, { x: c.x, z: c.z, islandId: c.islandId });
        unlockAchievement(w, "raid_foiled");
        c.raidTarget = { factionId: c.raidTarget.factionId, phase: "return" };
      }
      if (w.flags.lastThrower === 1) unlockAchievement(w, "lake_throw");
      const cell = nearestWalkableCell(isl, c.x, c.z, 8);
      if (cell !== null) goTo(w, c, isl.ox + (cell % isl.size) + 0.5, isl.oz + Math.floor(cell / isl.size) + 0.5);
      setState(c, "swim");
      if (rng.chance(0.4)) chronicle(w, `${c.name} went for an involuntary swim.`, "power", 1, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
    } else {
      effect(w, "dust", c.x, c.z, { ttl: 0.8, size: 1 });
      if (speed > 5) effect(w, "text", c.x, c.z, { text: speed > 11 ? "OOF!" : "oof", color: "#ffd9c0", ttl: 1.2, y: 1.2 });
      // land on a walkable cell
      if (!isWalkable(isl, c.x, c.z)) {
        const cell = nearestWalkableCell(isl, c.x, c.z, 6);
        if (cell !== null) {
          c.x = isl.ox + (cell % isl.size) + 0.5;
          c.z = isl.oz + Math.floor(cell / isl.size) + 0.5;
        }
      }
      // bowling: whoever we land on is launched too (and may hit the next one)
      const launchDir = { x: c.vx, z: c.vz };
      let strikes = 0;
      for (const o of creaturesNear(w, c.x, c.z, 1.1 * Math.max(1, c.scale), c.islandId)) {
        if (o.id === c.id || o.state === "held" || o.state === "thrown" || o.state === "aboard") continue;
        interrupt(w, o, rng, true);
        relation(o, c.id, -6);
        remember(o, "threat", 0.5, c.id, c.x, c.z, w.time);
        const dx = o.x - c.x;
        const dz = o.z - c.z;
        const d = Math.hypot(dx, dz) || 0.3;
        const push = Math.max(4, speed * 0.7);
        o.vx = (dx / d) * push * 0.5 + launchDir.x * 0.35;
        o.vz = (dz / d) * push * 0.5 + launchDir.z * 0.35;
        o.vy = 4.5 + Math.min(4, speed * 0.2);
        o.y += 0.05;
        setState(o, "thrown");
        o.health = clamp(o.health - 6, 1, 100);
        strikes++;
        if (rng.chance(0.4)) chronicle(w, `${c.name} bowled straight into ${o.name}.`, "power", 1, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
      }
      if (strikes > 0) {
        const chain = ((w.flags.bowlChain as number) ?? 0) + strikes;
        w.flags.bowlChain = chain;
        w.flags.bowlChainAt = w.time;
        effect(w, "text", c.x, c.z, { text: chain >= 3 ? `STRIKE ×${chain}!` : "STRIKE!", color: "#ffd166", ttl: 1.4, y: 1.6 });
        addMayhem(w, strikes * 2, c.x, c.z);
        addXp(w, strikes * 3, "bowling");
        if (chain >= 4 && !w.flags[`bowl4_${Math.floor(w.time)}`]) {
          w.flags[`bowl4_${Math.floor(w.time)}`] = 1;
          chronicle(w, `A four-creature pile-up. ${c.name} started it; nobody has finished it.`, "power", 2, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
        }
      }
      const tree = nearestNode(w, c.islandId, c.x, c.z, (n) => n.kind === "tree" && n.amount > 0, 1.2);
      if (tree && speed > 6) {
        tree.amount = Math.max(0, tree.amount - 1);
        const it: GroundItem = { id: w.nextId++, type: "wood", amount: 1, islandId: c.islandId, x: tree.x + rng.range(-0.8, 0.8), z: tree.z + rng.range(-0.8, 0.8), y: c.y + 1.5, vx: 0, vz: 0, vy: 1, reservedBy: null };
        w.items[it.id] = it;
      }
      c.health = clamp(c.health - Math.min(20, speed * 1.2), 1, 100);
      setState(c, "recover");
    }
    // scare the neighbours
    for (const o of creaturesNear(w, c.x, c.z, 4, c.islandId)) {
      if (o.id !== c.id && (o.state === "idle" || o.state === "wander" || o.state === "socialise")) remember(o, "threat", 0.4, c.id, c.x, c.z, w.time);
    }
  }
}

function fellOff(w: World, c: Creature, rng: RNG) {
  const isl = islandById(w, c.faction === w.playerFaction ? w.factions[c.faction].homeIslandId : c.islandId);
  c.islandId = isl.id;
  // "returned by the winds" at a random coastal walkable cell
  const n = isl.size;
  const candidates: number[] = [];
  for (let i = 0; i < n * n; i++) if (isl.blocked[i] === 0) candidates.push(i);
  const cell = candidates.length ? candidates[rng.int(0, candidates.length - 1)] : null;
  if (cell !== null) {
    c.x = isl.ox + (cell % n) + 0.5;
    c.z = isl.oz + Math.floor(cell / n) + 0.5;
  } else {
    c.x = isl.spawnPoint.x;
    c.z = isl.spawnPoint.z;
  }
  c.y = Math.max(heightAt(isl, c.x, c.z), isl.waterLevel) + 6;
  c.vy = 0;
  effect(w, "fall", c.x, c.z, { ttl: 2 });
  setState(c, "recover");
  remember(c, "thrown", 1, undefined, undefined, undefined, w.time);
  chronicle(w, `${c.name} was thrown off the edge of the world and returned, confused, on a passing cloud.`, "power", 2, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
}

function updateRaider(w: World, c: Creature, dt: number, rng: RNG) {
  const r = c.raidTarget;
  if (!r) {
    setState(c, "idle");
    return;
  }
  const isl = islandById(w, c.islandId);
  if (r.phase === "go") {
    if (!c.path) {
      const target = nearestDropoff(w, r.factionId, c.islandId, c.x, c.z);
      if (!target || !goTo(w, c, target.x + 0.8, target.z)) {
        r.phase = "return";
        return;
      }
    }
    if (moveAlong(w, c, dt, rng)) {
      const vf = w.factions[r.factionId];
      const amt = vf ? Math.min(6, vf.stock.food) : 0;
      if (vf && amt > 0) {
        vf.stock.food -= amt;
        c.carrying = { type: "food", amount: amt };
        const hf = w.factions[c.faction];
        if (hf) hf.stats.stolen += amt;
        const mine = r.factionId === w.playerFaction;
        chronicle(w, mine ? `${c.name} snatched ${amt} food from your stores and legged it!` : `${c.name} snatched ${amt} food from ${vf.name}'s stores!`, "rival", mine ? 3 : 2, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
        if (!mine) effect(w, "text", c.x, c.z, { text: "Got it!", color: "#ffe08a", ttl: 1.5, y: 1.4 });
        effect(w, "anger", c.x, c.z, { ttl: 1.5, y: 1.2 });
      } else chronicle(w, `${c.name} came to raid ${r.factionId === w.playerFaction ? "your" : (vf?.name ?? "the") + "'s"} stores but found them empty. Awkward.`, "rival", 2, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
      r.phase = "return";
      c.path = null;
    }
  } else {
    const homeIsland = c.raidTarget?.homeIslandId ?? w.factions[c.faction]?.homeIslandId ?? c.islandId;
    if (!c.path) {
      const home = islandById(w, homeIsland);
      const rim = rimTowards(isl, home.center);
      if (!goTo(w, c, rim.x, rim.z)) {
        boardSkiff(w, [c], homeIsland, "home", rng);
        return;
      }
    }
    if (moveAlong(w, c, dt, rng) || c.stateTime > 90) boardSkiff(w, [c], homeIsland, "home", rng);
  }
}

/** Items on the ground: simple gravity and settle. it.y is absolute world height. */
export function updateItem(w: World, it: GroundItem, dt: number) {
  const isl = islandById(w, it.islandId);
  const ground = Math.max(heightAt(isl, it.x, it.z), isl.waterLevel);
  if (it.y > ground + 0.01 || it.vy !== 0) {
    it.vy -= GRAVITY * dt;
    it.x += it.vx * dt;
    it.z += it.vz * dt;
    it.y += it.vy * dt;
    if (isVoidAt(isl, it.x, it.z)) {
      if (it.y < -6) delete w.items[it.id];
      return;
    }
    const g = Math.max(heightAt(isl, it.x, it.z), isl.waterLevel);
    if (it.y <= g) {
      it.y = g;
      it.vy = 0;
      it.vx = 0;
      it.vz = 0;
      if (!isWalkable(isl, it.x, it.z)) {
        const cell = nearestWalkableCell(isl, it.x, it.z, 4);
        if (cell !== null) {
          it.x = isl.ox + (cell % isl.size) + 0.5;
          it.z = isl.oz + Math.floor(cell / isl.size) + 0.5;
          it.y = Math.max(heightAt(isl, it.x, it.z), isl.waterLevel);
        } else delete w.items[it.id];
      }
    }
  }
}

export function isWaterCell(w: World, islandId: number, x: number, z: number) {
  return isWaterAt(islandById(w, islandId), x, z);
}
export { cellOf };
