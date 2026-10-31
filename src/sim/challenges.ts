import type { ChallengeState, SpeciesId, World } from "./types";
import { worldRng, saveRng, spawnCreature, placeBuildingRaw } from "./world";
import { findFlatSpot } from "./terrain";
import { chronicle } from "./chronicle";
import { population } from "./query";
import { applyCommand } from "./powers";

export interface ChallengeDef {
  id: string;
  title: string;
  tagline: string;
  rules: string[];
  duration: number; // seconds, 0 = until the player ends it
  scoreLabel: string;
  setup: (w: World) => void;
  score: (w: World) => number;
  /** Return "won"/"lost" to end early, or null to continue. */
  check: (w: World) => "won" | "lost" | null;
  worldOptions: Partial<import("./world").CreateWorldOptions>;
}

export const CHALLENGES: ChallengeDef[] = [
  {
    id: "hundred_goblins",
    title: "100 Goblins",
    tagline: "Spawn a hundred goblins on a tiny island. See what happens.",
    rules: ["100 goblins, one small island, no rivals.", "Score: food gathered + buildings completed in 5 minutes.", "Keep as many of them fed as you can."],
    duration: 300,
    scoreLabel: "Chaos score",
    worldOptions: { mainIslandSize: 40, noRivals: true, starterCreatures: 0 },
    setup: (w) => {
      const rng = worldRng(w);
      const isl = w.islands[0];
      for (let i = 0; i < 100; i++) {
        const sp = findFlatSpot(isl, isl.spawnPoint.x, isl.spawnPoint.z, 0, rng, 20, 0.5) ?? isl.spawnPoint;
        spawnCreature(w, "goblin", "p1", isl.id, sp.x + rng.range(-2, 2), sp.z + rng.range(-2, 2), rng);
      }
      w.factions.p1.stock.food = 60;
      saveRng(w, rng);
    },
    score: (w) => w.stats.gathered + w.stats.built * 25 + Math.round(avgHappiness(w) / 2),
    check: () => null,
  },
  {
    id: "no_trees",
    title: "No Trees",
    tagline: "Build a civilisation without a single tree.",
    rules: ["The island has no trees. Wood only comes from lightning-blasted stumps, trades or raids you foil.", "Complete a Storage Hut, a Farm and a House.", "Untimed."],
    duration: 0,
    scoreLabel: "Buildings",
    worldOptions: { noTrees: true, starterCreatures: 6 },
    setup: (w) => {
      w.factions.p1.stock.wood = 12;
      w.factions.p1.stock.stone = 10;
    },
    score: (w) => Object.values(w.buildings).filter((b) => b.faction === "p1" && b.complete).length,
    check: (w) => {
      const done = new Set(Object.values(w.buildings).filter((b) => b.faction === "p1" && b.complete).map((b) => b.type));
      return done.has("storage") && done.has("farm") && done.has("house") ? "won" : null;
    },
  },
  {
    id: "the_giant",
    title: "The Giant",
    tagline: "One creature is enormous. Everyone else must adapt.",
    rules: ["One Trollkin is a 2.4× giant who eats triple and works triple.", "Survive 4 minutes without anyone fainting.", "Score: resources gathered."],
    duration: 240,
    scoreLabel: "Gathered",
    worldOptions: { noRivals: true, starterCreatures: 7 },
    setup: (w) => {
      const rng = worldRng(w);
      const isl = w.islands[0];
      const g = spawnCreature(w, "trollkin", "p1", isl.id, isl.spawnPoint.x + 2, isl.spawnPoint.z, rng, "Big Mungo");
      g.scale = 2.4;
      g.traits = ["hardworking", "clumsy"];
      w.unlockedPowers.push("giant");
      saveRng(w, rng);
    },
    score: (w) => w.stats.gathered,
    check: (w) => (w.chronicle.some((e) => e.text.includes("fainted") && e.t > (w.challenge?.startedAt ?? 0)) ? "lost" : null),
  },
  {
    id: "peaceful_kingdom",
    title: "Peaceful Kingdom",
    tagline: "Build without a single destructive power.",
    rules: ["Lightning, Storm and throwing are forbidden. Use one and you lose.", "Reach a population of 12 and complete 5 buildings.", "Untimed."],
    duration: 0,
    scoreLabel: "Buildings",
    worldOptions: { starterCreatures: 6 },
    setup: (w) => {
      w.unlockedPowers = ["grab", "spawn", "bless", "terraform"];
      w.flags.peaceful = 1;
    },
    score: (w) => Object.values(w.buildings).filter((b) => b.faction === "p1" && b.complete).length * 10 + population(w, "p1"),
    check: (w) => {
      if (w.stats.struck > 0 || w.stats.thrown > 0) return "lost";
      return population(w, "p1") >= 12 && Object.values(w.buildings).filter((b) => b.faction === "p1" && b.complete).length >= 5 ? "won" : null;
    },
  },
  {
    id: "great_disaster",
    title: "The Great Disaster",
    tagline: "Survive a sequence of environmental events.",
    rules: ["Every 45 seconds a random disaster strikes: lightning volleys, storms, or a raid.", "Survive 5 minutes with at least 4 creatures standing.", "Score: creatures still conscious × buildings."],
    duration: 300,
    scoreLabel: "Survival",
    worldOptions: { starterCreatures: 8 },
    setup: (w) => {
      w.flags.disaster = 1;
      w.factions.p1.stock.food = 30;
      w.factions.p1.stock.wood = 24;
    },
    score: (w) => population(w, "p1") * 10 + Object.values(w.buildings).filter((b) => b.faction === "p1" && b.complete).length * 15,
    check: (w) => (Object.values(w.creatures).filter((c) => c.faction === "p1" && c.health > 0 && c.state !== "recover").length < 4 && (w.time - (w.challenge?.startedAt ?? 0)) > 30 ? "lost" : null),
  },
  {
    id: "last_campfire",
    title: "The Last Campfire",
    tagline: "Survive with almost nothing.",
    rules: ["Start with 3 creatures, 3 food, 2 wood and a dying campfire.", "Reach 30 food in stock before anyone faints.", "Untimed."],
    duration: 0,
    scoreLabel: "Food",
    worldOptions: { starterCreatures: 3, treeDensity: 0.5 },
    setup: (w) => {
      w.factions.p1.stock = { wood: 2, stone: 0, food: 3 };
    },
    score: (w) => w.factions.p1.stock.food,
    check: (w) => (w.factions.p1.stock.food >= 30 ? "won" : w.chronicle.some((e) => e.text.includes("fainted") && e.t > (w.challenge?.startedAt ?? 0)) ? "lost" : null),
  },
  {
    id: "rivalry",
    title: "Rivalry",
    tagline: "Out-build the AI Overlords in ten minutes.",
    rules: ["Three AI Overlords on hard difficulty.", "Highest settlement score after 10 minutes wins.", "In Play with Friends, each player's faction is scored."],
    duration: 600,
    scoreLabel: "Score",
    worldOptions: { difficulty: "hard", starterCreatures: 5 },
    setup: () => {},
    score: (w) => {
      const f = w.factions.p1;
      return Object.values(w.buildings).filter((b) => b.faction === "p1" && b.complete).length * 10 + population(w, "p1") * 3 + Math.floor((f.stock.wood + f.stock.stone + f.stock.food) / 5) + Math.floor(f.essence);
    },
    check: () => null,
  },
];

