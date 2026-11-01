import type { BuildingType, Faction, OverlordPersona, ResourceType, TradeOffer, World } from "./types";
import { RNG, clamp, dist2 } from "./rng";
import { BUILDINGS } from "./species";
import { buildingsOf, creaturesOf, housingCapacity, islandById, population } from "./query";
import { findFlatSpot, isBuildable } from "./terrain";
import { chronicle, effect } from "./chronicle";
import { placeBuildingRaw, spawnCreature } from "./world";
import { buildingsNear } from "./powers";

/** Personality weights used by the strategic layer. */
const PERSONA: Record<OverlordPersona, {
  buildOrder: BuildingType[];
  weights: Record<string, number>;
  tradeChance: number;
  raidChance: number;
  growthRate: number; // new creature every N seconds of surplus food
  blurb: string;
  goals: Record<string, string>;
}> = {
  hoarder: {
    buildOrder: ["storage", "lumber", "storage", "farm", "house", "workshop", "lumber", "house", "storage"],
    weights: { stockpile: 2, expand: 1.4, defend: 0.5, nature: 0.1 },
    tradeChance: 0.35,
    raidChance: 0.6,
    growthRate: 70,
    blurb: "Greedy, opportunistic and aggressive. Hoards everything and raids anyone weaker.",
    goals: { stockpile: "Filling the vaults", expand: "Grabbing more land", raid: "Eyeing up your stores", settle: "Setting up camp" },
  },
  wildkeeper: {
    buildOrder: ["farm", "storage", "house", "farm", "house", "lumber", "workshop", "farm", "house"],
    weights: { stockpile: 0.7, expand: 0.8, defend: 1.2, nature: 2 },
    tradeChance: 0.5,
    raidChance: 0,
    growthRate: 55,
    blurb: "Patient and protective. Grows slowly, defends nature, and remembers every burned tree.",
    goals: { nature: "Tending the wild", stockpile: "Preparing for winter", expand: "Planting a new grove", settle: "Finding balance" },
  },
  architect: {
    buildOrder: ["lumber", "storage", "workshop", "house", "farm", "house", "lumber", "house", "workshop"],
    weights: { stockpile: 1, expand: 1.6, defend: 0.8, nature: 0.3 },
    tradeChance: 0.4,
    raidChance: 0.1,
    growthRate: 60,
    blurb: "Analytical and ambitious. Optimises layouts and expands with ruthless efficiency.",
    goals: { expand: "Executing the master plan", stockpile: "Balancing supply chains", infrastructure: "Building infrastructure", settle: "Surveying the site" },
  },
};

export const PERSONA_INFO = PERSONA;

export function noteAIEvent(w: World, factionId: string, kind: string, delta: number, text: string) {
  const f = w.factions[factionId];
  if (!f || !f.isAI) return;
  f.aiMemory.push({ t: w.time, kind, delta, text });
  if (f.aiMemory.length > 30) f.aiMemory.shift();
  const before = f.relations[w.playerFaction] ?? 0;
  f.relations[w.playerFaction] = clamp(before + delta, -100, 100);
  const after = f.relations[w.playerFaction];
  if (before > -40 && after <= -40) chronicle(w, `${f.name} now considers you an enemy.`, "rival", 3, { faction: f.id });
  if (before < 40 && after >= 40) chronicle(w, `${f.name} now considers you a friend.`, "rival", 3, { faction: f.id });
}

export function relationLabel(v: number): string {
  if (v <= -60) return "Hostile";
  if (v <= -25) return "Wary";
  if (v < 25) return "Neutral";
  if (v < 60) return "Friendly";
  return "Allied";
}

