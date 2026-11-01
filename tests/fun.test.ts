import { describe, it, expect } from "vitest";
import { createWorld, Engine, population, GOALS, updateGoals, OMENS, maybeSpawnOmen, resolveOmen, levelForXp, xpForLevel, buildingsOf, housingCapacity } from "@/src/sim";
import { placeBuildingRaw, worldRng, saveRng } from "@/src/sim/world";

const run = (e: Engine, s: number) => {
  for (let i = 0; i < Math.round(s / 0.1); i++) e.step();
};

describe("decrees & levels", () => {
  it("keeps three decrees active and completes them from real state, granting essence and XP", () => {
    const w = createWorld({ mode: "solo", seed: 12 });
    const e = new Engine(w);
    run(e, 2);
    expect(w.goals.active.length).toBe(3);
    const ess = w.factions.p1.essence;
    const c = Object.values(w.creatures)[0];
    e.applyNow({ type: "grab", creatureId: c.id, player: "me" });
    e.applyNow({ type: "throw", creatureId: c.id, vx: 3, vz: 0, vy: 5, player: "me" });
    run(e, 2);
    expect(w.goals.done).toContain("g_throw");
    expect(w.goals.active.length).toBe(3);
    expect(w.factions.p1.essence).toBeGreaterThan(ess);
    expect(w.xp).toBeGreaterThan(0);
  });
  it("levels follow the XP curve with titles", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(xpForLevel(5))).toBe(5);
    expect(levelForXp(xpForLevel(6) - 1)).toBe(5);
    expect(GOALS.length).toBeGreaterThan(20);
  });
});

describe("thrown trees", () => {
  it("uproots a tree, it flies, shatters into wood and knocks creatures", () => {
    const w = createWorld({ mode: "sandbox", seed: 4, noRivals: true, starterCreatures: 6 });
    const e = new Engine(w);
    const tree = Object.values(w.nodes).find((n) => n.islandId === 1 && n.kind === "tree")!;
    const r = e.applyNow({ type: "grabNode", nodeId: tree.id, player: "me" });
    expect(r.ok).toBe(true);
    expect(w.nodes[tree.id]).toBeUndefined();
    const pid = (r as { ok: true; id: number }).id;
    expect(w.projectiles[pid].held).toBe(true);
    // carry it over the campfire and throw it at the crowd
    const cf = buildingsOf(w, "p1", "campfire")[0];
    e.applyNow({ type: "moveNode", projectileId: pid, x: cf.x, z: cf.z, player: "me" });
    const itemsBefore = Object.keys(w.items).length;
    e.applyNow({ type: "throwNode", projectileId: pid, vx: 1, vz: 0, vy: 2, player: "me" });
    run(e, 3);
    expect(w.projectiles[pid]).toBeUndefined();
    expect(Object.keys(w.items).length).toBeGreaterThan(itemsBefore);
    expect(w.stats.treesThrown).toBe(1);
    expect(w.achievements.tree_throw.unlockedAt).not.toBeNull();
  });
});

describe("natural growth", () => {
  it("surplus food and housing attract new arrivals", () => {
    const w = createWorld({ mode: "solo", seed: 21, noRivals: true, starterCreatures: 4 });
    const rng = worldRng(w);
    const isl = w.islands[0];
    placeBuildingRaw(w, "house", "p1", 1, isl.spawnPoint.x + 5, isl.spawnPoint.z, rng, true);
    saveRng(w, rng);
    w.factions.p1.stock.food = 200;
    const e = new Engine(w);
    const before = population(w, "p1");
    run(e, 120);
    expect(population(w, "p1")).toBeGreaterThan(before);
    expect(w.stats.arrivals).toBeGreaterThanOrEqual(1);
    expect(housingCapacity(w, "p1")).toBe(3);
  });
});

describe("player raids", () => {
  it("sends raiders by sky-skiff, they steal and come home with loot", () => {
    const w = createWorld({ mode: "solo", seed: 8, starterCreatures: 5 });
    const e = new Engine(w);
    w.factions.ai_hoarder.stock.food = 50;
    const foodBefore = w.factions.p1.stock.food;
    const r = e.applyNow({ type: "raid", targetFaction: "ai_hoarder", player: "me" });
    expect(r.ok).toBe(true);
    const raiders = Object.values(w.creatures).filter((c) => c.faction === "p1" && c.state === "aboard");
    expect(raiders.length).toBe(2);
    expect(Object.keys(w.skiffs).length).toBe(1);
    const ids = raiders.map((c) => c.id);
    run(e, 12);
    // the skiff has landed on the rival island and the raid is under way
    expect(w.creatures[ids[0]].islandId).toBe(w.factions.ai_hoarder.homeIslandId);
    run(e, 200);
    // the raiders themselves came home (nobody despawned)
    for (const id of ids) expect(w.creatures[id]).toBeDefined();
    for (const id of ids) expect(w.creatures[id].islandId).toBe(1);
    expect(Object.values(w.creatures).filter((c) => c.faction === "p1" && c.state === "raid").length).toBe(0);
    expect(w.factions.ai_hoarder.relations.p1).toBeLessThan(-10);
    expect(w.factions.p1.stock.food + w.factions.ai_hoarder.stock.food).toBeLessThanOrEqual(foodBefore + 50 + 1);
    expect(w.chronicle.some((c) => c.text.includes("came home from the raid"))).toBe(true);
  });
});

