import type { Projectile, ResourceNode, World } from "./types";
import type { RNG } from "./rng";
import { heightAt, isVoidAt } from "./terrain";
import { islandById, creaturesNear } from "./query";
import { nearestWalkableCell, isWalkable } from "./nav";
import { rebuildIslandNav } from "./world";
import { chronicle, effect } from "./chronicle";
import { interrupt, remember, relation } from "./creature";
import { removeTask } from "./tasks";
import { unlockAchievement, addXp } from "./progression";
import { noteAIEvent } from "./overlords";
import { addMayhem, damageBuilding } from "./mayhem";
import { buildingsNear } from "./powers";

const GRAVITY = 14;

/** Uproot a tree / lift a rock: the node becomes a held projectile. */
export function grabNode(w: World, n: ResourceNode, rng: RNG): Projectile | null {
  if (n.kind !== "tree" && n.kind !== "rock" && n.kind !== "crystal") return null;
  if (Object.keys(w.projectiles).length >= 12) return null;
  for (const id in w.tasks) if (w.tasks[id].nodeId === n.id) removeTask(w, Number(id), false);
  if (n.reservedBy !== null) {
    const c = w.creatures[n.reservedBy];
    if (c) interrupt(w, c, rng, false);
  }
  const isl = islandById(w, n.islandId);
  const p: Projectile = {
    id: w.nextId++, kind: n.kind, islandId: n.islandId, x: n.x, y: Math.max(heightAt(isl, n.x, n.z), isl.waterLevel) + 1.6, z: n.z,
    vx: 0, vy: 0, vz: 0, held: true, scale: n.scale, variant: n.variant, resource: n.resource, amount: Math.max(1, Math.round(n.amount)), spin: 0,
  };
  w.projectiles[p.id] = p;
  delete w.nodes[n.id];
  rebuildIslandNav(w, isl);
  effect(w, "dust", n.x, n.z, { ttl: 0.8, size: 1.4 });
  for (const c of creaturesNear(w, n.x, n.z, 4, n.islandId)) remember(c, "threat", 0.5, undefined, n.x, n.z, w.time);
  return p;
}

export function updateProjectiles(w: World, dt: number, rng: RNG) {
  for (const id in w.projectiles) {
    const p = w.projectiles[id];
    if (!p) continue;
    let isl = islandById(w, p.islandId);
    if (p.held) {
      const g = Math.max(heightAt(isl, p.x, p.z), isl.waterLevel);
      p.y += ((g > -0.5 ? g : 0) + 1.8 + Math.sin(w.time * 3) * 0.1 - p.y) * Math.min(1, dt * 8);
      p.spin = Math.sin(w.time * 2) * 0.15;
      continue;
    }
    p.vy -= GRAVITY * dt;
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.y += p.vy * dt;
    p.spin += dt * 6;
    if (isVoidAt(isl, p.x, p.z)) {
      const other = w.islands.find((i) => !isVoidAt(i, p.x, p.z));
      if (other) {
        isl = other;
        p.islandId = other.id;
      }
    }
    const ground = heightAt(isl, p.x, p.z);
    if (ground < -0.5) {
      if (p.y < -8) {
        delete w.projectiles[p.id];
        chronicle(w, `A ${p.kind} tumbled off the edge of the world into the clouds. Oops.`, "power", 1, { x: p.x, z: p.z, islandId: p.islandId });
      }
      continue;
    }
    const water = ground < isl.waterLevel;
    const surface = water ? isl.waterLevel : ground;
    if (p.y <= surface) land(w, p, isl, water, rng);
  }
}

function land(w: World, p: Projectile, isl: World["islands"][number], water: boolean, rng: RNG) {
  const speed = Math.hypot(p.vx, p.vz, p.vy);
  delete w.projectiles[p.id];
  if (water) effect(w, "splash", p.x, p.z, { ttl: 1.6, size: 1.6 });
  else {
    effect(w, "crash", p.x, p.z, { ttl: 1.2, size: 1.2 + speed * 0.05 });
    effect(w, "text", p.x, p.z, { text: p.kind === "tree" ? "TIMBER!" : "CRUNCH!", color: "#ffe08a", ttl: 1.6, y: 1.5 });
  }
  // shatter into loose resources
  const pieces = Math.min(6, Math.max(2, Math.round(p.amount / 2)));
  let remaining = p.amount;
  for (let i = 0; i < pieces && remaining > 0; i++) {
    const amt = i === pieces - 1 ? remaining : Math.max(1, Math.round(p.amount / pieces));
    remaining -= amt;
    const a = rng.range(0, Math.PI * 2);
    let x = p.x + Math.cos(a) * rng.range(0.4, 1.6);
    let z = p.z + Math.sin(a) * rng.range(0.4, 1.6);
    if (!isWalkable(isl, x, z)) {
      const cell = nearestWalkableCell(isl, x, z, 4);
      if (cell === null) continue;
      x = isl.ox + (cell % isl.size) + 0.5;
      z = isl.oz + Math.floor(cell / isl.size) + 0.5;
    }
    const id = w.nextId++;
    w.items[id] = { id, type: p.resource, amount: amt, islandId: isl.id, x, z, y: Math.max(heightAt(isl, x, z), isl.waterLevel) + 0.8, vx: Math.cos(a) * 1.5, vz: Math.sin(a) * 1.5, vy: 2.5, reservedBy: null };
  }
  // flatten whoever is underneath
  const victims = creaturesNear(w, p.x, p.z, 1.6 * p.scale, isl.id).filter((c) => c.state !== "held" && c.state !== "thrown");
  for (const c of victims) {
    interrupt(w, c, rng, true);
    c.health = Math.max(5, c.health - 30);
    c.happiness = Math.max(0, c.happiness - 25);
    remember(c, "struck", 1, undefined, p.x, p.z, w.time);
    const d = Math.hypot(c.x - p.x, c.z - p.z) || 0.3;
    c.vx = ((c.x - p.x) / d) * 4;
    c.vz = ((c.z - p.z) / d) * 4;
    c.vy = 5;
    c.state = "thrown";
    c.stateTime = 0;
    for (const o of creaturesNear(w, c.x, c.z, 5, isl.id)) if (o.id !== c.id) relation(o, c.id, 0);
  }
  if (victims.length) chronicle(w, `A flying ${p.kind} flattened ${victims.map((v) => v.name).join(" and ")}.`, "power", 2, { x: p.x, z: p.z, islandId: isl.id });
  addMayhem(w, 2 + victims.length * 2, p.x, p.z);
  w.flags.hitStop = w.time;
  for (const b of buildingsNear(w, p.x, p.z, 1.6 + p.scale, isl.id)) damageBuilding(w, b, p.kind === "tree" ? 30 : 45, `a flying ${p.kind} thrown by the hand`, rng);
  for (const c of creaturesNear(w, p.x, p.z, 7, isl.id)) remember(c, "threat", 0.7, undefined, p.x, p.z, w.time);
  if (p.kind === "tree") {
    w.stats.treesThrown++;
    unlockAchievement(w, "tree_throw");
    addXp(w, 8, "tree throw");
    const owner = isl.ownerFaction;
    if (owner && w.factions[owner]?.persona === "wildkeeper") {
      noteAIEvent(w, owner, "uprooted_tree", -10, "They uprooted one of my trees and threw it.");
    }
  }
}
