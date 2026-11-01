import { RNG, hashString, fbm } from "./rng";
import { generateIsland, findFlatSpot, cellOf, rebuildBlocked, heightAt } from "./terrain";
import { generateName, generateIslandName, discoveryName } from "./names";
import { SPECIES, BUILDINGS } from "./species";
import type {
  Achievement, Building, BuildingType, Creature, Discovery, Faction, GameMode, Island, JobId, OverlordPersona,
  ResourceNode, SkillId, SpeciesId, TraitId, World, PowerId,
} from "./types";
import { chronicle } from "./chronicle";

export const SIM_DT = 0.1; // 10 Hz fixed step
export const WORLD_VERSION = 3;
export const DAY_LENGTH = 360; // seconds per in-game day

export const ACHIEVEMENTS: Omit<Achievement, "unlockedAt">[] = [
  { id: "first_spawn", title: "Let There Be Goblins", text: "Spawn your first creature.", essence: 2 },
  { id: "first_throw", title: "Yeet", text: "Throw a creature.", essence: 2 },
  { id: "lake_throw", title: "Bath Time", text: "Throw a creature into a lake.", essence: 3 },
  { id: "first_building", title: "Foundations", text: "Complete your first building.", essence: 4 },
  { id: "first_house", title: "Home Sweet Hovel", text: "Complete a house.", essence: 4 },
  { id: "first_workshop", title: "Industrial Revolution", text: "Complete a workshop.", essence: 8 },
  { id: "pop_10", title: "Village", text: "Reach a population of 10.", essence: 4 },
  { id: "pop_20", title: "Town", text: "Reach a population of 20.", essence: 8 },
  { id: "wood_100", title: "Lumberjacked", text: "Gather 100 wood in total.", essence: 5 },
  { id: "lightning_10", title: "Zeus Complex", text: "Strike with lightning 10 times.", essence: 5 },
  { id: "bless_5", title: "Benevolent-ish", text: "Bless your creatures 5 times.", essence: 4 },
  { id: "discovery", title: "What's That?", text: "Discover something unusual.", essence: 6 },
  { id: "skill_5", title: "Expert", text: "A creature reaches skill level 5.", essence: 6 },
  { id: "friendship", title: "Best Mates", text: "Two creatures become close friends.", essence: 4 },
  { id: "rivalry", title: "Nemesis", text: "Two creatures become bitter enemies.", essence: 4 },
  { id: "trade", title: "Deal", text: "Complete a trade with a rival Overlord.", essence: 6 },
  { id: "raid_foiled", title: "Not Today", text: "Foil a raid by dunking the raider.", essence: 8 },
  { id: "survive_day_3", title: "Settled", text: "Reach day 3.", essence: 6 },
  { id: "tree_throw", title: "Timber!", text: "Uproot a tree and throw it.", essence: 4 },
  { id: "raid_sent", title: "Sticky Fingers", text: "Send a raiding party against a rival.", essence: 6 },
  { id: "level_6", title: "Dread Tyrant", text: "Reach Overlord level 6. Unlocks the Sky Monument.", essence: 10 },
  { id: "ascended", title: "Ascendant", text: "Complete the Sky Monument.", essence: 30 },
  { id: "bonfire", title: "Good Vibes", text: "Hold an evening bonfire.", essence: 4 },
  { id: "arrival", title: "Word Gets Around", text: "A creature arrives on its own, drawn by your food.", essence: 4 },
];

export const POWER_UNLOCKS: Record<PowerId, { essence: number; after?: string }> = {
  grab: { essence: 0 },
  spawn: { essence: 0 },
  lightning: { essence: 0 },
  bless: { essence: 0 },
  terraform: { essence: 0 },
  giant: { essence: 12 },
  clone: { essence: 10 },
  storm: { essence: 18 },
};

export interface CreateWorldOptions {
  mode: GameMode;
  seed?: number;
  name?: string;
  difficulty?: "easy" | "normal" | "hard";
  rivals?: boolean;
  starterCreatures?: number;
  mainIslandSize?: number;
  roomCode?: string;
  mpMode?: "shared" | "rivals";
  treeDensity?: number;
  lakes?: boolean;
  noRivals?: boolean;
  noTrees?: boolean;
}

export const FACTION_COLORS = ["#f2b84b", "#5fb3f0", "#f06b8b", "#8de06a"];