describe("omens", () => {
  it("spawns an omen in time and resolves it with consequences", () => {
    const w = createWorld({ mode: "solo", seed: 3 });
    w.time = 200;
    w.nextOmenAt = 0;
    maybeSpawnOmen(w);
    expect(w.omen).not.toBeNull();
    const id = w.omen!.id;
    const def = OMENS.find((o) => o.id === id)!;
    expect(def).toBeDefined();
    const opt = w.omen!.options.findIndex((o) => !o.disabled);
    const res = resolveOmen(w, opt);
    expect(res.ok).toBe(true);
    expect(w.omen).toBeNull();
    expect(w.stats.omens).toBe(1);
    expect(w.chronicle[w.chronicle.length - 1].kind).toBe("story");
  });
  it("every omen can be made and resolved for both options without throwing", () => {
    for (const def of OMENS) {
      for (let opt = 0; opt < 2; opt++) {
        const w = createWorld({ mode: "solo", seed: 99 });
        w.factions.p1.stock = { wood: 50, stone: 50, food: 50 };
        for (const f of Object.values(w.factions)) if (f.isAI) f.relations.p1 = -20;
        if (!def.available(w)) continue;
        w.omen = def.make(w);
        const r = resolveOmen(w, opt);
        expect(r.ok, `${def.id} option ${opt}`).toBe(true);
      }
    }
  });
});

describe("job preference", () => {
  it("steers creatures toward their assigned job", () => {
    const w = createWorld({ mode: "solo", seed: 5, noRivals: true, starterCreatures: 6 });
    const e = new Engine(w);
    const cs = Object.values(w.creatures);
    for (const c of cs) e.applyNow({ type: "setJobPref", creatureId: c.id, job: "gather", player: "me" });
    run(e, 60);
    const gatherers = cs.filter((c) => c.taskId !== null && w.tasks[c.taskId]?.job === "gather").length;
    const builders = cs.filter((c) => c.taskId !== null && w.tasks[c.taskId]?.job === "build").length;
    expect(gatherers).toBeGreaterThanOrEqual(builders);
    void updateGoals;
  });
});

describe("wildlife & dares", () => {
  it("boars raid, brave folk catch them, the Sun tames them", async () => {
    const { createWorld, Engine, spawnBoars, worldRng, saveRng, population } = await import("@/src/sim");
    const w = createWorld({ mode: "solo", seed: 13, noRivals: true, starterCreatures: 6 });
    const e = new Engine(w);
    const rng = worldRng(w);
    spawnBoars(w, rng, 2);
    saveRng(w, rng);
    const boars = Object.values(w.creatures).filter((c) => c.faction === "wild");
    expect(boars.length).toBe(2);
    expect(w.chronicle.some((c) => c.text.includes("wild boars"))).toBe(true);
    run(e, 30);
    // tame one with the Sun
    const b = Object.values(w.creatures).find((c) => c.faction === "wild");
    if (b) {
      const r = e.applyNow({ type: "bless", x: b.x, z: b.z, player: "me" });
      expect(r.ok).toBe(true);
      expect(w.creatures[b.id].faction).toBe("p1");
      expect(w.flags.tamed).toBe(1);
    }
    run(e, 120);
    expect(population(w, "p1")).toBeGreaterThanOrEqual(6);
  });
  it("dares are generated from live state, tracked and paid out", async () => {
    const { createWorld, Engine, updateDares } = await import("@/src/sim");
    const w = createWorld({ mode: "solo", seed: 14, noRivals: true, starterCreatures: 6 });
    const e = new Engine(w);
    w.time = 130;
    w.nextDareAt = 0;
    for (let i = 0; i < 20 && !w.dare; i++) updateDares(w);
    expect(w.dare).not.toBeNull();
    // force a tree dare and satisfy it
    const tree = Object.values(w.nodes).find((n) => n.kind === "tree" && n.islandId === 1)!;
    w.dare = { id: "d", kind: "tree", text: "Uproot a tree and throw it", startedAt: w.time, expiresAt: w.time + 60, progress: 0, target: 1, essence: 4, xp: 40, baseline: w.stats.treesThrown };
    const ess = w.factions.p1.essence;
    const r = e.applyNow({ type: "grabNode", nodeId: tree.id, player: "me" }) as { ok: true; id: number };
    e.applyNow({ type: "throwNode", projectileId: r.id, vx: 2, vz: 0, vy: 3, player: "me" });
    run(e, 4);
    expect(w.dare).toBeNull();
    expect(w.factions.p1.essence).toBeGreaterThan(ess);
    expect(w.chronicle.some((c) => c.text.startsWith("Dare done"))).toBe(true);
  });
});