function avgHappiness(w: World) {
  let s = 0;
  let n = 0;
  for (const id in w.creatures) {
    s += w.creatures[id].happiness;
    n++;
  }
  return n ? s / n : 0;
}

export function startChallenge(w: World, def: ChallengeDef) {
  def.setup(w);
  w.challenge = { id: def.id, startedAt: w.time, duration: def.duration, score: 0, finished: false, params: {} } as ChallengeState;
  chronicle(w, `Challenge started: ${def.title}. ${def.tagline}`, "milestone", 3);
}

/** Called each second by the engine. */
export function updateChallenge(w: World) {
  const ch = w.challenge;
  if (!ch || ch.finished) return;
  const def = CHALLENGES.find((d) => d.id === ch.id);
  if (!def) return;
  ch.score = def.score(w);
  const elapsed = w.time - ch.startedAt;
  // disaster scenario events
  if (w.flags.disaster) {
    const n = Math.floor(elapsed / 45);
    if (n > ((w.flags.disasterCount as number) ?? 0) && elapsed > 30) {
      w.flags.disasterCount = n;
      disaster(w);
    }
  }
  const res = def.check(w);
  if (res) finishChallenge(w, res);
  else if (ch.duration > 0 && elapsed >= ch.duration) finishChallenge(w, "ended");
}

function disaster(w: World) {
  const rng = worldRng(w);
  const isl = w.islands[0];
  const kind = rng.pick(["lightning", "storm", "lightning"] as const);
  if (kind === "lightning") {
    const targets = Object.values(w.creatures).filter((c) => c.faction === "p1");
    const count = Math.min(4, targets.length);
    for (let i = 0; i < count; i++) {
      const c = rng.pick(targets);
      applyCommand(w, { type: "lightning", x: c.x + rng.range(-1.5, 1.5), z: c.z + rng.range(-1.5, 1.5), player: "disaster" }, rng);
    }
    chronicle(w, "DISASTER: A freak lightning storm rakes the island!", "disaster", 3);
  } else {
    w.weather = { kind: "storm", until: w.time + 30, intensity: 1 };
    w.flags.stormX = isl.center.x;
    w.flags.stormZ = isl.center.z;
    chronicle(w, "DISASTER: A great storm rolls over the island!", "disaster", 3);
  }
  saveRng(w, rng);
}

export function finishChallenge(w: World, result: "won" | "lost" | "ended") {
  const ch = w.challenge;
  if (!ch) return;
  const def = CHALLENGES.find((d) => d.id === ch.id);
  ch.finished = true;
  ch.result = result;
  ch.score = def ? def.score(w) : ch.score;
  ch.summary = result === "won" ? `You won ${def?.title ?? "the challenge"} with a score of ${ch.score}.` : result === "lost" ? `${def?.title ?? "The challenge"} defeated you. Score: ${ch.score}.` : `${def?.title ?? "Challenge"} over. Final score: ${ch.score}.`;
  chronicle(w, ch.summary, "milestone", 3);
}
