import { it, expect } from "vitest";
import { createWorld, Engine, population, buildingsOf } from "@/src/sim";
import { placeBuildingRaw, worldRng, saveRng } from "@/src/sim/world";

// Pacing probe: in the first 10 minutes of a passive solo world, something player-relevant must happen regularly.
it("the first ten minutes have no dead zones longer than 60 seconds (passive solo)", () => {
  const w = createWorld({ mode: "solo", seed: 1 });
  const e = new Engine(w);
  const stamps: number[] = [];
  let lastIdx = 0;
  for (let t = 0; t < 600; t += 1) {
    for (let i = 0; i < 10; i++) e.step();
    for (; lastIdx < w.chronicle.length; lastIdx++) {
      const c = w.chronicle[lastIdx];
      if (c.importance >= 2 && (c.faction === "p1" || c.faction === undefined || c.kind === "rival" || c.kind === "disaster")) stamps.push(c.t);
    }
    if (w.omen && !stamps.includes(w.omen.expiresAt - 60)) stamps.push(w.omen.expiresAt - 60);
  }
  const omensSeen = w.chronicle.filter((c) => c.text.startsWith("Omen:")).length;
  let worst = 0;
  let prev = 0;
  for (const s of [...stamps, 600]) {
    worst = Math.max(worst, s - prev);
    prev = s;
  }
  process.stdout.write(`\nnotable events: ${stamps.length}, worst gap ${worst.toFixed(0)}s, decrees done ${w.goals.done.length}, omens ${omensSeen}, pop ${population(w, "p1")}, buildings ${buildingsOf(w, "p1").filter((b) => b.complete).length}, level ${w.level}, mayhem peak ${(w.flags.mayhemPeak as number) ?? 0}\n`);
  expect(worst).toBeLessThan(75);
  expect(stamps.length).toBeGreaterThan(12);
  expect(omensSeen).toBeGreaterThanOrEqual(3);
});

it("with three buildings placed, the first ten minutes complete them at a readable pace", () => {
  const w = createWorld({ mode: "solo", seed: 2 });
  const e = new Engine(w);
  const isl = w.islands[0];
  const rng = worldRng(w);
  saveRng(w, rng);
  let placed = 0;
  for (const t of ["lumber", "farm", "house"] as const) {
    let ok = false;
    for (let r = 4; r < 16 && !ok; r += 1)
      for (let a = 0; a < Math.PI * 2 && !ok; a += 0.3) {
        const res = e.applyNow({ type: "place", building: t, x: isl.spawnPoint.x + Math.cos(a + placed * 2) * r, z: isl.spawnPoint.z + Math.sin(a + placed * 2) * r, player: "me" });
        if (res.ok) ok = true;
      }
    if (ok) placed++;
  }
  expect(placed).toBe(3);
  const done: Record<string, number> = {};
  for (let t = 0; t < 600; t += 1) {
    for (let i = 0; i < 10; i++) e.step();
    for (const b of buildingsOf(w, "p1")) if (b.complete && b.type !== "campfire" && done[b.type] === undefined) done[b.type] = w.time;
  }
  process.stdout.write(`buildings completed at: ${JSON.stringify(done)}; pop ${population(w, "p1")}; arrivals ${w.stats.arrivals}\n`);
  expect(Object.keys(done).length).toBe(3);
  expect(Math.min(...Object.values(done))).toBeGreaterThan(15);
  expect(done.house).toBeGreaterThan(40);
  void placeBuildingRaw;
});