export function makeFaction(id: string, name: string, color: string, isAI: boolean, homeIslandId: number, difficulty: Faction["difficulty"] = "normal", persona?: OverlordPersona): Faction {
  return {
    id, name, color, isAI, persona, homeIslandId,
    stock: { wood: isAI ? 14 : 20, stone: isAI ? 6 : 6, food: isAI ? 16 : 24 },
    essence: 0,
    jobPriorities: { gather: 1, build: 1, farm: 1, haul: 1, explore: 0.6 },
    relations: {},
    aiMemory: [],
    aiNextThink: 4,
    aiGoal: "settle",
    aiGoalText: "Settling in",
    score: 0,
    difficulty,
    tradeOffers: [],
    raidCooldown: 120,
    growthTimer: 0,
    stats: { gathered: 0, built: 0, thrown: 0, struck: 0, blessed: 0, stolen: 0 },
  };
}

export function createWorld(o: CreateWorldOptions): World {
  const seed = o.seed ?? (Math.random() * 2 ** 31) | 0;
  const rng = new RNG(seed);
  const mainSize = o.mainIslandSize ?? 72;
  const w: World = {
    meta: {
      id: `w_${seed.toString(36)}_${Date.now().toString(36)}`,
      name: o.name ?? generateIslandName(rng),
      mode: o.mode,
      seed,
      createdAt: Date.now(),
      savedAt: Date.now(),
      version: WORLD_VERSION,
      roomCode: o.roomCode,
      mpMode: o.mpMode,
    },
    time: 0, tick: 0, day: 1, dayLength: DAY_LENGTH, nextId: 1,
    islands: [], creatures: {}, nodes: {}, items: {}, buildings: {}, tasks: {}, discoveries: {},
    factions: {}, players: {}, chronicle: [], effects: [],
    achievements: {}, unlockedPowers: ["grab", "spawn", "lightning", "bless", "terraform"],
    challenge: null,
    weather: { kind: "clear", until: 0, intensity: 0 },
    rngState: rng.state,
    playerFaction: "p1",
    stats: { thrown: 0, struck: 0, blessed: 0, spawned: 0, built: 0, gathered: 0, discoveries: 0, treesThrown: 0, raidsSent: 0, omens: 0, arrivals: 0 },
    flags: {},
    projectiles: {},
    skiffs: {},
    goals: { active: [], done: [], completedAt: {} },
    xp: 0,
    level: 1,
    omen: null,
    nextOmenAt: 45,
    dare: null,
    nextDareAt: 120,
  };
  for (const a of ACHIEVEMENTS) w.achievements[a.id] = { ...a, unlockedAt: null };

  // Main island
  const main = generateIsland({ id: 1, name: w.meta.name, biome: "verdant", ox: 0, oz: 0, size: mainSize, seed: seed ^ 0x1234, ownerFaction: "p1", lakes: o.lakes });
  w.islands.push(main);
  populateIsland(w, main, rng, { treeDensity: o.noTrees ? 0 : (o.treeDensity ?? 1) });

  w.factions.p1 = makeFaction("p1", "You", FACTION_COLORS[0], false, 1, o.difficulty);
  // the wild: boars and whatever else wanders in; no stores, no plans
  w.factions.wild = makeFaction("wild", "The Wild", "#8a6a3a", false, 1, o.difficulty);
  w.factions.wild.jobPriorities = { gather: 0, build: 0, farm: 0, haul: 0, explore: 0 };

  // Rival islands
  const rivals = o.rivals !== false && !o.noRivals && (o.mode === "solo" || o.mode === "friends");
  if (rivals) {
    const personas: { p: OverlordPersona; name: string; biome: Island["biome"]; color: string }[] = [
      { p: "hoarder", name: "The Hoarder", biome: "ember", color: "#e0632f" },
      { p: "wildkeeper", name: "The Wildkeeper", biome: "verdant", color: "#4fbf86" },
      { p: "architect", name: "The Architect", biome: "crystal", color: "#9b7cf0" },
    ];
    const ringR = mainSize * 0.95;
    personas.forEach((pr, i) => {
      const ang = -Math.PI / 2 + (i - 1) * (Math.PI * 0.62) + rng.range(-0.15, 0.15);
      const size = 36;
      const ox = Math.round(mainSize / 2 + Math.cos(ang) * ringR - size / 2);
      const oz = Math.round(mainSize / 2 + Math.sin(ang) * ringR - size / 2);
      const id = i + 2;
      const fid = `ai_${pr.p}`;
      const isl = generateIsland({ id, name: `${pr.name}'s Isle`, biome: pr.biome, ox, oz, size, seed: seed ^ (0x999 * id), ownerFaction: fid, lakes: true });
      w.islands.push(isl);
      populateIsland(w, isl, rng, { treeDensity: pr.biome === "verdant" ? 1.2 : 0.8, stoneBias: pr.biome === "ember" ? 1.8 : 1, crystals: pr.biome === "crystal" });
      const f = makeFaction(fid, pr.name, pr.color, true, id, o.difficulty ?? "normal", pr.p);
      f.relations.p1 = pr.p === "hoarder" ? -10 : pr.p === "wildkeeper" ? 10 : 0;
      w.factions[fid] = f;
      // AI starts with a campfire and a few creatures
      const cf = placeBuildingRaw(w, "campfire", fid, id, isl.spawnPoint.x, isl.spawnPoint.z, rng, true);
      if (cf) {
        const n = pr.p === "hoarder" ? 5 : 4;
        const mix: SpeciesId[] = pr.p === "hoarder" ? ["goblin", "goblin", "goblin", "trollkin", "goblin"] : pr.p === "wildkeeper" ? ["mushroom", "mushroom", "goblin", "trollkin"] : ["trollkin", "trollkin", "goblin", "mushroom"];
        for (let k = 0; k < n; k++) {
          const sp = findFlatSpot(isl, cf.x, cf.z, 0, rng, 30, 1.5) ?? isl.spawnPoint;
          spawnCreature(w, mix[k % mix.length], fid, id, sp.x + rng.range(-1, 1), sp.z + rng.range(-1, 1), rng);
        }
      }
    });
  }

  // Starter creatures for the player
  const starters = o.starterCreatures ?? (o.mode === "sandbox" ? 8 : 7);
  const starterMix: SpeciesId[] = ["goblin", "goblin", "trollkin", "mushroom", "goblin", "mushroom", "trollkin", "goblin"];
  for (let i = 0; i < starters; i++) {
    const sp = findFlatSpot(main, main.spawnPoint.x, main.spawnPoint.z, 0, rng, 30, 1.5) ?? main.spawnPoint;
    spawnCreature(w, starterMix[i % starterMix.length], "p1", 1, sp.x + rng.range(-1.2, 1.2), sp.z + rng.range(-1.2, 1.2), rng);
  }
  // Player starts with a campfire so creatures have somewhere to eat and drop resources.
  placeBuildingRaw(w, "campfire", "p1", 1, main.spawnPoint.x, main.spawnPoint.z, rng, true);

  w.rngState = rng.state;
  chronicle(w, `${w.meta.name} drifts out of the clouds. An entire world. Yours to ruin.`, "milestone", 3);
  return w;
}

