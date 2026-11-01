import type { Command, CommandResult, Creature, World, SpeciesId } from "./types";
import { RNG, clamp, dist2 } from "./rng";
import { heightAt, isWaterAt, terraform as terraformIsland, isBuildable, cellOf, findFlatSpot } from "./terrain";
import { SIM_DT as _dt } from "./world";
import { islandAt, islandById, creaturesNear, nearestNode, canAfford, buildingsOf } from "./query";
import { chronicle, effect } from "./chronicle";
import { interrupt, remember, relation, completeBuilding, goTo } from "./creature";
import { spawnCreature, placeBuildingRaw, markBuildingCells, rebuildIslandNav, makeFaction } from "./world";
import { BUILDINGS, SPECIES } from "./species";
import { unlockAchievement, addXp } from "./progression";
import { grabNode } from "./projectiles";
import { boardSkiff } from "./skiffs";
import { tameBoar } from "./wild";
import { addMayhem, damageBuilding } from "./mayhem";
import { resolveOmen } from "./omens";
import { findFlatSpot as _ffs } from "./terrain";
import { removeTask } from "./tasks";
import { noteAIEvent } from "./overlords";

export const POWER_COOLDOWNS: Record<string, number> = { lightning: 2.5, bless: 4, storm: 30, terraform: 0.15, giant: 20, clone: 8 };

function playerName(w: World, id?: string) {
  if (!id) return "The Overlord";
  return w.players[id]?.name ?? "The Overlord";
}

function ownerOfIsland(w: World, islandId: number): string | null {
  return islandById(w, islandId).ownerFaction;
}

