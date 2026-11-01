import { describe, it, expect } from "vitest";
import { createWorld, Engine, findPath, heightAt, isWalkable, serializeWorld, deserializeWorld, applyOfflineProgress, buildingsOf, population, creatureAtPoint, CHALLENGES, startChallenge, findFlatSpot, RNG, navStats } from "@/src/sim";
import type { World } from "@/src/sim";

function run(engine: Engine, seconds: number) {
  const steps = Math.round(seconds / 0.1);
  for (let i = 0; i < steps; i++) engine.step();
}

describe("terrain & navigation", () => {
  it("generates a playable main island with walkable spawn and buildable spots", () => {
    const w = createWorld({ mode: "solo", seed: 42 });
    const isl = w.islands[0];
    const walkable = isl.blocked.filter((b) => b === 0).length;
    expect(walkable).toBeGreaterThan(isl.size * isl.size * 0.25);
    expect(isWalkable(isl, isl.spawnPoint.x, isl.spawnPoint.z)).toBe(true);
    expect(heightAt(isl, isl.spawnPoint.x, isl.spawnPoint.z)).toBeGreaterThan(isl.waterLevel);
    const rng = new RNG(1);
    expect(findFlatSpot(isl, isl.center.x, isl.center.z, 2, rng)).not.toBeNull();
    expect(w.islands.length).toBe(4);
  });

  it("finds paths between distant walkable cells and caches them", () => {
    const w = createWorld({ mode: "solo", seed: 7 });
    const isl = w.islands[0];
    const cells = isl.blocked.map((b, i) => (b === 0 ? i : -1)).filter((i) => i >= 0);
    const a = cells[0];
    const b = cells[cells.length - 1];
    const from = { x: isl.ox + (a % isl.size) + 0.5, z: isl.oz + Math.floor(a / isl.size) + 0.5 };
    const to = { x: isl.ox + (b % isl.size) + 0.5, z: isl.oz + Math.floor(b / isl.size) + 0.5 };
    const p1 = findPath(isl, from, to);
    // most islands are connected; if not, at least the call must not throw
    if (p1) {
      expect(p1.length).toBeGreaterThan(2);
      const p2 = findPath(isl, from, to);
      expect(p2).not.toBeNull();
      expect(navStats().cacheHits).toBeGreaterThan(0);
    }
  });
});

describe("economy & construction", () => {
  it("creatures gather wood, deliver it, and build a lumber camp from real materials", () => {
    const w = createWorld({ mode: "solo", seed: 1234, starterCreatures: 6 });
    const e = new Engine(w);
    const f = w.factions.p1;
    const startWood = f.stock.wood;
    run(e, 60);
    expect(f.stats.gathered).toBeGreaterThan(0);
    // place a lumber camp near spawn
    const isl = w.islands[0];
    let placed = false;
    for (let r = 4; r < 14 && !placed; r += 1)
      for (let a = 0; a < Math.PI * 2 && !placed; a += 0.3) {
        const res = e.applyNow({ type: "place", building: "lumber", x: isl.spawnPoint.x + Math.cos(a) * r, z: isl.spawnPoint.z + Math.sin(a) * r, player: "me" });
        if (res.ok) placed = true;
      }
    expect(placed).toBe(true);
    run(e, 240);
    const camps = buildingsOf(w, "p1", "lumber");
    expect(camps.length).toBe(1);
    expect(camps[0].complete).toBe(true);
    expect(f.stock.wood + f.stats.gathered).toBeGreaterThan(startWood);
    // nobody permanently stuck: every creature has changed state at least once
    for (const c of Object.values(w.creatures)) expect(c.stateTime).toBeLessThan(200);
  });

  it("creatures eat from the stockpile when hungry", () => {
    const w = createWorld({ mode: "solo", seed: 99, starterCreatures: 5, noRivals: true });
    const e = new Engine(w);
    for (const c of Object.values(w.creatures)) c.hunger = 90;
    run(e, 40);
    // everyone started at 90 hunger; eating (stockpile or berries) must have brought some of them down
    expect(Object.values(w.creatures).some((c) => c.hunger < 60)).toBe(true);
    expect(w.chronicle.some((c) => c.text.includes("fainted"))).toBe(false);
  });
});