export function populateIsland(w: World, isl: Island, rng: RNG, opts: { treeDensity?: number; stoneBias?: number; crystals?: boolean } = {}) {
  const density = opts.treeDensity ?? 1;
  const n = isl.size;
  const obstacles = new Set<number>();
  const taken = new Set<number>();
  const spawnCell = cellOf(isl, isl.spawnPoint.x, isl.spawnPoint.z);
  const spawnIdx = spawnCell ? spawnCell.cz * n + spawnCell.cx : -1;

  const tryPlace = (kind: ResourceNode["kind"], prob: number, filter: (h: number, cx: number, cz: number) => boolean, blocking: boolean, make: (x: number, z: number) => Partial<ResourceNode>) => {
    for (let cz = 2; cz < n - 2; cz++) {
      for (let cx = 2; cx < n - 2; cx++) {
        const i = cz * n + cx;
        if (isl.blocked[i] !== 0 || taken.has(i)) continue;
        if (spawnIdx >= 0) {
          const dx = cx - (spawnIdx % n);
          const dz = cz - Math.floor(spawnIdx / n);
          if (dx * dx + dz * dz < (isl.size > 50 ? 72 : 20)) continue; // keep the spawn clearing open
        }
        const x = isl.ox + cx + 0.5;
        const z = isl.oz + cz + 0.5;
        const h = heightAt(isl, x, z);
        if (!filter(h, cx, cz)) continue;
        if (rng.next() > prob) continue;
        const node: ResourceNode = {
          id: w.nextId++, kind, resource: "wood", islandId: isl.id, x: x + rng.range(-0.3, 0.3), z: z + rng.range(-0.3, 0.3),
          amount: 10, maxAmount: 10, regrow: 0, scale: rng.range(0.85, 1.25), variant: rng.next(), reservedBy: null,
          ...make(x, z),
        };
        w.nodes[node.id] = node;
        taken.add(i);
        if (blocking) obstacles.add(i);
      }
    }
  };

  const forestSeed = rng.int(1, 1e6);
  // Trees: clustered via noise, denser inland
  tryPlace("tree", 0.42 * density, (h, cx, cz) => {
    const f = fbm(cx * 0.08, cz * 0.08, forestSeed, 3);
    return h > isl.waterLevel + 0.25 && h < 4.6 && f > 0.55;
  }, true, () => ({ resource: "wood", amount: 12, maxAmount: 12, regrow: 0 }));
  // Rocks: higher ground
  tryPlace("rock", 0.08 * (opts.stoneBias ?? 1), (h) => h > 2.2, true, () => ({ resource: "stone", amount: 16, maxAmount: 16, regrow: 0, scale: rng.range(0.8, 1.5) }));
  // Berry bushes near water/low land
  tryPlace("berry", 0.07, (h) => h > isl.waterLevel + 0.1 && h < 1.8, false, () => ({ resource: "food", amount: 5, maxAmount: 5, regrow: 1.5, scale: rng.range(0.8, 1.1) }));
  if (opts.crystals) tryPlace("crystal", 0.05, (h) => h > 2.5, true, () => ({ resource: "stone", amount: 20, maxAmount: 20, regrow: 0 }));

  // Discoveries
  const kinds: Discovery["kind"][] = ["cave", "glowplant", "ruins", "shrine", "crystalVein"];
  const count = isl.size > 50 ? 4 : 2;
  for (let i = 0; i < count; i++) {
    const kind = kinds[(i + rng.int(0, 4)) % kinds.length];
    const sp = findFlatSpot(isl, isl.center.x, isl.center.z, 1, rng, 60, isl.size * 0.22);
    if (!sp) continue;
    const d: Discovery = { id: w.nextId++, kind, islandId: isl.id, x: sp.x, z: sp.z, found: false, name: discoveryName(rng, kind), essence: kind === "crystalVein" ? 8 : kind === "ruins" ? 6 : 4 };
    w.discoveries[d.id] = d;
    const c = cellOf(isl, sp.x, sp.z);
    if (c && kind !== "glowplant") obstacles.add(c.cz * n + c.cx);
  }
  rebuildBlocked(isl, obstacles);
}