/** Strategic think step for an AI Overlord. Runs every few seconds (staggered per faction). */
export function thinkOverlord(w: World, f: Faction, rng: RNG) {
  if (!f.isAI || !f.persona) return;
  const P = PERSONA[f.persona];
  const diff = f.difficulty === "easy" ? 0.7 : f.difficulty === "hard" ? 1.35 : 1;
  f.aiNextThink = w.time + (f.difficulty === "hard" ? 3 : f.difficulty === "easy" ? 7 : 4.5) + rng.range(0, 2);
  const isl = islandById(w, f.homeIslandId);
  const pop = population(w, f.id);
  const buildings = buildingsOf(w, f.id);
  const inProgress = buildings.filter((b) => !b.complete);
  const complete = buildings.filter((b) => b.complete);

  // Decay relation toward a persona baseline over time (forgiveness, or lingering resentment)
  const baseline = f.persona === "hoarder" ? -10 : f.persona === "wildkeeper" ? 10 : 0;
  const rel = f.relations[w.playerFaction] ?? 0;
  f.relations[w.playerFaction] = rel + (baseline - rel) * 0.01;

  // ── Job priorities from needs ──
  const foodNeed = f.stock.food < pop * 2 ? 1.6 : f.stock.food < pop * 4 ? 1.1 : 0.8;
  f.jobPriorities.farm = foodNeed;
  f.jobPriorities.gather = clamp(1 + (f.stock.wood < 20 ? 0.4 : 0) + (P.weights.stockpile - 1) * 0.3, 0.6, 1.8) * diff;
  f.jobPriorities.build = inProgress.length > 0 ? 1.4 * diff : 0.8;
  f.jobPriorities.haul = 1.1;
  f.jobPriorities.explore = f.persona === "wildkeeper" ? 0.9 : 0.5;

  // ── Settlement layer: decide next building ──
  const maxParallel = f.difficulty === "hard" ? 2 : 1;
  if (inProgress.length < maxParallel && pop >= 2) {
    const next = chooseNextBuilding(w, f, complete, pop);
    if (next) {
      const def = BUILDINGS[next];
      // Only plan it when we hold at least ~40% of the materials (so creatures gather the rest; no free buildings)
      const afford = Object.entries(def.cost).every(([k, v]) => f.stock[k as ResourceType] >= (v ?? 0) * (f.difficulty === "hard" ? 0.4 : 0.6));
      if (afford) {
        const anchor = complete.find((b) => b.type === "campfire") ?? complete[0];
        if (anchor) {
          const spot = pickBuildSpot(w, f, isl, anchor.x, anchor.z, def.footprint, rng);
          if (spot) {
            const b = placeBuildingRaw(w, next, f.id, isl.id, spot.x, spot.z, rng, false);
            if (b) {
              f.aiGoal = next === "workshop" || next === "lumber" ? "infrastructure" : next === "farm" ? "nature" : "expand";
              f.aiGoalText = P.goals[f.aiGoal] ?? P.goals.expand ?? "Expanding";
              if (rng.chance(0.5)) chronicle(w, `${f.name} has started building a ${def.name}.`, "rival", 1, { faction: f.id, x: b.x, z: b.z, islandId: isl.id });
            }
          }
        }
      } else {
        f.aiGoal = "stockpile";
        f.aiGoalText = P.goals.stockpile;
      }
    }
  }

  // ── Population growth: real food surplus → a new creature arrives (bounded by housing + campfire) ──
  const cap = 4 + housingCapacity(w, f.id) + complete.filter((b) => b.type === "campfire").length * 2;
  const growthTimer = ((f as unknown as { growthTimer?: number }).growthTimer ?? 0) + (w.time - ((f as unknown as { lastThink?: number }).lastThink ?? w.time));
  (f as unknown as { lastThink: number }).lastThink = w.time;
  (f as unknown as { growthTimer: number }).growthTimer = growthTimer;
  if (pop < cap && pop < 18 && f.stock.food >= pop * 2 + 4 && growthTimer > P.growthRate / diff) {
    (f as unknown as { growthTimer: number }).growthTimer = 0;
    f.stock.food -= 4;
    const cf = complete.find((b) => b.type === "campfire");
    const sp = cf ? findFlatSpot(isl, cf.x, cf.z, 0, rng, 30, 1.5) : null;
    const species = f.persona === "hoarder" ? (rng.chance(0.7) ? "goblin" : "trollkin") : f.persona === "wildkeeper" ? (rng.chance(0.6) ? "mushroom" : "goblin") : rng.chance(0.5) ? "trollkin" : rng.chance(0.5) ? "goblin" : "mushroom";
    const c = spawnCreature(w, species, f.id, isl.id, sp ? sp.x : isl.spawnPoint.x, sp ? sp.z : isl.spawnPoint.z, rng);
    effect(w, "sparkle", c.x, c.z, { ttl: 1, color: f.color });
    if (rng.chance(0.6)) chronicle(w, `${c.name} has joined ${f.name}'s settlement.`, "rival", 1, { faction: f.id, x: c.x, z: c.z, islandId: isl.id });
  }

  // ── Diplomacy: trade offers ──
  const me = w.factions[w.playerFaction];
  if (me && f.tradeOffers.length === 0 && rng.chance(P.tradeChance * 0.12) && w.time > 90 && (f.relations[w.playerFaction] ?? 0) > -50) {
    const offer = makeTradeOffer(w, f, me, rng);
    if (offer) {
      f.tradeOffers.push(offer);
      chronicle(w, `${f.name} offers a trade: ${offer.text}`, "rival", 3, { faction: f.id });
    }
  }
  f.tradeOffers = f.tradeOffers.filter((o) => o.expiresAt > w.time);

  // ── Raids (Hoarder, occasionally Architect when hostile) ──
  f.raidCooldown -= w.time - ((f as unknown as { lastRaidCheck?: number }).lastRaidCheck ?? w.time);
  (f as unknown as { lastRaidCheck: number }).lastRaidCheck = w.time;
  if (me && f.raidCooldown <= 0 && P.raidChance > 0 && w.meta.mode !== "sandbox") {
    const hostile = (f.relations[w.playerFaction] ?? 0) < 0;
    const tempting = me.stock.food >= 12;
    if ((hostile || rng.chance(0.3)) && tempting && rng.chance(P.raidChance * diff * 0.5)) {
      launchRaid(w, f, me, rng);
      f.raidCooldown = (f.difficulty === "hard" ? 150 : 260) + rng.range(0, 90);
    } else f.raidCooldown = 40;
  }

  // ── Score ──
  f.score = complete.length * 10 + pop * 3 + Math.floor((f.stock.wood + f.stock.stone + f.stock.food) / 5) + Math.floor(f.essence);

  // ── Milestone events (grounded in real state) ──
  const ws = complete.filter((b) => b.type === "workshop").length;
  if (ws >= 1 && !w.flags[`ai_ws_${f.id}`]) {
    w.flags[`ai_ws_${f.id}`] = 1;
    chronicle(w, `${f.name} has completed a Workshop. Their builders are getting faster.`, "rival", 3, { faction: f.id });
  }
  if (complete.length >= 8 && !w.flags[`ai_fort_${f.id}`]) {
    w.flags[`ai_fort_${f.id}`] = 1;
    chronicle(w, `${f.name}'s settlement has grown into a proper stronghold.`, "rival", 3, { faction: f.id });
  }
}

