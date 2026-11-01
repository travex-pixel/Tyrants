import type { World } from "./types";
import { worldRng, saveRng } from "./world";
import { creaturesOf, buildingsOf, islandById } from "./query";
import { chronicle, effect } from "./chronicle";
import { maybeSpawnOmen } from "./omens";
import { decayMayhem } from "./mayhem";
import { heightAt } from "./terrain";
import { relation } from "./creature";

/**
 * The Director keeps the story moving. It watches how much has happened to the player lately
 * (chronicle importance, commands issued, mayhem) and, when things go quiet, drops an incident
 * sized to the player's level; after a big moment it grants a lull. Everything it fires reuses
 * real systems (omens, raids, rock projectiles, feuds) so nothing is fake.
 */
export function updateDirector(w: World) {
  decayMayhem(w);
  if (w.meta.mode === "sandbox" || w.meta.mode === "challenge") return;
  const cs = creaturesOf(w, w.playerFaction);
  if (!cs.length || w.time < 50) return;
  // tension: importance of player-relevant events in the last 60 s
  let tension = 0;
  for (let i = w.chronicle.length - 1; i >= 0; i--) {
    const e = w.chronicle[i];
    if (w.time - e.t > 60) break;
    const mine = e.faction === w.playerFaction || e.faction === undefined;
    if ((mine && e.importance >= 2) || e.kind === "disaster" || (e.kind === "rival" && e.importance >= 3)) tension += e.importance;
  }
  tension += ((w.flags.mayhem as number) ?? 0) * 0.5;
  const lastIncident = (w.flags.directorAt as number) ?? 0;
  const lull = (w.flags.directorLull as number) ?? 45;
  if (tension >= 4 || w.time - lastIncident < lull) return;
  // quiet: fire something
  const rng = worldRng(w);
  const level = w.level;
  const options: { id: string; weight: number }[] = [
    { id: "omen", weight: 3 },
    { id: "feud", weight: cs.length >= 4 ? 2 : 0 },
    { id: "meteor", weight: level >= 2 ? 2 : 0 },
    { id: "raid", weight: level >= 2 && Object.values(w.factions).some((f) => f.isAI && f.persona === "hoarder") ? 2 : 0 },
    { id: "windfall", weight: 1 },
  ];
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = rng.next() * total;
  let pick = "omen";
  for (const o of options) {
    r -= o.weight;
    if (r <= 0) {
      pick = o.id;
      break;
    }
  }
  w.flags.directorAt = w.time;
  w.flags.directorLull = 40 + rng.range(0, 35);
  switch (pick) {
    case "omen": {
      w.nextOmenAt = Math.min(w.nextOmenAt, w.time);
      maybeSpawnOmen(w);
      break;
    }
    case "feud": {
      const a = rng.pick(cs);
      const b = rng.pick(cs.filter((c) => c.id !== a.id));
      if (a && b) {
        relation(a, b.id, -70);
        relation(b, a.id, -70);
        effect(w, "anger", a.x, a.z, { ttl: 1.5, y: 1.2 });
        effect(w, "anger", b.x, b.z, { ttl: 1.5, y: 1.2 });
        chronicle(w, `${a.name} and ${b.name} have fallen out spectacularly over a disputed hat. Keep them apart, or don't.`, "social", 3, { faction: a.faction, x: a.x, z: a.z, islandId: a.islandId });
      }
      break;
    }
    case "meteor": {
      // a rock falls from the sky near the settlement (a real projectile: it shatters into stone)
      const isl = islandById(w, w.factions[w.playerFaction].homeIslandId);
      const cf = buildingsOf(w, w.playerFaction, "campfire")[0];
      const cx = cf ? cf.x : isl.spawnPoint.x;
      const cz = cf ? cf.z : isl.spawnPoint.z;
      const a = rng.range(0, Math.PI * 2);
      const x = cx + Math.cos(a) * rng.range(4, 9);
      const z = cz + Math.sin(a) * rng.range(4, 9);
      const id = w.nextId++;
      w.projectiles[id] = { id, kind: "rock", islandId: isl.id, x, y: Math.max(heightAt(isl, x, z), isl.waterLevel) + 26, z, vx: rng.range(-1, 1), vy: -2, vz: rng.range(-1, 1), held: false, scale: 1.3, variant: rng.next(), resource: "stone", amount: 10, spin: 0 };
      effect(w, "text", x, z, { text: "LOOK UP!", color: "#ffd166", ttl: 2, y: 2 });
      chronicle(w, `A rock the size of a trollkin is falling out of the sky toward your settlement.`, "disaster", 3, { x, z, islandId: isl.id });
      break;
    }
    case "raid": {
      const h = Object.values(w.factions).find((f) => f.isAI && f.persona === "hoarder");
      if (h) h.raidCooldown = -1;
      w.flags.directorLull = 70;
      break;
    }
    case "windfall": {
      const isl = islandById(w, w.factions[w.playerFaction].homeIslandId);
      const cf = buildingsOf(w, w.playerFaction, "campfire")[0];
      const cx = cf ? cf.x : isl.spawnPoint.x;
      const cz = cf ? cf.z : isl.spawnPoint.z;
      for (let i = 0; i < 6; i++) {
        const a = rng.range(0, Math.PI * 2);
        const x = cx + Math.cos(a) * rng.range(2, 6);
        const z = cz + Math.sin(a) * rng.range(2, 6);
        const id = w.nextId++;
        w.items[id] = { id, type: i % 2 ? "food" : "wood", amount: 2, islandId: isl.id, x, z, y: Math.max(heightAt(isl, x, z), isl.waterLevel) + 8, vx: 0, vz: 0, vy: 0, reservedBy: null };
      }
      chronicle(w, `A passing sky-barge shed part of its cargo over your settlement. Finders keepers.`, "story", 2, { x: cx, z: cz, islandId: isl.id });
      break;
    }
  }
  saveRng(w, rng);
}