export function rollTraits(rng: RNG, species: SpeciesId): TraitId[] {
  const bias = SPECIES[species].traitBias;
  const ids = Object.keys(bias) as TraitId[];
  const out: TraitId[] = [];
  const count = rng.chance(0.3) ? 3 : 2;
  const pool = ids.slice();
  for (let i = 0; i < count && pool.length; i++) {
    const total = pool.reduce((s, t) => s + (bias[t] ?? 1), 0);
    let r = rng.next() * total;
    let chosen = pool[0];
    for (const t of pool) {
      r -= bias[t] ?? 1;
      if (r <= 0) {
        chosen = t;
        break;
      }
    }
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
    // avoid contradictory pairs
    if (chosen === "lazy") pool.splice(pool.indexOf("hardworking"), pool.indexOf("hardworking") >= 0 ? 1 : 0);
    if (chosen === "hardworking") pool.splice(pool.indexOf("lazy"), pool.indexOf("lazy") >= 0 ? 1 : 0);
  }
  return out;
}

export function spawnCreature(w: World, species: SpeciesId, faction: string, islandId: number, x: number, z: number, rng: RNG, nameOverride?: string): Creature {
  const taken = new Set<string>();
  for (const id in w.creatures) taken.add(w.creatures[id].name);
  const skills: Record<SkillId, number> = { woodcutting: 0, construction: 0, farming: 0, exploration: 0, gathering: 0 };
  const c: Creature = {
    id: w.nextId++,
    name: nameOverride ?? generateName(rng, species, taken),
    species, faction, islandId,
    age: 0,
    traits: rollTraits(rng, species),
    x, z, y: 0, vx: 0, vz: 0, vy: 0,
    heading: rng.range(0, Math.PI * 2),
    speedMul: 1, scale: 1,
    health: 100, hunger: rng.range(10, 35), energy: rng.range(70, 100), social: rng.range(50, 90), happiness: 70,
    skills,
    state: "idle", stateTime: 0, decisionCooldown: rng.range(0.2, 1.5),
    taskId: null, path: null, pathIndex: 0, target: null, stuckTime: 0,
    carrying: null, homeId: null, relationships: {}, memory: [], partnerId: null, followId: null,
    blessedUntil: 0, held: false, bornAt: w.time, variant: rng.next(), mood: "neutral", raidTarget: null,
  };
  w.creatures[c.id] = c;
  w.stats.spawned++;
  return c;
}

