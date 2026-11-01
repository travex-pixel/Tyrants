import type { Creature, Island, Skiff, World } from "./types";
import type { RNG } from "./rng";
import { islandById } from "./query";
import { nearestWalkableCell } from "./nav";
import { heightAt } from "./terrain";
import { chronicle, effect } from "./chronicle";
import { interrupt } from "./creature";

/** A rim point of `isl` on the side facing `toward`, snapped to a walkable cell. */
export function rimTowards(isl: Island, toward: { x: number; z: number }): { x: number; z: number } {
  const dx = toward.x - isl.center.x;
  const dz = toward.z - isl.center.z;
  const d = Math.hypot(dx, dz) || 1;
  for (let r = isl.size * 0.46; r > isl.size * 0.15; r -= 1.5) {
    const x = isl.center.x + (dx / d) * r;
    const z = isl.center.z + (dz / d) * r;
    const cell = nearestWalkableCell(isl, x, z, 3);
    if (cell !== null) return { x: isl.ox + (cell % isl.size) + 0.5, z: isl.oz + Math.floor(cell / isl.size) + 0.5 };
  }
  return isl.spawnPoint;
}

/** Put creatures aboard a skiff from their island to another. They vanish into the boat until arrival. */
export function boardSkiff(w: World, creatures: Creature[], toIslandId: number, purpose: Skiff["purpose"], rng: RNG): Skiff | null {
  if (!creatures.length) return null;
  const from = islandById(w, creatures[0].islandId);
  const to = islandById(w, toIslandId);
  const start = rimTowards(from, to.center);
  const end = rimTowards(to, from.center);
  const dist = Math.hypot(end.x - start.x, end.z - start.z);
  const skiff: Skiff = { id: w.nextId++, faction: creatures[0].faction, fromIslandId: from.id, toIslandId: to.id, sx: start.x, sz: start.z, ex: end.x, ez: end.z, t: 0, duration: Math.max(4, dist / 13), passengers: creatures.map((c) => c.id), purpose };
  w.skiffs[skiff.id] = skiff;
  for (const c of creatures) {
    interrupt(w, c, rng, false);
    c.x = start.x;
    c.z = start.z;
    c.path = null;
    c.state = "aboard";
    c.stateTime = 0;
  }
  effect(w, "fall", start.x, start.z, { ttl: 1.5 });
  return skiff;
}

export function skiffPosition(sk: Skiff, w: World): { x: number; y: number; z: number; heading: number } {
  const t = sk.t;
  const x = sk.sx + (sk.ex - sk.sx) * t;
  const z = sk.sz + (sk.ez - sk.sz) * t;
  const from = islandById(w, sk.fromIslandId);
  const to = islandById(w, sk.toIslandId);
  const y0 = Math.max(heightAt(from, sk.sx, sk.sz), from.waterLevel);
  const y1 = Math.max(heightAt(to, sk.ex, sk.ez), to.waterLevel);
  const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 9 + 1.2;
  return { x, y, z, heading: Math.atan2(sk.ex - sk.sx, sk.ez - sk.sz) };
}

export function updateSkiffs(w: World, dt: number) {
  for (const id in w.skiffs) {
    const sk = w.skiffs[id];
    sk.t += dt / sk.duration;
    if (sk.t < 1) continue;
    // arrival
    const to = islandById(w, sk.toIslandId);
    for (const cid of sk.passengers) {
      const c = w.creatures[cid];
      if (!c) continue;
      c.islandId = to.id;
      const cell = nearestWalkableCell(to, sk.ex + (Math.random() - 0.5) * 1.5, sk.ez + (Math.random() - 0.5) * 1.5, 4);
      c.x = cell !== null ? to.ox + (cell % to.size) + 0.5 : sk.ex;
      c.z = cell !== null ? to.oz + Math.floor(cell / to.size) + 0.5 : sk.ez;
      c.y = Math.max(heightAt(to, c.x, c.z), to.waterLevel) + 1.5;
      c.vy = 0;
      c.path = null;
      if (sk.purpose === "raid") {
        c.state = "raid";
        c.stateTime = 0;
        if (c.raidTarget) c.raidTarget.phase = "go";
      } else {
        // home: unload loot
        const f = w.factions[c.faction];
        const loot = c.carrying;
        c.carrying = null;
        c.raidTarget = null;
        c.state = "recover";
        c.stateTime = 0;
        if (f && f.isAI) {
          if (loot) f.stock[loot.type] += loot.amount;
          delete w.creatures[c.id]; // AI raiders melt back into their settlement's numbers
          continue;
        }
        if (f && loot) {
          f.stock[loot.type] += loot.amount;
          effect(w, "text", c.x, c.z, { text: `+${loot.amount} ${loot.type}`, color: "#ffe08a", ttl: 2, y: 1.6 });
          chronicle(w, `${c.name} came home from the raid with ${loot.amount} ${loot.type} and a story that gets longer every telling.`, "rival", 3, { faction: c.faction, x: c.x, z: c.z, islandId: to.id });
        } else if (f) chronicle(w, `${c.name} came home from the raid empty-handed, blaming the weather.`, "rival", 2, { faction: c.faction, x: c.x, z: c.z, islandId: to.id });
      }
    }
    effect(w, "fall", sk.ex, sk.ez, { ttl: 1.5 });
    if (sk.purpose === "raid" && to.ownerFaction === w.playerFaction) {
      const f = w.factions[sk.faction];
      effect(w, "text", sk.ex, sk.ez, { text: "RAIDERS!", color: "#ff6b6b", ttl: 2.5, y: 2 });
      chronicle(w, `${f?.name ?? "A rival"}'s raiding skiff has landed on your coast! Grab the raiders before they reach your stores.`, "rival", 3, { faction: sk.faction, x: sk.ex, z: sk.ez, islandId: to.id });
    }
    delete w.skiffs[id];
  }
}
