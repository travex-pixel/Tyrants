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

export const LEVEL_TITLES = ["", "Petty Overlord", "Local Nuisance", "Meddler of Note", "Despot", "Tyrant", "Dread Tyrant", "Sky Sovereign", "Cloud Emperor", "World-Wrecker", "The Little Tyrant"];

export function xpForLevel(level: number): number {
  return 60 * ((level - 1) * level) / 2; // 0, 60, 180, 360, 600, 900, 1260 ...
}
export function levelForXp(xp: number): number {
  let l = 1;
  while (l < 10 && xp >= xpForLevel(l + 1)) l++;
  return l;
}
export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(10, Math.max(1, level))];
}

/** Grant Overlord XP; handles level-ups (essence bonus, titles, unlock achievements). */
export function addXp(w: World, amount: number, _reason?: string) {
  if (amount <= 0) return;
  w.xp += amount;
  const nl = levelForXp(w.xp);
  while (nl > w.level) {
    w.level++;
    const f = w.factions[w.playerFaction];
    if (f) f.essence += 4 + w.level;
    chronicle(w, `You are now a level ${w.level} ${levelTitle(w.level)}. (+${4 + w.level} essence)`, "milestone", 3);
    w.flags.levelUpAt = w.time;
    if (w.level >= 6) unlockAchievement(w, "level_6");
  }
  void _reason;
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