/** Places a building without validation of resources (used for starts, sandbox instant builds). */
export function placeBuildingRaw(w: World, type: BuildingType, faction: string, islandId: number, x: number, z: number, rng: RNG, complete: boolean): Building | null {
  const def = BUILDINGS[type];
  const isl = w.islands.find((i) => i.id === islandId);
  if (!isl) return null;
  const b: Building = {
    id: w.nextId++, type, faction, islandId, x, z, rotation: rng.range(0, Math.PI * 2),
    cost: { ...def.cost }, delivered: complete ? { ...def.cost } : {}, progress: complete ? 1 : 0, complete, work: def.work, workDone: complete ? def.work : 0,
    occupants: [], cropTimer: 0, level: 1, placedAt: w.time, hp: 100,
  };
  w.buildings[b.id] = b;
  markBuildingCells(w, b, true);
  return b;
}

export function markBuildingCells(w: World, b: Building, block: boolean) {
  const isl = w.islands.find((i) => i.id === b.islandId);
  if (!isl) return;
  const r = BUILDINGS[b.type].footprint - 1; // campfire footprint 1 → single cell
  const c = cellOf(isl, b.x, b.z);
  if (!c) return;
  if (b.type === "campfire") return; // campfire is walkable (creatures sit around it)
  for (let dz = -r; dz <= r; dz++)
    for (let dx = -r; dx <= r; dx++) {
      const cx = c.cx + dx;
      const cz = c.cz + dz;
      if (cx < 0 || cz < 0 || cx >= isl.size || cz >= isl.size) continue;
      const i = cz * isl.size + cx;
      if (isl.blocked[i] === 2) continue;
      isl.blocked[i] = block ? 1 : 0;
    }
  isl.navVersion++;
}

/** Rebuild blocked cells for an island from terrain + current obstacles (nodes, buildings, discoveries). */
export function rebuildIslandNav(w: World, isl: Island) {
  const obstacles = new Set<number>();
  const n = isl.size;
  for (const id in w.nodes) {
    const nd = w.nodes[id];
    if (nd.islandId !== isl.id || nd.amount <= 0) continue;
    if (nd.kind === "berry" || nd.kind === "crop" || nd.kind === "stump") continue;
    const c = cellOf(isl, nd.x, nd.z);
    if (c) obstacles.add(c.cz * n + c.cx);
  }
  for (const id in w.discoveries) {
    const d = w.discoveries[id];
    if (d.islandId !== isl.id || d.kind === "glowplant") continue;
    const c = cellOf(isl, d.x, d.z);
    if (c) obstacles.add(c.cz * n + c.cx);
  }
  for (const id in w.buildings) {
    const b = w.buildings[id];
    if (b.islandId !== isl.id || b.type === "campfire") continue;
    const r = BUILDINGS[b.type].footprint - 1;
    const c = cellOf(isl, b.x, b.z);
    if (!c) continue;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const cx = c.cx + dx;
        const cz = c.cz + dz;
        if (cx >= 0 && cz >= 0 && cx < n && cz < n) obstacles.add(cz * n + cx);
      }
  }
  rebuildBlocked(isl, obstacles);
}

export function worldRng(w: World): RNG {
  const r = new RNG(1);
  r.state = w.rngState;
  return r;
}
export function saveRng(w: World, r: RNG) {
  w.rngState = r.state;
}

export const JOB_NAMES: Record<JobId, string> = { gather: "Gather", build: "Build", farm: "Farm", haul: "Haul", explore: "Explore" };
export const seedFromString = hashString;
