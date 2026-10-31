import type { World } from "./types";
import { Engine } from "./engine";
import { chronicle } from "./chronicle";
import { population } from "./query";

export interface OfflineReport {
  elapsedReal: number; // seconds since last save
  simulated: number; // seconds actually simulated
  abstracted: number; // seconds covered by bounded abstract progression
  lines: string[];
  events: World["chronicle"];
}

/**
 * Bounded offline progression. We simulate real ticks for up to `maxSimSeconds` of world time
 * (fast, deterministic and uses the actual systems), then apply a gentle abstract summary for
 * longer absences. Nothing catastrophic can happen while the player is away.
 */
export function applyOfflineProgress(w: World, nowMs = Date.now(), maxSimSeconds = 240): OfflineReport {
  const elapsedReal = Math.max(0, (nowMs - w.meta.savedAt) / 1000);
  const report: OfflineReport = { elapsedReal, simulated: 0, abstracted: 0, lines: [], events: [] };
  if (elapsedReal < 20) return report;
  const beforeChronicle = w.chronicle.length;
  const beforeStock = { ...w.factions[w.playerFaction].stock };
  const beforePop = population(w, w.playerFaction);
  const beforeBuildings = Object.values(w.buildings).filter((b) => b.complete).length;

  // Safety: top up starving creatures a little so a day away doesn't wipe the settlement
  for (const id in w.creatures) {
    const c = w.creatures[id];
    if (c.hunger > 60) c.hunger = 60;
    if (c.energy < 50) c.energy = 50;
  }

  const sim = Math.min(elapsedReal, maxSimSeconds);
  const engine = new Engine(w);
  const steps = Math.floor(sim / 0.1);
  for (let i = 0; i < steps; i++) engine.step();
  report.simulated = sim;

  // Abstract remainder (bounded to 8 hours of "soft" progression)
  const rest = Math.min(Math.max(0, elapsedReal - sim), 8 * 3600);
  if (rest > 60) {
    report.abstracted = rest;
    const f = w.factions[w.playerFaction];
    const pop = population(w, w.playerFaction);
    const hours = rest / 3600;
    // gentle, capped gains: creatures keep doing what they do, but no more than a modest amount
    f.stock.wood += Math.min(40, Math.round(pop * 2.5 * hours));
    f.stock.food = Math.min(f.stock.food + Math.round(pop * 1.5 * hours), Math.max(f.stock.food, pop * 6));
    f.stock.stone += Math.min(15, Math.round(pop * 0.8 * hours));
    for (const id in w.creatures) {
      const c = w.creatures[id];
      c.hunger = Math.min(c.hunger, 40);
      c.energy = Math.max(c.energy, 80);
      c.skills.gathering += Math.min(10, Math.round(hours * 3));
    }
    // AI rivals progress a little too
    for (const fid in w.factions) {
      const r = w.factions[fid];
      if (!r.isAI) continue;
      r.stock.wood += Math.min(30, Math.round(population(w, fid) * 2 * hours));
      r.stock.food += Math.min(20, Math.round(population(w, fid) * 1.5 * hours));
    }
  }
  w.meta.savedAt = nowMs;

  // Briefing
  const f = w.factions[w.playerFaction];
  const dStock = { wood: f.stock.wood - beforeStock.wood, stone: f.stock.stone - beforeStock.stone, food: f.stock.food - beforeStock.food };
  const dPop = population(w, w.playerFaction) - beforePop;
  const dBuild = Object.values(w.buildings).filter((b) => b.complete).length - beforeBuildings;
  const away = elapsedReal < 3600 ? `${Math.round(elapsedReal / 60)} minutes` : elapsedReal < 86400 ? `${(elapsedReal / 3600).toFixed(1)} hours` : `${(elapsedReal / 86400).toFixed(1)} days`;
  report.lines.push(`You were away for ${away}. The world kept turning.`);
  const parts: string[] = [];
  if (dStock.wood) parts.push(`${dStock.wood > 0 ? "+" : ""}${dStock.wood} wood`);
  if (dStock.stone) parts.push(`${dStock.stone > 0 ? "+" : ""}${dStock.stone} stone`);
  if (dStock.food) parts.push(`${dStock.food > 0 ? "+" : ""}${dStock.food} food`);
  if (parts.length) report.lines.push(`Your stores changed: ${parts.join(", ")}.`);
  if (dPop !== 0) report.lines.push(dPop > 0 ? `${dPop} new creature${dPop > 1 ? "s" : ""} joined the settlement.` : `${-dPop} creature${dPop < -1 ? "s" : ""} wandered off.`);
  if (dBuild > 0) report.lines.push(`${dBuild} building${dBuild > 1 ? "s were" : " was"} completed.`);
  report.events = w.chronicle.slice(beforeChronicle).filter((e) => e.importance >= 2).slice(-6);
  chronicle(w, `The Overlord returns after ${away}.`, "player", 2);
  return report;
}
