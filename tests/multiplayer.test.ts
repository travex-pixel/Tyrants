import { describe, it, expect, beforeEach } from "vitest";
import { GameSession } from "@/src/game/session";
import { LocalTransport } from "@/src/net/local";
import type { PresenceInfo } from "@/src/net/transport";
import { population } from "@/src/sim/query";

const me = (id: string, joinedAt: number): PresenceInfo => ({ id, name: id, color: "#fff", joinedAt, faction: "p1" });
const tick = async (sessions: GameSession[], seconds: number) => {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) {
    for (const s of sessions) s.update(0.05);
    await new Promise((r) => setTimeout(r, 0));
  }
};

describe("multiplayer (host-authoritative over an in-memory transport)", () => {
  beforeEach(() => LocalTransport.reset());

  it("host streams snapshots and deltas; client commands are applied by the host", async () => {
    const host = GameSession.newWorld({ mode: "friends", seed: 5, starterCreatures: 4, noRivals: true }, me("host", 1));
    await host.host(new LocalTransport(me("host", 1)), "ABCDEF", "shared");
    const client = await GameSession.join(new LocalTransport(me("guest", 2)), "ABCDEF", me("guest", 2), {});
    expect(client.role).toBe("client");
    await tick([host, client], 1);
    // snapshot arrived: same creatures
    expect(Object.keys(client.world.creatures).length).toBe(Object.keys(host.world.creatures).length);
    expect(client.world.players.guest).toBeDefined();
    expect(host.world.players.guest).toBeDefined();
    // client spawns a creature via command → host applies it
    const isl = host.world.islands[0];
    const before = population(host.world, "p1");
    client.dispatch({ type: "spawn", species: "goblin", x: isl.spawnPoint.x, z: isl.spawnPoint.z, player: "guest" });
    await tick([host, client], 0.5);
    expect(population(host.world, "p1")).toBe(before + 1);
    // deltas keep the client's creature positions in sync
    await tick([host, client], 2);
    const id = Number(Object.keys(host.world.creatures)[0]);
    const hc = host.world.creatures[id];
    const cc = client.world.creatures[id];
    expect(Math.abs(hc.x - cc.x)).toBeLessThan(1.5);
    expect(client.world.time).toBeGreaterThan(0);
    await client.destroy();
    await host.destroy();
  });

  it("promotes the senior remaining player when the host leaves", async () => {
    const host = GameSession.newWorld({ mode: "friends", seed: 9, starterCreatures: 3, noRivals: true }, me("host", 1));
    await host.host(new LocalTransport(me("host", 1)), "ROOM01", "shared");
    const a = await GameSession.join(new LocalTransport(me("a", 2)), "ROOM01", me("a", 2), {});
    const b = await GameSession.join(new LocalTransport(me("b", 3)), "ROOM01", me("b", 3), {});
    await tick([host, a, b], 1);
    expect(a.role).toBe("client");
    await host.destroy(); // host leaves
    await tick([a, b], 0.5);
    expect(a.role).toBe("host");
    expect(b.role).toBe("client");
    expect(a.engine).not.toBeNull();
    const t0 = a.world.time;
    await tick([a, b], 1);
    expect(a.world.time).toBeGreaterThan(t0);
    await a.destroy();
    await b.destroy();
  });

  it("a joiner of an empty room resumes from the stored snapshot as host", async () => {
    const host = GameSession.newWorld({ mode: "friends", seed: 3, starterCreatures: 3, noRivals: true }, me("host", 1));
    await host.host(new LocalTransport(me("host", 1)), "ROOM02", "shared");
    await tick([host], 1);
    const creatures = Object.keys(host.world.creatures).length;
    await host.destroy(); // persists the room on the way out
    const later = await GameSession.join(new LocalTransport(me("late", 5)), "ROOM02", me("late", 5), {});
    expect(later.role).toBe("host");
    expect(Object.keys(later.world.creatures).length).toBe(creatures);
    await later.destroy();
  });

  it("rivals mode gives each human their own faction and campfire", async () => {
    const host = GameSession.newWorld({ mode: "friends", seed: 11, starterCreatures: 3, noRivals: true, mpMode: "rivals" }, me("host", 1));
    await host.host(new LocalTransport(me("host", 1)), "ROOM03", "rivals");
    const g = await GameSession.join(new LocalTransport(me("guest", 2)), "ROOM03", me("guest", 2), {});
    await tick([host, g], 1);
    const factions = Object.values(host.world.factions).filter((f) => !f.isAI);
    expect(factions.length).toBe(2);
    expect(Object.values(host.world.buildings).filter((b) => b.type === "campfire").length).toBe(2);
    await g.destroy();
    await host.destroy();
  });
});

describe("raids", () => {
  it("the Hoarder sends a raider that steals food and can be foiled", async () => {
    const { createWorld, Engine, thinkOverlord, worldRng, saveRng } = await import("@/src/sim");
    const w = createWorld({ mode: "solo", seed: 77, starterCreatures: 4 });
    const e = new Engine(w);
    const h = w.factions.ai_hoarder;
    h.relations.p1 = -50;
    h.raidCooldown = -1;
    w.factions.p1.stock.food = 40;
    w.time = 100;
    const rng = worldRng(w);
    for (let i = 0; i < 40 && !Object.values(w.creatures).some((c) => c.state === "raid" || c.state === "aboard"); i++) {
      w.time += 60;
      h.raidCooldown = -1;
      thinkOverlord(w, h, rng);
    }
    saveRng(w, rng);
    const raider = Object.values(w.creatures).find((c) => c.state === "aboard" || c.state === "raid");
    expect(raider).toBeDefined();
    expect(w.chronicle.some((c) => c.text.includes("raiding skiff"))).toBe(true);
    for (let i = 0; i < 1200 && w.creatures[raider!.id]; i++) e.step();
    // the raid resolved: either food was stolen or the raider was stopped
    expect(w.factions.p1.stock.food <= 40).toBe(true);
    expect(w.chronicle.some((c) => c.text.includes("snatched") || c.text.includes("empty") || c.text.includes("raid"))).toBe(true);
  });
});
