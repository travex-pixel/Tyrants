import type { Dare, World } from "./types";
import { worldRng, saveRng } from "./world";
import { creaturesOf, population } from "./query";
import { chronicle, effect } from "./chronicle";
import { addXp } from "./progression";

/**
 * Dares: short timed objectives generated from what is actually on the island right now.
 * One at a time, a marker on the target, a countdown, a payout. Failure just expires quietly.
 */
export function updateDares(w: World) {
  if (w.meta.mode === "sandbox" || w.meta.mode === "challenge") return;
  const d = w.dare;
  if (d) {
    const done = checkDare(w, d);
    if (done) {
      w.dare = null;
      const f = w.factions[w.playerFaction];
      if (f) f.essence += d.essence;
      addXp(w, d.xp, "dare");
      chronicle(w, `Dare done: ${d.text} (+${d.essence} essence)`, "milestone", 3);
      if (d.x !== undefined && d.z !== undefined) effect(w, "text", d.x, d.z, { text: "DARE DONE!", color: "#ffd166", ttl: 2.2, y: 2 });
      w.nextDareAt = w.time + 70 + Math.random() * 50;
      return;
    }
    if (w.time > d.expiresAt) {
      w.dare = null;
      chronicle(w, `The dare slipped away: ${d.text.toLowerCase()}`, "story", 1);
      w.nextDareAt = w.time + 60;
    }
    return;
  }
  if (w.time < w.nextDareAt || population(w, w.playerFaction) < 3) return;
  const rng = worldRng(w);
  const cs = creaturesOf(w, w.playerFaction).filter((c) => c.species !== "boar");
  const kinds: Dare["kind"][] = ["dunk", "bowl", "tree", "gather", "bless3"];
  if (cs.length >= 4) kinds.push("friends");
  if (Object.values(w.creatures).some((c) => c.faction === "wild")) kinds.push("tame", "tame");
  const kind = rng.pick(kinds);
  const base = { startedAt: w.time, expiresAt: w.time + 75, progress: 0, target: 1, essence: 4, xp: 40 };
  let dare: Dare | null = null;
  switch (kind) {
    case "dunk": {
      const c = rng.pick(cs);
      dare = { ...base, id: `dare_${w.nextId++}`, kind, text: `Dunk ${c.name} in a lake`, targetId: c.id, x: c.x, z: c.z, baseline: (w.flags[`dunks_${c.id}`] as number) ?? 0 };
      break;
    }
    case "bowl":
      dare = { ...base, id: `dare_${w.nextId++}`, kind, text: "Bowl two creatures with one throw", essence: 5, xp: 50 };
      break;
    case "tree":
      dare = { ...base, id: `dare_${w.nextId++}`, kind, text: "Uproot a tree and throw it", baseline: w.stats.treesThrown };
      break;
    case "friends": {
      const a = rng.pick(cs);
      const b = rng.pick(cs.filter((c) => c.id !== a.id && (c.relationships[a.id] ?? 0) < 20));
      if (!b) break;
      dare = { ...base, id: `dare_${w.nextId++}`, kind, text: `Get ${a.name} and ${b.name} to be friends (use the Sun on them together)`, targetId: a.id, targetId2: b.id, expiresAt: w.time + 120, essence: 6, xp: 60 };
      break;
    }
    case "gather":
      dare = { ...base, id: `dare_${w.nextId++}`, kind, text: "Bring in 20 wood", target: 20, baseline: w.stats.gathered, expiresAt: w.time + 90 };
      break;
    case "bless3":
      dare = { ...base, id: `dare_${w.nextId++}`, kind, text: "Shine the Sun on 3 creatures at once", baseline: (w.flags.bestBless as number) ?? 0 };
      break;
    case "tame": {
      const boar = Object.values(w.creatures).find((c) => c.faction === "wild");
      if (!boar) break;
      dare = { ...base, id: `dare_${w.nextId++}`, kind, text: `Tame ${boar.name} the boar with the Sun`, targetId: boar.id, baseline: (w.flags.tamed as number) ?? 0, essence: 6, xp: 60 };
      break;
    }
  }
  saveRng(w, rng);
  if (!dare) {
    w.nextDareAt = w.time + 30;
    return;
  }
  w.dare = dare;
  chronicle(w, `A dare: ${dare.text}. ${Math.round(dare.expiresAt - w.time)} seconds.`, "milestone", 2);
}

function checkDare(w: World, d: Dare): boolean {
  switch (d.kind) {
    case "dunk": {
      const c = d.targetId !== undefined ? w.creatures[d.targetId] : undefined;
      if (!c) return false;
      d.x = c.x;
      d.z = c.z;
      d.progress = ((w.flags[`dunks_${c.id}`] as number) ?? 0) - (d.baseline ?? 0);
      return d.progress >= 1;
    }
    case "bowl":
      d.progress = Math.min(2, (w.flags.bestBowl as number) ?? 0) >= 2 && w.time - ((w.flags.bowlChainAt as number) ?? 0) < 80 && ((w.flags.bowlChainAt as number) ?? 0) >= d.startedAt ? 1 : 0;
      return d.progress >= 1;
    case "tree":
      d.progress = w.stats.treesThrown - (d.baseline ?? 0);
      return d.progress >= 1;
    case "friends": {
      const a = d.targetId !== undefined ? w.creatures[d.targetId] : undefined;
      const b = d.targetId2 !== undefined ? w.creatures[d.targetId2] : undefined;
      if (!a || !b) return false;
      d.x = a.x;
      d.z = a.z;
      d.progress = (a.relationships[b.id] ?? 0) >= 20 ? 1 : 0;
      return d.progress >= 1;
    }
    case "gather":
      d.progress = Math.min(d.target, w.stats.gathered - (d.baseline ?? 0));
      return d.progress >= d.target;
    case "bless3":
      d.progress = ((w.flags.bestBless as number) ?? 0) >= 3 && ((w.flags.bestBlessAt as number) ?? 0) >= d.startedAt ? 1 : 0;
      return d.progress >= 1;
    case "tame": {
      const c = d.targetId !== undefined ? w.creatures[d.targetId] : undefined;
      if (c) {
        d.x = c.x;
        d.z = c.z;
      }
      d.progress = ((w.flags.tamed as number) ?? 0) - (d.baseline ?? 0);
      return d.progress >= 1;
    }
  }
  return false;
}
