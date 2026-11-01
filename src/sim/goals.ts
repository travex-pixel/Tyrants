import type { World } from "./types";
import { population, housingCapacity, buildingsOf } from "./query";
import { skillLevel } from "./species";
import { chronicle, effect } from "./chronicle";
import { addXp } from "./progression";

/**
 * Decrees: a curated chain of small goals that always gives the player a "next thing".
 * Three are active at a time; each is checked against the real world state.
 */
export interface GoalDef {
  id: string;
  title: string;
  text: string;
  tier: number;
  essence: number;
  xp: number;
  /** returns [current, target] */
  progress: (w: World) => [number, number];
}

const pf = (w: World) => w.factions[w.playerFaction];
const completed = (w: World, type: string) => buildingsOf(w, w.playerFaction).filter((b) => b.complete && b.type === type).length;
const anyPlayerCreature = (w: World, pred: (c: World["creatures"][number]) => boolean) => Object.values(w.creatures).some((c) => c.faction === w.playerFaction && pred(c));

export const GOALS: GoalDef[] = [
  { id: "g_place", title: "Plan a building", text: "Tap Build, pick anything, tap the ground.", tier: 1, essence: 2, xp: 20, progress: (w) => [buildingsOf(w, w.playerFaction).length > 1 ? 1 : 0, 1] },
  { id: "g_throw", title: "Make an entrance", text: "Drag a creature and flick it.", tier: 1, essence: 2, xp: 20, progress: (w) => [Math.min(1, w.stats.thrown), 1] },
  { id: "g_lumber", title: "Industry", text: "Place a Lumber Camp and let your creatures build it.", tier: 1, essence: 4, xp: 40, progress: (w) => [completed(w, "lumber"), 1] },
  { id: "g_bless", title: "Benevolence", text: "Shine the Sun on a group of creatures.", tier: 1, essence: 2, xp: 20, progress: (w) => [Math.min(1, w.stats.blessed), 1] },
  { id: "g_build2", title: "Settling in", text: "Complete 2 buildings.", tier: 1, essence: 4, xp: 40, progress: (w) => [Math.min(2, buildingsOf(w, w.playerFaction).filter((b) => b.complete && b.type !== "campfire").length), 2] },
  { id: "g_spawn3", title: "Populate", text: "Make 3 new friends with the Friend button.", tier: 2, essence: 3, xp: 30, progress: (w) => [Math.min(3, (w.flags.playerSpawns as number) ?? 0), 3] },
  { id: "g_wood40", title: "Stockpile", text: "Hold 40 wood in your stores.", tier: 1, essence: 3, xp: 30, progress: (w) => [Math.min(40, Math.floor(pf(w).stock.wood)), 40] },
  { id: "g_dunk", title: "Bath time", text: "Throw a creature into a lake.", tier: 1, essence: 3, xp: 30, progress: (w) => [w.achievements.lake_throw?.unlockedAt !== null ? 1 : 0, 1] },
  { id: "g_storage", title: "Somewhere to put it", text: "Complete a Storage Hut.", tier: 2, essence: 4, xp: 50, progress: (w) => [completed(w, "storage"), 1] },
  { id: "g_house", title: "A roof", text: "Complete a Small House.", tier: 2, essence: 5, xp: 60, progress: (w) => [completed(w, "house"), 1] },
  { id: "g_pop10", title: "Village", text: "Reach a population of 10.", tier: 2, essence: 4, xp: 50, progress: (w) => [Math.min(10, population(w, w.playerFaction)), 10] },
  { id: "g_farm", title: "Harvest", text: "Complete a Farm.", tier: 2, essence: 5, xp: 60, progress: (w) => [completed(w, "farm"), 1] },
  { id: "g_tree", title: "Timber!", text: "Uproot a tree with Grab and throw it.", tier: 2, essence: 4, xp: 50, progress: (w) => [Math.min(1, w.stats.treesThrown), 1] },
  { id: "g_discovery", title: "Curiosity", text: "Have a creature discover something unusual.", tier: 2, essence: 5, xp: 60, progress: (w) => [Math.min(1, w.stats.discoveries), 1] },
  { id: "g_food40", title: "Full bellies", text: "Hold 40 food in your stores.", tier: 2, essence: 4, xp: 50, progress: (w) => [Math.min(40, Math.floor(pf(w).stock.food)), 40] },
  { id: "g_skill3", title: "Apprentice", text: "A creature reaches skill level 3 in anything.", tier: 2, essence: 4, xp: 50, progress: (w) => [anyPlayerCreature(w, (c) => Object.values(c.skills).some((x) => skillLevel(x) >= 3)) ? 1 : 0, 1] },
  { id: "g_friends", title: "Best mates", text: "Two of your creatures become close friends (relationship 50+).", tier: 2, essence: 4, xp: 50, progress: (w) => [anyPlayerCreature(w, (c) => Object.values(c.relationships).some((r) => r >= 50)) ? 1 : 0, 1] },
  { id: "g_arrival", title: "Word gets around", text: "Attract a new arrival with surplus food and spare housing.", tier: 2, essence: 5, xp: 60, progress: (w) => [Math.min(1, w.stats.arrivals), 1] },
  { id: "g_omen", title: "Decide", text: "Resolve an omen.", tier: 2, essence: 3, xp: 40, progress: (w) => [Math.min(1, w.stats.omens), 1] },
  { id: "g_bonfire", title: "Good vibes", text: "Keep spirits high enough for an evening bonfire.", tier: 2, essence: 4, xp: 50, progress: (w) => [w.achievements.bonfire?.unlockedAt !== null ? 1 : 0, 1] },
  { id: "g_workshop", title: "Industrial revolution", text: "Complete a Workshop.", tier: 3, essence: 8, xp: 100, progress: (w) => [completed(w, "workshop"), 1] },
  { id: "g_pop16", title: "Town", text: "Reach a population of 16.", tier: 3, essence: 6, xp: 80, progress: (w) => [Math.min(16, population(w, w.playerFaction)), 16] },
  { id: "g_houses3", title: "Suburbia", text: "House 9 creatures (3 houses).", tier: 3, essence: 6, xp: 80, progress: (w) => [Math.min(9, housingCapacity(w, w.playerFaction)), 9] },
  { id: "g_trade", title: "Deal", text: "Complete a trade with a rival Overlord.", tier: 3, essence: 6, xp: 80, progress: (w) => [w.achievements.trade?.unlockedAt !== null ? 1 : 0, 1] },
  { id: "g_raid", title: "Sticky fingers", text: "Send a raiding party against a rival.", tier: 3, essence: 6, xp: 80, progress: (w) => [Math.min(1, w.stats.raidsSent), 1] },
  { id: "g_score", title: "Top of the heap", text: "Out-score every rival Overlord.", tier: 3, essence: 10, xp: 120, progress: (w) => [Object.values(w.factions).filter((f) => f.isAI).every((f) => f.score < pf(w).score) && Object.values(w.factions).some((f) => f.isAI) ? 1 : 0, 1] },
  { id: "g_day3", title: "Settled", text: "Reach day 3.", tier: 3, essence: 6, xp: 80, progress: (w) => [Math.min(3, w.day), 3] },
  { id: "g_level6", title: "Dread Tyrant", text: "Reach Overlord level 6.", tier: 3, essence: 8, xp: 0, progress: (w) => [Math.min(6, w.level), 6] },
  { id: "g_totem", title: "Ego", text: "Complete a Totem.", tier: 3, essence: 6, xp: 80, progress: (w) => [completed(w, "totem"), 1] },
  { id: "g_monument", title: "Ascend", text: "Complete the Sky Monument.", tier: 4, essence: 30, xp: 300, progress: (w) => [completed(w, "monument"), 1] },
];