function chooseNextBuilding(w: World, f: Faction, complete: { type: BuildingType }[], pop: number): BuildingType | null {
  const P = PERSONA[f.persona!];
  const counts: Partial<Record<BuildingType, number>> = {};
  for (const b of complete) counts[b.type] = (counts[b.type] ?? 0) + 1;
  // Needs override the build order
  if (f.stock.food < pop * 1.5 && (counts.farm ?? 0) < 2) return "farm";
  if (pop > 3 + housingCapacity(w, f.id) && (counts.house ?? 0) < 4) return "house";
  for (const t of P.buildOrder) {
    const want = P.buildOrder.filter((x) => x === t).length;
    if ((counts[t] ?? 0) < want) {
      // skip until pre-reqs
      if (t === "workshop" && (counts.lumber ?? 0) < 1) continue;
      return t;
    }
  }
  return null;
}

function pickBuildSpot(w: World, f: Faction, isl: World["islands"][number], ax: number, az: number, footprint: number, rng: RNG) {
  const tries = f.persona === "architect" ? 40 : 20;
  let best: { x: number; z: number } | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < tries; i++) {
    const ang = rng.range(0, Math.PI * 2);
    const r = rng.range(3, 9);
    const x = ax + Math.cos(ang) * r;
    const z = az + Math.sin(ang) * r;
    if (!isBuildable(isl, x, z, footprint)) continue;
    if (buildingsNear(w, x, z, footprint + 1.7, isl.id).length) continue;
    let near = false;
    for (const id in w.nodes) {
      const n = w.nodes[id];
      if (n.islandId === isl.id && n.kind !== "berry" && n.kind !== "stump" && dist2(n.x, n.z, x, z) < (footprint + 0.8) ** 2) {
        near = true;
        break;
      }
    }
    if (near) continue;
    // architect prefers tidy grids close to the campfire; others are more random
    const score = f.persona === "architect" ? -Math.abs((x - ax) % 3) - Math.abs((z - az) % 3) - r * 0.2 : -r * 0.05 + rng.next();
    if (score > bestScore) {
      bestScore = score;
      best = { x, z };
    }
  }
  return best;
}

