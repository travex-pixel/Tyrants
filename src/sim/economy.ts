import type { World } from "./types";
import type { RNG } from "./rng";
import { rebuildIslandNav } from "./world";
import { islandById, creaturesNear, population, housingCapacity, buildingsOf, creaturesOf } from "./query";
import { spawnCreature, worldRng, saveRng } from "./world";
import { chronicle } from "./chronicle";
import { findFlatSpot } from "./terrain";
import { unlockAchievement, addXp } from "./progression";
import { dayFraction, remember } from "./creature";
import { addMayhem, damageBuilding } from "./mayhem";
import { nearestBuilding } from "./query";
import { noteAIEvent } from "./overlords";
import { heightAt } from "./terrain";
import type { SpeciesId } from "./types";
import { effect } from "./chronicle";

/** Resource node regrowth (berries, stumps → trees). Called once per second. */
export function updateItemRegrowth(w: World, dt: number) {
  let navDirtyIsland: number | null = null;
  const rng = worldRng(w);
  const rain = w.weather.kind === "storm";
  for (const id in w.nodes) {
    const n = w.nodes[id];
    if (n.burning !== undefined && n.burning > 0) {
      n.burning -= dt * (rain ? 4 : 1);
      // fire eats the tree and leaps to its neighbours
      if (n.kind === "tree" && n.amount > 0 && rng.chance(0.5)) {
        n.amount = Math.max(0, n.amount - 1);
        const isl = islandById(w, n.islandId);
        const iid = w.nextId++;
        w.items[iid] = { id: iid, type: "wood", amount: 1, islandId: n.islandId, x: n.x + rng.range(-1, 1), z: n.z + rng.range(-1, 1), y: Math.max(heightAt(isl, n.x, n.z), isl.waterLevel) + 1.2, vx: rng.range(-1, 1), vz: rng.range(-1, 1), vy: 2, reservedBy: null };
        if (n.amount <= 0) {
          n.kind = "stump";
          n.regrow = 0.2;
          navDirtyIsland = n.islandId;
        }
      }
      if (!rain && rng.chance(0.18)) {
        for (const oid in w.nodes) {
          const o = w.nodes[oid];
          if (o.id === n.id || o.kind !== "tree" || o.amount <= 0 || o.burning || o.islandId !== n.islandId) continue;
          if ((o.x - n.x) ** 2 + (o.z - n.z) ** 2 > 2.6 * 2.6) continue;
          o.burning = 6;
          w.flags.fireSpread = ((w.flags.fireSpread as number) ?? 0) + 1;
          addMayhem(w, 1, o.x, o.z);
          for (const c of creaturesNear(w, o.x, o.z, 5, o.islandId)) remember(c, "threat", 0.8, undefined, o.x, o.z, w.time);
          const isl = islandById(w, o.islandId);
          if (isl.ownerFaction && w.factions[isl.ownerFaction]?.persona === "wildkeeper" && rng.chance(0.3)) noteAIEvent(w, isl.ownerFaction, "wildfire", -5, "A wildfire tore through my groves.");
          break;
        }
        const b = nearestBuilding(w, n.x, n.z, 2.2, (x) => x.islandId === n.islandId && x.type !== "campfire");
        if (b) damageBuilding(w, b, 10, "fire", rng);
      }
      if (n.burning <= 0) {
        n.burning = undefined;
        if (((w.flags.fireSpread as number) ?? 0) >= 6 && !w.flags.greatFire) {
          w.flags.greatFire = 1;
          chronicle(w, `The Great Fire of day ${w.day} finally burned itself out. The island smells of toast.`, "disaster", 3, { x: n.x, z: n.z, islandId: n.islandId });
        }
      }
    }
    if (n.regrow > 0 && n.amount < n.maxAmount) {
      n.amount = Math.min(n.maxAmount, n.amount + (n.regrow / 60) * dt);
      if (n.kind === "stump" && n.amount >= 3) {
        n.kind = "tree";
        navDirtyIsland = n.islandId;
      }
    }
  }
  if (navDirtyIsland !== null) rebuildIslandNav(w, islandById(w, navDirtyIsland));
  saveRng(w, rng);
}

