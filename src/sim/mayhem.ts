import type { Building, ResourceType, World } from "./types";
import type { RNG } from "./rng";
import { chronicle, effect } from "./chronicle";
import { addXp } from "./progression";
import { heightAt } from "./terrain";
import { removeTask } from "./tasks";
import { remember } from "./creature";
import { markBuildingCells } from "./world";
import { BUILDINGS } from "./species";
import { noteAIEvent } from "./overlords";

/** Mayhem: a decaying chaos meter. Chains of chaos within seconds pay out essence/XP and a legendary line. */
export function addMayhem(w: World, amount: number, x?: number, z?: number) {
  const before = (w.flags.mayhem as number) ?? 0;
  const now = before + amount;
  w.flags.mayhem = now;
  w.flags.mayhemAt = w.time;
  const peak = (w.flags.mayhemPeak as number) ?? 0;
  for (const [th, label, ess] of [[6, "CHAOS!", 2], [12, "MAYHEM!", 4], [20, "LEGENDARY MAYHEM", 8]] as [number, string, number][]) {
    if (before < th && now >= th) {
      if (x !== undefined && z !== undefined) effect(w, "text", x, z, { text: label, color: th >= 20 ? "#ff8fab" : "#ffd166", ttl: 2, y: 2.4 });
      const f = w.factions[w.playerFaction];
      if (f) f.essence += ess;
      addXp(w, ess * 6, "mayhem");
      if (th >= 12) chronicle(w, th >= 20 ? `A cascade of destruction swept the island. Bards will sing of it, badly.` : `Mayhem erupted across the settlement. Nobody is sure who started it.`, "disaster", 3, { x, z });
    }
  }
  if (now > peak) w.flags.mayhemPeak = now;
}
export function decayMayhem(w: World) {
  const m = (w.flags.mayhem as number) ?? 0;
  if (m <= 0) return;
  const since = w.time - ((w.flags.mayhemAt as number) ?? 0);
  if (since > 4) w.flags.mayhem = Math.max(0, m - 1.5);
}

/** Damage a building; at 0 hp it collapses into rubble (loose items) and the settlement mourns. */
export function damageBuilding(w: World, b: Building, amount: number, cause: string, rng: RNG) {
  if (!w.buildings[b.id]) return;
  b.hp = Math.max(0, (b.hp ?? 100) - amount);
  b.struck = w.time;
  if (b.hp > 0) return;
  // collapse
  const isl = w.islands.find((i) => i.id === b.islandId)!;
  for (const k in b.delivered) {
    const res = k as ResourceType;
    let amt = Math.floor((b.delivered[res] ?? 0) * 0.5);
    while (amt > 0) {
      const chunk = Math.min(3, amt);
      amt -= chunk;
      const a = rng.range(0, Math.PI * 2);
      const x = b.x + Math.cos(a) * rng.range(0.5, 2.2);
      const z = b.z + Math.sin(a) * rng.range(0.5, 2.2);
      const id = w.nextId++;
      w.items[id] = { id, type: res, amount: chunk, islandId: b.islandId, x, z, y: Math.max(heightAt(isl, x, z), isl.waterLevel) + 1, vx: Math.cos(a), vz: Math.sin(a), vy: 2, reservedBy: null };
    }
  }
  for (const id in w.tasks) if (w.tasks[id].buildingId === b.id) removeTask(w, Number(id), false);
  for (const id in w.creatures) {
    const c = w.creatures[id];
    if (c.homeId === b.id) c.homeId = null;
    if (c.faction === b.faction && c.islandId === b.islandId) {
      c.happiness = Math.max(0, c.happiness - 12);
      remember(c, "struck", 0.6, undefined, b.x, b.z, w.time);
    }
  }
  const keepFire = b.type === "campfire" && Object.values(w.buildings).filter((o) => o.faction === b.faction && o.type === "campfire").length === 1;
  if (keepFire) {
    b.hp = 30; // the last campfire never truly dies; the embers survive
    return;
  }
  markBuildingCells(w, b, false);
  delete w.buildings[b.id];
  effect(w, "crash", b.x, b.z, { ttl: 1.5, size: 1.6 });
  effect(w, "text", b.x, b.z, { text: "COLLAPSED!", color: "#ff6b6b", ttl: 2, y: 1.8 });
  const f = w.factions[b.faction];
  chronicle(w, `${f?.name ?? "Someone"}'s ${BUILDINGS[b.type].name} collapsed (${cause}). Half the materials lie in the rubble.`, "disaster", b.faction === w.playerFaction ? 3 : 2, { faction: b.faction, x: b.x, z: b.z, islandId: b.islandId });
  if (f && f.isAI) noteAIEvent(w, f.id, "building_lost", cause.includes("hand") || cause.includes("lightning") || cause.includes("rock") ? -12 : -4, `My ${BUILDINGS[b.type].name} collapsed: ${cause}.`);
  if (b.faction === w.playerFaction) addMayhem(w, 4, b.x, b.z);
}