function makeTradeOffer(w: World, f: Faction, me: Faction, rng: RNG): TradeOffer | null {
  // Offer what we have plenty of, ask for what we lack
  const res: ResourceType[] = ["wood", "stone", "food"];
  const surplus = res.filter((r) => f.stock[r] > 20).sort((a, b) => f.stock[b] - f.stock[a]);
  const lacking = res.filter((r) => f.stock[r] < 12 && me.stock[r] >= 6).sort((a, b) => f.stock[a] - f.stock[b]);
  if (!surplus.length || !lacking.length || surplus[0] === lacking[0]) return null;
  const give = surplus[0];
  const want = lacking[0];
  const rel = f.relations[w.playerFaction] ?? 0;
  const generosity = f.persona === "hoarder" ? 0.7 : f.persona === "wildkeeper" ? 1.3 : 1;
  const wantAmt = rng.int(4, 8);
  const giveAmt = Math.max(2, Math.round(wantAmt * generosity * (1 + rel / 200)));
  return {
    id: w.nextId++, from: f.id, give: { [give]: giveAmt }, want: { [want]: wantAmt }, expiresAt: w.time + 120,
    text: `${giveAmt} ${give} for your ${wantAmt} ${want}.`,
  };
}

function launchRaid(w: World, f: Faction, me: Faction, rng: RNG) {
  const isl = islandById(w, me.homeIslandId);
  // Arrive at a coastal walkable cell far from the player's campfire
  const n = isl.size;
  let spot: { x: number; z: number } | null = null;
  let bd = 0;
  for (let i = 0; i < 60; i++) {
    const idx = rng.int(0, n * n - 1);
    if (isl.blocked[idx] !== 0) continue;
    const x = isl.ox + (idx % n) + 0.5;
    const z = isl.oz + Math.floor(idx / n) + 0.5;
    const d = dist2(x, z, isl.spawnPoint.x, isl.spawnPoint.z);
    if (d > bd) {
      bd = d;
      spot = { x, z };
    }
  }
  if (!spot) return;
  const raider = spawnCreature(w, "goblin", f.id, isl.id, spot.x, spot.z, rng);
  raider.traits = ["greedy", "brave"];
  raider.state = "raid";
  raider.raidTarget = { factionId: me.id, phase: "go" };
  raider.y += 5;
  effect(w, "fall", spot.x, spot.z, { ttl: 2 });
  chronicle(w, `A raider from ${f.name} — ${raider.name} — has landed on your island! Dunk them before they reach your stores.`, "rival", 3, { faction: f.id, x: spot.x, z: spot.z, islandId: isl.id });
  f.aiGoal = "raid";
  f.aiGoalText = PERSONA[f.persona!].goals.raid ?? "Raiding";
}

export function overlordSummary(w: World, f: Faction) {
  const pop = population(w, f.id);
  const complete = buildingsOf(w, f.id).filter((b) => b.complete).length;
  const creatures = creaturesOf(w, f.id);
  return { pop, complete, creatures, relation: f.relations[w.playerFaction] ?? 0, goal: f.aiGoalText, score: f.score };
}
