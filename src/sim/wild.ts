import type { Creature, World } from "./types";
import type { RNG } from "./rng";
import { dist2 } from "./rng";
import { buildingsOf, creaturesNear, islandById, nearestNode } from "./query";
import { chronicle, effect } from "./chronicle";
import { goTo, interrupt, remember } from "./creature";
import { spawnCreature } from "./world";
import { nearestWalkableCell } from "./nav";
import { heightAt } from "./terrain";

/**
 * Wildlife: boars trot in from the coast, raid farms and berry bushes, and bolt from brave creatures.
 * Grab and throw them like anything else; shine the Sun on one and it joins the settlement as a pet.
 */
export function spawnBoars(w: World, rng: RNG, count = 2) {
  const f = w.factions[w.playerFaction];
  const isl = islandById(w, f.homeIslandId);
  const n = isl.size;
  let spot: { x: number; z: number } | null = null;
  let bd = 0;
  for (let i = 0; i < 60; i++) {
    const idx = rng.int(0, n * n - 1);
    if (isl.blocked[idx] !== 0) continue;
    const x = isl.ox + (idx % n) + 0.5;
    const z = isl.oz + Math.floor(idx / n) + 0.5;
    const d = dist2(x, z, isl.spawnPoint.x, isl.spawnPoint.z);
    if (d > bd) {
      bd = d;
      spot = { x, z };
    }
  }
  if (!spot) return;
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const b = spawnCreature(w, "boar", "wild", isl.id, spot.x + rng.range(-1, 1), spot.z + rng.range(-1, 1), rng);
    b.traits = ["greedy", "brave"];
    b.hunger = 70;
    names.push(b.name);
  }
  effect(w, "text", spot.x, spot.z, { text: "BOARS!", color: "#ffb347", ttl: 2.5, y: 1.6 });
  chronicle(w, `${names.join(" and ")} — wild boars — trotted up onto your island with their eyes on your crops. Brave folk will chase them; the Sun will tame them.`, "disaster", 3, { x: spot.x, z: spot.z, islandId: isl.id });
}

/** Per-tick brain for wild creatures. Returns true when it handled the creature. */
export function wildBrain(w: World, c: Creature, dt: number, rng: RNG): boolean {
  if (c.faction !== "wild") return false;
  if (c.state === "held" || c.state === "thrown" || c.state === "swim" || c.state === "recover" || c.state === "aboard" || c.state === "flee") return false;
  // flee from brave creatures or giants nearby
  const threat = creaturesNear(w, c.x, c.z, 3.5, c.islandId).find((o) => o.faction !== "wild" && (o.traits.includes("brave") || o.scale > 1.5) && o.state !== "held" && o.state !== "thrown");
  if (threat) {
    c.health -= 4;
    remember(c, "threat", 1, threat.id, threat.x, threat.z, w.time);
    effect(w, "text", c.x, c.z, { text: "squeal!", color: "#ffd9c0", ttl: 0.9, y: 1.2 });
    if (c.health <= 0) {
      // caught: the boar becomes dinner
      const isl = islandById(w, c.islandId);
      for (let i = 0; i < 3; i++) {
        const id = w.nextId++;
        w.items[id] = { id, type: "food", amount: 2, islandId: c.islandId, x: c.x + rng.range(-0.8, 0.8), z: c.z + rng.range(-0.8, 0.8), y: Math.max(heightAt(isl, c.x, c.z), isl.waterLevel) + 0.8, vx: rng.range(-1, 1), vz: rng.range(-1, 1), vy: 2, reservedBy: null };
      }
      chronicle(w, `${threat.name} chased down ${c.name} the boar. Dinner is served.`, "story", 2, { faction: threat.faction, x: c.x, z: c.z, islandId: c.islandId });
      effect(w, "text", c.x, c.z, { text: "DINNER!", color: "#ffd166", ttl: 1.6, y: 1.5 });
      delete w.creatures[c.id];
      return true;
    }
    return false; // let the normal flee logic (threat memory) run
  }
  if (c.decisionCooldown > 0 && c.path) return false;
  if (c.state === "eat") return false;
  if (c.decisionCooldown > 0) return false;
  c.decisionCooldown = rng.range(1, 2.5);
  // raid a farm with crops, or a berry bush
  const farm = buildingsOf(w, w.playerFaction, "farm").find((b) => b.complete && b.islandId === c.islandId && b.cropTimer > 0.2);
  const bush = nearestNode(w, c.islandId, c.x, c.z, (n) => n.kind === "berry" && n.amount >= 1, 40);
  const tx = farm ? farm.x : bush ? bush.x : null;
  const tz = farm ? farm.z : bush ? bush.z : null;
  if (tx !== null && tz !== null) {
    if (dist2(tx, tz, c.x, c.z) < 4) {
      if (farm) {
        farm.cropTimer = Math.max(0, farm.cropTimer - 0.35);
        chronicleOnce(w, `farm_${c.id}`, `${c.name} the boar is eating your crops!`, c);
        effect(w, "text", c.x, c.z, { text: "chomp", color: "#ffd9c0", ttl: 1, y: 1.2 });
      } else if (bush) bush.amount = Math.max(0, bush.amount - 1);
      c.hunger = Math.max(0, c.hunger - 20);
      c.state = "eat";
      c.stateTime = 0;
      return true;
    }
    if (goTo(w, c, tx + rng.range(-1, 1), tz + rng.range(-1, 1))) {
      c.state = "wander";
      c.stateTime = 0;
      return true;
    }
  }
  // otherwise trot about
  const isl = islandById(w, c.islandId);
  const cell = nearestWalkableCell(isl, c.x + rng.range(-8, 8), c.z + rng.range(-8, 8), 4);
  if (cell !== null && goTo(w, c, isl.ox + (cell % isl.size) + 0.5, isl.oz + Math.floor(cell / isl.size) + 0.5)) {
    c.state = "wander";
    c.stateTime = 0;
  }
  return true;
}

function chronicleOnce(w: World, key: string, text: string, c: Creature) {
  const k = `once_${key}`;
  if (w.flags[k] && w.time - (w.flags[k] as number) < 40) return;
  w.flags[k] = w.time;
  chronicle(w, text, "disaster", 2, { x: c.x, z: c.z, islandId: c.islandId });
}

/** The Sun tames a boar: it joins the settlement as a pet that keeps everyone cheerful. */
export function tameBoar(w: World, c: Creature) {
  if (c.faction !== "wild") return false;
  c.faction = w.playerFaction;
  c.traits = ["loyal", "lazy"];
  c.jobPref = null;
  c.hunger = 20;
  c.devout = 3;
  interrupt(w, c, { range: () => 0, chance: () => false } as unknown as RNG, false);
  effect(w, "heart", c.x, c.z, { ttl: 1.5, y: 1.2 });
  effect(w, "text", c.x, c.z, { text: "tamed!", color: "#b6f3bd", ttl: 1.8, y: 1.5 });
  chronicle(w, `${c.name} the boar has been tamed and now follows the hand around, grunting approvingly.`, "milestone", 3, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
  w.flags.tamed = ((w.flags.tamed as number) ?? 0) + 1;
  return true;
}
