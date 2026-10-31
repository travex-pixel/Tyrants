import type { PowerId, World } from "./types";
import { chronicle, effect } from "./chronicle";
import { POWER_UNLOCKS } from "./world";

export function unlockAchievement(w: World, id: string): boolean {
  const a = w.achievements[id];
  if (!a || a.unlockedAt !== null) return false;
  a.unlockedAt = w.time;
  const f = w.factions[w.playerFaction];
  if (f) f.essence += a.essence;
  chronicle(w, `Achievement: ${a.title} — ${a.text} (+${a.essence} essence)`, "milestone", 2);
  w.flags.newAchievement = a.unlockedAt;
  return true;
}

export function canUnlockPower(w: World, p: PowerId): { ok: boolean; reason?: string } {
  if (w.unlockedPowers.includes(p)) return { ok: true };
  const req = POWER_UNLOCKS[p];
  const f = w.factions[w.playerFaction];
  if (!f) return { ok: false, reason: "No faction" };
  if (req.after && !w.achievements[req.after]?.unlockedAt) return { ok: false, reason: `Requires ${w.achievements[req.after]?.title}` };
  if (f.essence < req.essence) return { ok: false, reason: `Needs ${req.essence} essence (you have ${Math.floor(f.essence)})` };
  return { ok: true };
}

export function unlockPower(w: World, p: PowerId): boolean {
  if (w.unlockedPowers.includes(p)) return true;
  const chk = canUnlockPower(w, p);
  if (!chk.ok) return false;
  const f = w.factions[w.playerFaction];
  f.essence -= POWER_UNLOCKS[p].essence;
  w.unlockedPowers.push(p);
  chronicle(w, `You unlocked a new power: ${p.toUpperCase()}.`, "milestone", 3);
  return true;
}

/** Periodic checks for milestone achievements based on real world state. */
export function checkMilestones(w: World) {
  let pop = 0;
  for (const id in w.creatures) if (w.creatures[id].faction === w.playerFaction) pop++;
  if (pop >= 10) unlockAchievement(w, "pop_10");
  if (pop >= 20) unlockAchievement(w, "pop_20");
  if (w.day >= 3) unlockAchievement(w, "survive_day_3");
  if (w.stats.struck >= 10) unlockAchievement(w, "lightning_10");
  if (w.stats.blessed >= 5) unlockAchievement(w, "bless_5");
  if (w.stats.spawned > 0 && w.flags.playerSpawned) unlockAchievement(w, "first_spawn");
  void effect;
}