/** Per-tick building behaviour: farm growth, campfire happiness aura, totem aura. */
export function updateBuildings(w: World, dt: number, rng: RNG) {
  for (const id in w.buildings) {
    const b = w.buildings[id];
    if (!b.complete) continue;
    if (b.type === "farm") {
      // slow passive growth even without a farmer; farmers accelerate it (see creature.ts)
      if (b.cropTimer < 1) b.cropTimer = Math.min(1, b.cropTimer + 0.003 * dt);
    } else if (b.type === "campfire" || b.type === "totem") {
      if (rng.chance(dt * 0.25)) {
        for (const c of creaturesNear(w, b.x, b.z, 4, b.islandId)) {
          if (c.faction === b.faction) c.happiness = Math.min(100, c.happiness + 0.4);
        }
      }
      if (b.type === "campfire" && rng.chance(dt * 0.4)) effect(w, "sparkle", b.x + rng.range(-0.2, 0.2), b.z + rng.range(-0.2, 0.2), { ttl: 0.9, size: 0.3, color: "#ffb347", y: 0.5 });
    }
  }
}

/** New arrivals: surplus food + spare housing attract creatures to human-run settlements. Called once per second. */
export function updateGrowth(w: World) {
  for (const fid in w.factions) {
    const f = w.factions[fid];
    if (f.isAI) continue;
    const pop = population(w, fid);
    if (pop === 0) continue;
    const cap = 8 + housingCapacity(w, fid);
    const surplus = f.stock.food >= pop * 2 + 2;
    if (pop < cap && surplus && pop < 40) f.growthTimer += 1;
    else f.growthTimer = Math.max(0, f.growthTimer - 0.5);
    if (f.growthTimer >= 40) {
      f.growthTimer = 0;
      const rng = worldRng(w);
      const cf = buildingsOf(w, fid, "campfire").find((b) => b.complete);
      const isl = islandById(w, f.homeIslandId);
      const spot = cf ? findFlatSpot(isl, cf.x, cf.z, 0, rng, 30, 2) : null;
      const existing = creaturesOf(w, fid);
      const counts: Record<SpeciesId, number> = { goblin: 0, trollkin: 0, mushroom: 0 };
      for (const c of existing) counts[c.species]++;
      // the dominant species attracts its own kind, with a little variety
      const species: SpeciesId = rng.chance(0.3) ? rng.pick(["goblin", "trollkin", "mushroom"] as SpeciesId[]) : ((Object.keys(counts) as SpeciesId[]).sort((a, b) => counts[b] - counts[a])[0] ?? "goblin");
      const c = spawnCreature(w, species, fid, isl.id, spot ? spot.x : isl.spawnPoint.x, spot ? spot.z : isl.spawnPoint.z, rng);
      f.stock.food -= 4;
      c.y += 3;
      saveRng(w, rng);
      effect(w, "fall", c.x, c.z, { ttl: 1.5 });
      effect(w, "text", c.x, c.z, { text: `${c.name} arrived!`, color: "#b6f3bd", ttl: 2.2, y: 1.6 });
      chronicle(w, `${c.name} wandered in from the clouds, drawn by the smell of your food.`, "milestone", 2, { faction: fid, x: c.x, z: c.z, islandId: isl.id });
      if (fid === w.playerFaction) {
        w.stats.arrivals++;
        unlockAchievement(w, "arrival");
        addXp(w, 15, "arrival");
      }
    }
  }
}

/** Evening bonfire: at dusk, if spirits are high, the settlement gathers at the campfire. Called once per second. */
export function updateBonfire(w: World) {
  const f = dayFraction(w);
  const key = `bonfire_day_${w.day}`;
  if (f < 0.7 || f > 0.74 || w.flags[key]) return;
  w.flags[key] = 1;
  for (const fid in w.factions) {
    const cs = creaturesOf(w, fid);
    if (cs.length < 4) continue;
    const avg = cs.reduce((s, c) => s + c.happiness, 0) / cs.length;
    const cf = buildingsOf(w, fid, "campfire").find((b) => b.complete);
    if (avg < 48 || !cf) continue;
    w.flags[`bonfireUntil_${fid}`] = w.time + 40;
    for (const c of cs) {
      c.happiness = Math.min(100, c.happiness + 12);
      remember(c, "celebrated", 0.8, undefined, undefined, undefined, w.time);
    }
    chronicle(w, `${w.factions[fid].name === "You" ? "Your settlement" : w.factions[fid].name + "'s settlement"} gathers for an evening bonfire. Someone brought a drum.`, "social", fid === w.playerFaction ? 3 : 1, { faction: fid, x: cf.x, z: cf.z, islandId: cf.islandId });
    if (fid === w.playerFaction) {
      unlockAchievement(w, "bonfire");
      addXp(w, 20, "bonfire");
    }
  }
}