export function goalById(id: string): GoalDef | undefined {
  return GOALS.find((g) => g.id === id);
}

/** Keep three goals active (lowest tiers first) and complete any that are satisfied. Called once per second. */
export function updateGoals(w: World) {
  const g = w.goals;
  if (w.meta.mode === "sandbox") return;
  // fill active slots
  for (const def of GOALS) {
    if (g.active.length >= 3) break;
    if (g.active.includes(def.id) || g.done.includes(def.id)) continue;
    if (def.id === "g_monument" && w.level < 6) continue;
    g.active.push(def.id);
  }
  for (const id of [...g.active]) {
    const def = goalById(id);
    if (!def) {
      g.active = g.active.filter((x) => x !== id);
      continue;
    }
    const [cur, target] = def.progress(w);
    if (cur >= target) {
      g.active = g.active.filter((x) => x !== id);
      g.done.push(id);
      g.completedAt[id] = w.time;
      const f = w.factions[w.playerFaction];
      if (f) f.essence += def.essence;
      addXp(w, def.xp, `decree ${def.title}`);
      chronicle(w, `Decree fulfilled: ${def.title}. (+${def.essence} essence)`, "milestone", 2);
      w.flags.goalJustDone = w.time;
      w.flags.lastGoalDone = id as unknown as number; // string stored for UI; typed loosely
      const cf = Object.values(w.buildings).find((b) => b.faction === w.playerFaction && b.type === "campfire");
      if (cf) effect(w, "text", cf.x, cf.z, { text: `✦ ${def.title}`, color: "#ffd166", ttl: 2.5, y: 2 });
    }
  }
}