/** Apply a validated player command to the world. Returns a result; never throws. */
export function applyCommand(w: World, cmd: Command, rng: RNG): CommandResult {
  const pf = w.playerFaction;
  switch (cmd.type) {
    case "spawn": {
      const isl = islandAt(w, cmd.x, cmd.z);
      if (!isl) return { ok: false, reason: "Not over land" };
      if (isWaterAt(isl, cmd.x, cmd.z)) return { ok: false, reason: "Can't spawn in water" };
      let pop = 0;
      for (const id in w.creatures) pop++;
      if (pop >= 90) return { ok: false, reason: "The island is full (90 creatures)" };
      const faction = cmd.faction ?? factionOfPlayer(w, cmd.player);
      const c = spawnCreature(w, cmd.species, faction, isl.id, cmd.x, cmd.z, rng);
      c.y = Math.max(heightAt(isl, c.x, c.z), isl.waterLevel) + 2.5;
      c.vy = 0;
      effect(w, "sparkle", cmd.x, cmd.z, { ttl: 1.2, color: SPECIES[cmd.species].color });
      w.flags.playerSpawned = 1;
      w.flags.playerSpawns = ((w.flags.playerSpawns as number) ?? 0) + 1;
      addXp(w, 5, "spawn");
      unlockAchievement(w, "first_spawn");
      if (isl.ownerFaction && isl.ownerFaction !== faction && w.factions[isl.ownerFaction]?.isAI) {
        noteAIEvent(w, isl.ownerFaction, "trespass", -3, `${playerName(w, cmd.player)} spawned creatures on my island.`);
      }
      return { ok: true, id: c.id };
    }
    case "grab": {
      const c = w.creatures[cmd.creatureId];
      if (!c) return { ok: false, reason: "No such creature" };
      if (c.state === "held") return { ok: false, reason: "Already held" };
      interrupt(w, c, rng, false);
      c.state = "held";
      c.stateTime = 0;
      c.held = true;
      c.vx = c.vz = c.vy = 0;
      c.partnerId = null;
      // nearby creatures notice
      for (const o of creaturesNear(w, c.x, c.z, 3, c.islandId)) if (o.id !== c.id) remember(o, "threat", 0.3, undefined, c.x, c.z, w.time);
      w.flags[`holder_${c.id}`] = 1;
      return { ok: true };
    }
    case "move": {
      const c = w.creatures[cmd.creatureId];
      if (!c || c.state !== "held") return { ok: false, reason: "Not held" };
      c.x = cmd.x;
      c.z = cmd.z;
      const isl = islandAt(w, cmd.x, cmd.z);
      if (isl) c.islandId = isl.id;
      return { ok: true };
    }
    case "drop": {
      const c = w.creatures[cmd.creatureId];
      if (!c || c.state !== "held") return { ok: false, reason: "Not held" };
      c.held = false;
      c.state = "thrown";
      c.stateTime = 0;
      c.vx = 0;
      c.vz = 0;
      c.vy = 0;
      return { ok: true };
    }
    case "throw": {
      const c = w.creatures[cmd.creatureId];
      if (!c || c.state !== "held") return { ok: false, reason: "Not held" };
      const maxV = 16;
      const sp = Math.hypot(cmd.vx, cmd.vz);
      const k = sp > maxV ? maxV / sp : 1;
      c.vx = cmd.vx * k;
      c.vz = cmd.vz * k;
      c.vy = clamp(cmd.vy, 1, 10);
      c.held = false;
      c.state = "thrown";
      c.stateTime = 0;
      c.happiness = clamp(c.happiness - 8, 0, 100);
      remember(c, "thrown", 1, undefined, undefined, undefined, w.time);
      c.jumpy = (c.jumpy ?? 0) + 1;
      if (c.jumpy === 3) chronicle(w, `${c.name} has been thrown three times and now flinches whenever the hand comes near.`, "story", 2, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
      w.stats.thrown++;
      w.flags.lastThrower = 1;
      const lastThrow = (w.flags.lastThrowAt as number) ?? -100;
      const streak = w.time - lastThrow < 6 ? ((w.flags.yeetStreak as number) ?? 1) + 1 : 1;
      w.flags.yeetStreak = streak;
      w.flags.lastThrowAt = w.time;
      addXp(w, 2 + Math.min(10, streak), "throw");
      effect(w, "text", c.x, c.z, { text: streak >= 3 ? `×${streak} YEET!` : c.traits.includes("brave") ? "WHEEE!" : rng.pick(["NOOO!", "not again!", "put me DOWN", "aaaaa"]), color: streak >= 3 ? "#ff8fab" : "#ffffff", ttl: 1.3, y: 1.8 });
      if (streak === 5) chronicle(w, `${playerName(w, cmd.player)} threw five creatures in quick succession. The survivors are forming a committee.`, "power", 2, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
      const f = w.factions[c.faction];
      if (f) f.stats.thrown++;
      unlockAchievement(w, "first_throw");
      if (f && f.isAI) noteAIEvent(w, f.id, "creature_thrown", f.persona === "wildkeeper" ? -8 : -4, `${playerName(w, cmd.player)} threw ${c.name}.`);
      if (sp > 9 && rng.chance(0.25)) chronicle(w, `${playerName(w, cmd.player)} launched ${c.name} into the sky with tremendous force.`, "power", 1, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
      return { ok: true };
    }
    case "lightning": {
      const isl = islandAt(w, cmd.x, cmd.z);
      effect(w, "lightning", cmd.x, cmd.z, { ttl: 1.2 });
      effect(w, "scorch", cmd.x, cmd.z, { ttl: 40 });
      w.stats.struck++;
      if (cmd.player !== "storm" && cmd.player !== "disaster") addXp(w, 3, "lightning");
      const victims = isl ? creaturesNear(w, cmd.x, cmd.z, 2.2, isl.id) : [];
      for (const c of victims) {
        if (c.state === "held") continue;
        interrupt(w, c, rng, true);
        c.health = clamp(c.health - 35, 1, 100);
        c.happiness = clamp(c.happiness - 20, 0, 100);
        remember(c, "struck", 1, undefined, cmd.x, cmd.z, w.time);
        c.jumpy = (c.jumpy ?? 0) + 1;
        const d = Math.hypot(c.x - cmd.x, c.z - cmd.z) || 0.3;
        c.vx = ((c.x - cmd.x) / d) * 5;
        c.vz = ((c.z - cmd.z) / d) * 5;
        c.vy = 6;
        c.state = "thrown";
        c.stateTime = 0;
        const f = w.factions[c.faction];
        if (f) {
          f.stats.struck++;
          if (f.isAI) noteAIEvent(w, f.id, "struck", -10, `${playerName(w, cmd.player)} struck ${c.name} with lightning.`);
        }
        const n = (w.flags[`struck_${c.id}`] = ((w.flags[`struck_${c.id}`] as number) ?? 0) + 1);
        if (n === 3) chronicle(w, `${c.name} has now survived three lightning strikes and is starting to take it personally.`, "power", 3, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
      }
      // scare
      if (isl) for (const c of creaturesNear(w, cmd.x, cmd.z, 7, isl.id)) remember(c, "threat", 0.8, undefined, cmd.x, cmd.z, w.time);
      // trees burn into loose wood
      if (isl) {
        const tree = nearestNode(w, isl.id, cmd.x, cmd.z, (n) => n.kind === "tree" && n.amount > 0, 1.6);
        if (tree) {
          const amt = Math.min(tree.amount, 4);
          tree.amount = Math.max(0, tree.amount - amt);
          tree.burning = 6;
          for (let i = 0; i < amt; i++) {
            const id = w.nextId++;
            w.items[id] = { id, type: "wood", amount: 1, islandId: isl.id, x: tree.x + rng.range(-1, 1), z: tree.z + rng.range(-1, 1), y: Math.max(heightAt(isl, tree.x, tree.z), isl.waterLevel) + 1.5, vx: rng.range(-2, 2), vz: rng.range(-2, 2), vy: 3, reservedBy: null };
          }
          if (tree.amount <= 0) {
            tree.kind = "stump";
            tree.regrow = 0.3;
            rebuildIslandNav(w, isl);
          }
          if (isl.ownerFaction && w.factions[isl.ownerFaction]?.persona === "wildkeeper") noteAIEvent(w, isl.ownerFaction, "burned_tree", -12, `${playerName(w, cmd.player)} burned one of my trees.`);
        }
        const b = buildingsNear(w, cmd.x, cmd.z, 1.8, isl.id)[0];
        if (b) {
          b.struck = w.time;
          if (!b.complete) {
            b.workDone = Math.max(0, b.workDone - b.work * 0.3);
            b.progress = b.workDone / b.work;
          }
          damageBuilding(w, b, 25, "lightning", rng);
          const f = w.factions[b.faction];
          if (f && f.isAI) noteAIEvent(w, f.id, "struck_building", -15, `${playerName(w, cmd.player)} struck my ${BUILDINGS[b.type].name} with lightning.`);
          if (f && !f.isAI && rng.chance(0.5)) chronicle(w, `Lightning scorched a ${BUILDINGS[b.type].name}. The builders are not amused.`, "power", 1, { faction: b.faction, x: b.x, z: b.z, islandId: b.islandId });
        }
      }
      if (victims.length >= 3) chronicle(w, `${playerName(w, cmd.player)} struck ${victims.length} creatures with a single bolt.`, "power", 2, { x: cmd.x, z: cmd.z, islandId: isl?.id });
      if (victims.length) addMayhem(w, victims.length, cmd.x, cmd.z);
      effect(w, "text", cmd.x, cmd.z, { text: "ZAP!", color: "#9ecbff", ttl: 1.1, y: 1.6 });
      return { ok: true };
    }
    case "bless": {
      const isl = islandAt(w, cmd.x, cmd.z);
      effect(w, "bless", cmd.x, cmd.z, { ttl: 2.2, size: 3.5 });
      w.stats.blessed++;
      addXp(w, 4, "bless");
      const near = isl ? creaturesNear(w, cmd.x, cmd.z, 3.5, isl.id) : [];
      const blessed = near.filter((c) => c.faction !== "wild").length;
      if (blessed > ((w.flags.bestBless as number) ?? 0)) w.flags.bestBless = blessed;
      if (blessed >= 3) w.flags.bestBlessAt = w.time;
      // the Sun warms two creatures into friendship
      for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) if (near[i].faction === near[j].faction) { relation(near[i], near[j].id, 12); relation(near[j], near[i].id, 12); }
      for (const c of near) {
        if (c.faction === "wild") {
          tameBoar(w, c);
          continue;
        }
        c.blessedUntil = w.time + 45;
        c.happiness = clamp(c.happiness + 25, 0, 100);
        c.energy = clamp(c.energy + 30, 0, 100);
        c.health = clamp(c.health + 30, 0, 100);
        remember(c, "blessed", 1, undefined, undefined, undefined, w.time);
        c.devout = (c.devout ?? 0) + 1;
        c.jumpy = Math.max(0, (c.jumpy ?? 0) - 1);
        if (rng.chance(0.5)) effect(w, "text", c.x, c.z, { text: rng.pick(["ahh ☀", "warm!", "thank you", "lovely"]), color: "#ffe08a", ttl: 1.3, y: 1.5 });
        if (c.devout === 3) chronicle(w, `${c.name} has been blessed three times and now follows the hand around like a devoted puppy.`, "story", 2, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
        const f = w.factions[c.faction];
        if (f) {
          f.stats.blessed++;
          if (f.isAI) noteAIEvent(w, f.id, "blessed", 6, `${playerName(w, cmd.player)} blessed ${c.name}.`);
        }
      }
      if (near.length === 0) return { ok: false, reason: "Nobody there to bless" };
      return { ok: true };
    }
    case "terraform": {
      const isl = islandAt(w, cmd.x, cmd.z);
      if (!isl) return { ok: false, reason: "Not over land" };
      const ok = terraformIsland(isl, cmd.x, cmd.z, cmd.radius, cmd.dir * 0.28);
      if (!ok) return { ok: false, reason: "Can't shape that" };
      rebuildIslandNav(w, isl);
      // the land itself is a weapon: rising ground launches, sinking ground dunks; buildings crack
      for (const c of creaturesNear(w, cmd.x, cmd.z, cmd.radius * 0.8, isl.id)) {
        if (c.state === "held" || c.state === "thrown" || c.state === "aboard") continue;
        if (cmd.dir > 0) {
          interrupt(w, c, rng, false);
          c.vx = rng.range(-1.5, 1.5);
          c.vz = rng.range(-1.5, 1.5);
          c.vy = 6;
          c.y += 0.1;
          c.state = "thrown";
          c.stateTime = 0;
          remember(c, "threat", 0.5, undefined, cmd.x, cmd.z, w.time);
        } else {
          c.y = Math.max(heightAt(isl, c.x, c.z), isl.waterLevel);
          remember(c, "threat", 0.4, undefined, cmd.x, cmd.z, w.time);
        }
      }
      for (const b of buildingsNear(w, cmd.x, cmd.z, cmd.radius + 0.8, isl.id)) damageBuilding(w, b, 6, "the ground moved under it by the hand", rng);
      if (isl.ownerFaction && w.factions[isl.ownerFaction]?.isAI && rng.chance(0.1)) noteAIEvent(w, isl.ownerFaction, "terraform", -2, `${playerName(w, cmd.player)} reshaped my island.`);
      // creatures standing on it get nudged (they re-path naturally)
      return { ok: true };
    }
    case "giant": {
      if (!w.unlockedPowers.includes("giant")) return { ok: false, reason: "Giant power not unlocked" };
      const c = w.creatures[cmd.creatureId];
      if (!c) return { ok: false, reason: "No such creature" };
      c.scale = c.scale > 1.5 ? 1 : 2.4;
      effect(w, "sparkle", c.x, c.z, { ttl: 1.5, size: 2, color: "#ff9f43" });
      chronicle(w, c.scale > 1.5 ? `${c.name} is now ENORMOUS. Everyone else must adapt.` : `${c.name} has shrunk back to a sensible size.`, "power", 2, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
      return { ok: true };
    }
    case "clone": {
      if (!w.unlockedPowers.includes("clone")) return { ok: false, reason: "Clone power not unlocked" };
      const c = w.creatures[cmd.creatureId];
      if (!c) return { ok: false, reason: "No such creature" };
      const isl = islandById(w, c.islandId);
      const n = spawnCreature(w, c.species, c.faction, c.islandId, c.x + 0.6, c.z + 0.3, rng, `${c.name} II`);
      n.traits = [...c.traits];
      n.skills = { ...c.skills };
      n.y = Math.max(heightAt(isl, n.x, n.z), isl.waterLevel) + 1.5;
      relation(n, c.id, 40);
      relation(c, n.id, 40);
      effect(w, "sparkle", n.x, n.z, { ttl: 1.2, color: "#7ee8fa" });
      chronicle(w, `${c.name} has been cloned. ${n.name} immediately has opinions.`, "power", 2, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
      return { ok: true, id: n.id };
    }
    case "storm": {
      if (!w.unlockedPowers.includes("storm")) return { ok: false, reason: "Storm power not unlocked" };
      w.weather = { kind: "storm", until: w.time + 25, intensity: 1 };
      w.flags.stormX = cmd.x;
      w.flags.stormZ = cmd.z;
      effect(w, "storm", cmd.x, cmd.z, { ttl: 25, size: 14 });
      chronicle(w, `${playerName(w, cmd.player)} summoned a storm. Umbrellas have not been invented.`, "disaster", 2, { x: cmd.x, z: cmd.z });
      return { ok: true };
    }
    case "place": {
      const isl = islandAt(w, cmd.x, cmd.z);
      if (!isl) return { ok: false, reason: "Not over land" };
      const def = BUILDINGS[cmd.building];
      if (!def) return { ok: false, reason: "Unknown building" };
      const faction = cmd.faction ?? factionOfPlayer(w, cmd.player);
      const f = w.factions[faction];
      if (!f) return { ok: false, reason: "No faction" };
      if (def.unlock && faction === pf && !w.achievements[def.unlock]?.unlockedAt) return { ok: false, reason: def.type === "monument" ? "Reach Overlord level 6 to begin the Sky Monument" : `Locked: ${w.achievements[def.unlock]?.title}` };
      if (!isBuildable(isl, cmd.x, cmd.z, def.footprint)) return { ok: false, reason: "Ground isn't flat or clear enough" };
      if (buildingsNear(w, cmd.x, cmd.z, def.footprint + 1.6, isl.id).length > 0) return { ok: false, reason: "Too close to another building" };
      const nearbyNode = nearestNode(w, isl.id, cmd.x, cmd.z, (n) => n.kind !== "berry" && n.kind !== "stump", def.footprint + 0.6);
      if (nearbyNode) return { ok: false, reason: "Blocked by a tree or rock" };
      const instant = !!cmd.instant && (w.meta.mode === "sandbox" || faction !== pf);
      const needsDropoff = buildingsOf(w, faction).some((b) => b.islandId === isl.id && b.complete && (b.type === "campfire" || b.type === "storage"));
      if (!instant && !needsDropoff && cmd.building !== "campfire") return { ok: false, reason: "Build a campfire first" };
      if (!instant && cmd.building !== "campfire" && w.meta.mode !== "sandbox") {
        // Need at least some of the materials to be plausible — creatures will gather the rest, but require a non-empty stock for the first resource
        const anyStock = Object.keys(def.cost).some((k) => f.stock[k as keyof typeof f.stock] > 0);
        if (!anyStock && faction === pf) return { ok: false, reason: "You have none of the materials yet" };
      }
      if (instant && !canAfford(f, def.cost) && w.meta.mode !== "sandbox") return { ok: false, reason: "Not enough resources" };
      const b = placeBuildingRaw(w, cmd.building, faction, isl.id, cmd.x, cmd.z, rng, instant);
      if (!b) return { ok: false, reason: "Placement failed" };
      if (instant) {
        if (w.meta.mode !== "sandbox") for (const k in def.cost) f.stock[k as keyof typeof f.stock] -= def.cost[k as keyof typeof def.cost] ?? 0;
        b.complete = false;
        completeBuilding(w, b, null, rng);
      } else {
        if (faction === pf) chronicle(w, `A ${def.name} has been planned. Creatures will gather ${Object.entries(def.cost).map(([k, v]) => `${v} ${k}`).join(" and ")}.`, "build", 1, { faction, x: b.x, z: b.z, islandId: isl.id });
      }
      if (isl.ownerFaction && isl.ownerFaction !== faction && w.factions[isl.ownerFaction]?.isAI) noteAIEvent(w, isl.ownerFaction, "built_on_island", -6, `${playerName(w, cmd.player)} built on my island.`);
      return { ok: true, id: b.id };
    }
    case "cancelBuilding": {
      const b = w.buildings[cmd.buildingId];
      if (!b) return { ok: false, reason: "No such building" };
      if (b.complete && b.type === "campfire" && buildingsOf(w, b.faction, "campfire").length === 1) return { ok: false, reason: "Keep at least one campfire" };
      const f = w.factions[b.faction];
      if (f) {
        // refund delivered materials (and the full cost for complete buildings at 50%)
        for (const k in b.delivered) f.stock[k as keyof typeof f.stock] += Math.floor((b.delivered[k as keyof typeof b.delivered] ?? 0) * (b.complete ? 0.5 : 1));
      }
      for (const id in w.tasks) if (w.tasks[id].buildingId === b.id) removeTask(w, Number(id), true);
      for (const id in w.creatures) if (w.creatures[id].homeId === b.id) w.creatures[id].homeId = null;
      markBuildingCells(w, b, false);
      delete w.buildings[b.id];
      effect(w, "dust", b.x, b.z, { ttl: 1, size: 1.5 });
      return { ok: true };
    }
    case "setPriority": {
      const f = w.factions[cmd.faction ?? factionOfPlayer(w, cmd.player)];
      if (!f) return { ok: false, reason: "No faction" };
      f.jobPriorities[cmd.job] = clamp(cmd.value, 0, 2);
      return { ok: true };
    }
    case "command": {
      const c = w.creatures[cmd.creatureId];
      if (!c) return { ok: false, reason: "No such creature" };
      if (c.state === "held" || c.state === "thrown") return { ok: false, reason: "Busy flying" };
      interrupt(w, c, rng, false);
      const isl = islandAt(w, cmd.x, cmd.z);
      if (!isl || isl.id !== c.islandId) return { ok: false, reason: "Can't walk there" };
      if (!goTo(w, c, cmd.x, cmd.z)) return { ok: false, reason: "No path" };
      c.state = "wander";
      c.stateTime = 0;
      c.decisionCooldown = 3;
      return { ok: true };
    }
    case "follow": {
      const c = w.creatures[cmd.creatureId];
      if (!c) return { ok: false, reason: "No such creature" };
      interrupt(w, c, rng, false);
      c.followId = cmd.targetId;
      c.state = cmd.targetId === null ? "idle" : "follow";
      c.stateTime = 0;
      return { ok: true };
    }
    case "rename": {
      const c = w.creatures[cmd.creatureId];
      if (!c) return { ok: false, reason: "No such creature" };
      const name = cmd.name.trim().slice(0, 18);
      if (!name) return { ok: false, reason: "Empty name" };
      chronicle(w, `${c.name} shall henceforth be known as ${name}.`, "player", 1, { faction: c.faction });
      c.name = name;
      return { ok: true };
    }
    case "trade": {
      for (const fid in w.factions) {
        const f = w.factions[fid];
        const idx = f.tradeOffers.findIndex((o) => o.id === cmd.offerId);
        if (idx < 0) continue;
        const offer = f.tradeOffers[idx];
        f.tradeOffers.splice(idx, 1);
        const me = w.factions[pf];
        if (!cmd.accept) {
          noteAIEvent(w, fid, "trade_declined", -2, "They declined my trade.");
          return { ok: true };
        }
        if (!canAfford(me, offer.want)) return { ok: false, reason: "You can't afford that trade" };
        for (const k in offer.want) {
          me.stock[k as keyof typeof me.stock] -= offer.want[k as keyof typeof offer.want] ?? 0;
          f.stock[k as keyof typeof f.stock] += offer.want[k as keyof typeof offer.want] ?? 0;
        }
        for (const k in offer.give) {
          me.stock[k as keyof typeof me.stock] += offer.give[k as keyof typeof offer.give] ?? 0;
          f.stock[k as keyof typeof f.stock] = Math.max(0, f.stock[k as keyof typeof f.stock] - (offer.give[k as keyof typeof offer.give] ?? 0));
        }
        noteAIEvent(w, fid, "trade_accepted", 8, "They accepted my trade.");
        unlockAchievement(w, "trade");
        chronicle(w, `Trade completed with ${f.name}: ${describe(offer.want)} for ${describe(offer.give)}.`, "rival", 2, { faction: fid });
        return { ok: true };
      }
      return { ok: false, reason: "Offer expired" };
    }
    case "gift": {
      const to = w.factions[cmd.toFaction];
      const me = w.factions[pf];
      if (!to || !me) return { ok: false, reason: "No such faction" };
      const amt = Math.min(cmd.amount, me.stock[cmd.resource]);
      if (amt <= 0) return { ok: false, reason: "Nothing to give" };
      me.stock[cmd.resource] -= amt;
      to.stock[cmd.resource] += amt;
      noteAIEvent(w, to.id, "gift", 4 + amt * 0.5, `They gifted me ${amt} ${cmd.resource}.`);
      chronicle(w, `You gifted ${amt} ${cmd.resource} to ${to.name}.`, "rival", 1, { faction: to.id });
      return { ok: true };
    }
    case "grabNode": {
      const n = w.nodes[cmd.nodeId];
      if (!n) return { ok: false, reason: "Nothing there" };
      if (n.kind === "berry" || n.kind === "stump" || n.kind === "crop") return { ok: false, reason: "Too small to lift" };
      const p = grabNode(w, n, rng);
      if (!p) return { ok: false, reason: "Can't lift that" };
      const isl = islandById(w, n.islandId);
      if (isl.ownerFaction && w.factions[isl.ownerFaction]?.persona === "wildkeeper") noteAIEvent(w, isl.ownerFaction, "uprooted", -6, `${playerName(w, cmd.player)} uprooted one of my trees.`);
      return { ok: true, id: p.id };
    }
    case "moveNode": {
      const p = w.projectiles[cmd.projectileId];
      if (!p || !p.held) return { ok: false, reason: "Not held" };
      p.x = cmd.x;
      p.z = cmd.z;
      const isl = islandAt(w, cmd.x, cmd.z);
      if (isl) p.islandId = isl.id;
      return { ok: true };
    }
    case "throwNode":
    case "dropNode": {
      const p = w.projectiles[cmd.projectileId];
      if (!p || !p.held) return { ok: false, reason: "Not held" };
      p.held = false;
      if (cmd.type === "throwNode") {
        const maxV = 14;
        const spd = Math.hypot(cmd.vx, cmd.vz);
        const k = spd > maxV ? maxV / spd : 1;
        p.vx = cmd.vx * k;
        p.vz = cmd.vz * k;
        p.vy = clamp(cmd.vy, 1, 9);
      } else {
        p.vx = p.vz = 0;
        p.vy = 0;
      }
      return { ok: true };
    }
    case "setJobPref": {
      const c = w.creatures[cmd.creatureId];
      if (!c) return { ok: false, reason: "No such creature" };
      c.jobPref = cmd.job;
      if (c.taskId !== null) {
        const t = w.tasks[c.taskId];
        if (t && cmd.job && t.job !== cmd.job && c.state !== "carry") interrupt(w, c, rng, false), (c.state = "idle"), (c.decisionCooldown = 0.2);
      }
      return { ok: true };
    }
    case "resolveOmen": {
      const r = resolveOmen(w, cmd.option);
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    }
    case "raid": {
      const target = w.factions[cmd.targetFaction];
      const me = w.factions[factionOfPlayer(w, cmd.player)];
      if (!target || !me || target.id === me.id) return { ok: false, reason: "No such rival" };
      if (w.meta.mode === "sandbox") return { ok: false, reason: "No rivals to raid in the sandbox" };
      const cd = (w.flags[`raidCd_${me.id}`] as number) ?? -999;
      if (w.time - cd < 120) return { ok: false, reason: `Your raiders need ${Math.ceil(120 - (w.time - cd))}s to recover` };
      const pool = Object.values(w.creatures).filter((c) => c.faction === me.id && c.state !== "held" && c.state !== "thrown" && c.state !== "raid" && c.health > 40);
      pool.sort((a, b) => (b.traits.includes("brave") ? 2 : 0) + (b.species === "goblin" ? 1 : 0) - ((a.traits.includes("brave") ? 2 : 0) + (a.species === "goblin" ? 1 : 0)));
      const party = pool.slice(0, 2);
      if (party.length === 0) return { ok: false, reason: "Nobody is fit to raid" };
      for (const c of party) c.raidTarget = { factionId: target.id, phase: "go", homeIslandId: c.islandId };
      const skiff = boardSkiff(w, party, target.homeIslandId, "raid", rng);
      if (!skiff) return { ok: false, reason: "The skiff wouldn't launch" };
      w.flags[`raidCd_${me.id}`] = w.time;
      w.stats.raidsSent++;
      unlockAchievement(w, "raid_sent");
      addXp(w, 20, "raid");
      noteAIEvent(w, target.id, "raided", -18, `${playerName(w, cmd.player)} sent raiders to rob my stores.`);
      target.raidCooldown = Math.min(target.raidCooldown, 60); // they will want revenge
      chronicle(w, `${party.map((c) => c.name).join(" and ")} set off by sky-skiff to raid ${target.name}'s stores.`, "rival", 3, { faction: me.id, x: skiff.sx, z: skiff.sz, islandId: skiff.fromIslandId });
      return { ok: true };
    }
    case "cursor": {
      const p = w.players[cmd.player];
      if (p) {
        p.cursorX = cmd.x;
        p.cursorZ = cmd.z;
        p.power = cmd.power;
        p.lastSeen = w.time;
      }
      return { ok: true };
    }
    case "joinPlayer": {
      const existing = w.players[cmd.player.id];
      w.players[cmd.player.id] = { ...cmd.player, lastSeen: w.time, isHost: existing?.isHost ?? cmd.player.isHost };
      if (!existing) {
        if (w.meta.mpMode === "rivals" && !w.factions[cmd.player.faction]) setupRivalFaction(w, cmd.player.faction, cmd.player.name, cmd.player.color, rng);
        chronicle(w, `${cmd.player.name} has entered the world.`, "player", 2);
      }
      return { ok: true };
    }
    case "leavePlayer": {
      const p = w.players[cmd.playerId];
      if (p) {
        chronicle(w, `${p.name} has left the world.`, "player", 1);
        delete w.players[cmd.playerId];
      }
      return { ok: true };
    }
    case "setDifficulty": {
      for (const fid in w.factions) if (w.factions[fid].isAI) w.factions[fid].difficulty = cmd.difficulty;
      return { ok: true };
    }
  }
  return { ok: false, reason: "Unknown command" };
}

function describe(r: Partial<Record<string, number>>) {
  return Object.entries(r).map(([k, v]) => `${v} ${k}`).join(", ");
}

export function factionOfPlayer(w: World, playerId?: string): string {
  if (playerId && w.players[playerId]) return w.players[playerId].faction;
  return w.playerFaction;
}

export function buildingsNear(w: World, x: number, z: number, r: number, islandId: number) {
  const out = [];
  for (const id in w.buildings) {
    const b = w.buildings[id];
    if (b.islandId === islandId && dist2(b.x, b.z, x, z) <= r * r) out.push(b);
  }
  return out;
}

/** Rivals multiplayer: each human gets a faction with its own campfire + starter creatures on the main island. */
export function setupRivalFaction(w: World, fid: string, name: string, color: string, rng: RNG) {
  const isl = w.islands[0];
  const f = makeFaction(fid, name, color, false, isl.id);
  w.factions[fid] = f;
  const existing = Object.values(w.factions).filter((x) => !x.isAI).length;
  const ang = existing * 2.1;
  const sp = findFlatSpot(isl, isl.center.x + Math.cos(ang) * isl.size * 0.22, isl.center.z + Math.sin(ang) * isl.size * 0.22, 1, rng, 60) ?? isl.spawnPoint;
  placeBuildingRaw(w, "campfire", fid, isl.id, sp.x, sp.z, rng, true);
  const mix: SpeciesId[] = ["goblin", "goblin", "trollkin", "mushroom"];
  for (let i = 0; i < 4; i++) spawnCreature(w, mix[i], fid, isl.id, sp.x + rng.range(-1.5, 1.5), sp.z + rng.range(-1.5, 1.5), rng);
}

export function creatureAtPoint(w: World, x: number, z: number, r = 0.8): Creature | null {
  let best: Creature | null = null;
  let bd = r * r;
  for (const id in w.creatures) {
    const c = w.creatures[id];
    const rr = r * Math.max(1, c.scale);
    const d = dist2(c.x, c.z, x, z);
    if (d < bd * (rr / r) * (rr / r) && d < bd + rr) {
      bd = d;
      best = c;
    }
  }
  return best;
}
export { cellOf };