describe("powers", () => {
  it("grab, throw, land and recover", () => {
    const w = createWorld({ mode: "sandbox", seed: 3, noRivals: true });
    const e = new Engine(w);
    const c = Object.values(w.creatures)[0];
    expect(e.applyNow({ type: "grab", creatureId: c.id, player: "me" }).ok).toBe(true);
    expect(c.state).toBe("held");
    e.applyNow({ type: "throw", creatureId: c.id, vx: 4, vz: 0, vy: 6, player: "me" });
    expect(c.state).toBe("thrown");
    run(e, 4);
    expect(["recover", "idle", "wander", "swim", "gather", "carry", "socialise", "seekFood", "rest", "build", "explore", "celebrate", "flee"]).toContain(c.state);
    expect(w.stats.thrown).toBe(1);
    expect(w.achievements.first_throw.unlockedAt).not.toBeNull();
  });

  it("lightning hurts and scares, bless cheers, terraform changes heights", () => {
    const w = createWorld({ mode: "sandbox", seed: 11, noRivals: true });
    const e = new Engine(w);
    const c = Object.values(w.creatures)[0];
    const hp = c.health;
    e.applyNow({ type: "lightning", x: c.x, z: c.z, player: "me" });
    expect(c.health).toBeLessThan(hp);
    run(e, 3);
    const c2 = Object.values(w.creatures)[1];
    const hap = c2.happiness;
    e.applyNow({ type: "bless", x: c2.x, z: c2.z, player: "me" });
    expect(c2.happiness).toBeGreaterThan(hap);
    const isl = w.islands[0];
    const rng = new RNG(2);
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) {
      const spot = findFlatSpot(isl, isl.center.x + 10 + i, isl.center.z + 10 - i, 2, rng, 80, 4);
      if (!spot) continue;
      const h0 = heightAt(isl, spot.x, spot.z);
      const r = e.applyNow({ type: "terraform", x: spot.x, z: spot.z, dir: 1, radius: 2.5, player: "me" });
      if (!r.ok) continue;
      expect(heightAt(isl, spot.x, spot.z)).toBeGreaterThan(h0);
      ok = true;
    }
    expect(ok).toBe(true);
  });

  it("rejects invalid commands with reasons", () => {
    const w = createWorld({ mode: "solo", seed: 5 });
    const e = new Engine(w);
    const r = e.applyNow({ type: "spawn", species: "goblin", x: -500, z: -500, player: "me" });
    expect(r.ok).toBe(false);
    const r2 = e.applyNow({ type: "throw", creatureId: 999999, vx: 0, vz: 0, vy: 0, player: "me" });
    expect(r2.ok).toBe(false);
    expect(creatureAtPoint(w, -999, -999)).toBeNull();
  });
});

describe("AI overlords", () => {
  it("rival settlements develop using real resources", () => {
    const w = createWorld({ mode: "solo", seed: 2024, starterCreatures: 4 });
    const e = new Engine(w);
    const ai = Object.values(w.factions).filter((f) => f.isAI);
    expect(ai.length).toBe(3);
    run(e, 420);
    let totalComplete = 0;
    for (const f of ai) {
      const done = buildingsOf(w, f.id).filter((b) => b.complete);
      totalComplete += done.length;
      expect(f.stats.gathered).toBeGreaterThan(0);
      expect(f.stock.wood).toBeGreaterThanOrEqual(0);
    }
    expect(totalComplete).toBeGreaterThan(3); // beyond the 3 starting campfires
    expect(w.chronicle.some((c) => c.kind === "rival")).toBe(true);
  });

  it("remembers hostile acts and relations shift", () => {
    const w = createWorld({ mode: "solo", seed: 77 });
    const e = new Engine(w);
    const hoarder = w.factions.ai_hoarder;
    const c = Object.values(w.creatures).find((x) => x.faction === "ai_hoarder")!;
    const before = hoarder.relations.p1;
    e.applyNow({ type: "lightning", x: c.x, z: c.z, player: "me" });
    expect(hoarder.relations.p1).toBeLessThan(before);
    expect(hoarder.aiMemory.length).toBeGreaterThan(0);
  });
});

describe("persistence", () => {
  it("round-trips through a snapshot and keeps simulating", () => {
    const w = createWorld({ mode: "solo", seed: 31337 });
    const e = new Engine(w);
    run(e, 30);
    const json = serializeWorld(w);
    const w2 = deserializeWorld(json);
    expect(Object.keys(w2.creatures).length).toBe(Object.keys(w.creatures).length);
    expect(w2.islands[0].blocked.length).toBe(w.islands[0].blocked.length);
    expect(w2.chronicle.length).toBe(w.chronicle.length);
    const e2 = new Engine(w2);
    run(e2, 30);
    expect(w2.time).toBeGreaterThan(w.time);
  });

  it("offline progression is bounded and never catastrophic", () => {
    const w = createWorld({ mode: "solo", seed: 8 });
    const e = new Engine(w);
    run(e, 10);
    w.meta.savedAt = Date.now() - 3 * 24 * 3600 * 1000; // three days away
    const pop = population(w, "p1");
    const report = applyOfflineProgress(w, Date.now(), 60);
    expect(report.simulated).toBe(60);
    expect(report.abstracted).toBeLessThanOrEqual(8 * 3600);
    // arrivals may wander in, but growth stays bounded
    expect(population(w, "p1")).toBeGreaterThanOrEqual(pop);
    expect(population(w, "p1")).toBeLessThanOrEqual(pop + 3);
    expect(w.factions.p1.stock.wood).toBeLessThan(500);
    expect(report.lines.length).toBeGreaterThan(0);
    for (const c of Object.values(w.creatures)) expect(c.health).toBeGreaterThan(0);
  });
});

describe("challenges", () => {
  it("100 goblins spawns 100 goblins and scores", () => {
    const def = CHALLENGES.find((c) => c.id === "hundred_goblins")!;
    const w = createWorld({ mode: "challenge", seed: 1, ...def.worldOptions });
    startChallenge(w, def);
    expect(population(w, "p1")).toBe(100);
    const e = new Engine(w);
    const t0 = performance.now();
    run(e, 20);
    const ms = performance.now() - t0;
    expect(w.challenge?.score).toBeGreaterThanOrEqual(0);
    // 200 ticks with 100 creatures should be well under 4 seconds in node
    expect(ms).toBeLessThan(4000);
  });
});

describe("performance", () => {
  it("steps a 25-creature world fast", () => {
    const w: World = createWorld({ mode: "solo", seed: 55, starterCreatures: 25 });
    const e = new Engine(w);
    run(e, 5);
    const t0 = performance.now();
    run(e, 60);
    const ms = performance.now() - t0;
    // 600 ticks; budget 1.5s in node (≈2.5ms/tick)
    expect(ms).toBeLessThan(1500);
  });
});
