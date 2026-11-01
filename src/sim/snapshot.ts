import type { World } from "./types";
import { WORLD_VERSION, rebuildIslandNav } from "./world";
import { clearPathCache } from "./nav";

/** Serialise a world to a compact JSON-safe object. */
export function serializeWorld(w: World): string {
  const islands = w.islands.map((i) => ({ ...i, heights: i.heights.map((h) => Math.round(h * 1000) / 1000), blocked: [] as number[], dirty: true }));
  const out = { ...w, islands, effects: [], meta: { ...w.meta, savedAt: Date.now(), version: WORLD_VERSION } };
  return JSON.stringify(out);
}

export function deserializeWorld(json: string): World {
  const w = JSON.parse(json) as World;
  if (!w.meta || !Array.isArray(w.islands)) throw new Error("Invalid world snapshot");
  if (w.meta.version !== WORLD_VERSION) w.meta.version = WORLD_VERSION; // forward-compatible: field defaults below
  w.effects = [];
  w.flags = w.flags ?? {};
  w.players = w.players ?? {};
  w.stats = w.stats ?? { thrown: 0, struck: 0, blessed: 0, spawned: 0, built: 0, gathered: 0, discoveries: 0 };
  w.weather = w.weather ?? { kind: "clear", until: 0, intensity: 0 };
  w.projectiles = w.projectiles ?? {};
  w.skiffs = w.skiffs ?? {};
  w.goals = w.goals ?? { active: [], done: [], completedAt: {} };
  w.xp = w.xp ?? 0;
  w.level = w.level ?? 1;
  w.omen = w.omen ?? null;
  w.nextOmenAt = w.nextOmenAt ?? w.time + 120;
  w.stats = { ...{ thrown: 0, struck: 0, blessed: 0, spawned: 0, built: 0, gathered: 0, discoveries: 0, treesThrown: 0, raidsSent: 0, omens: 0, arrivals: 0 }, ...(w.stats as Partial<World["stats"]>) } as World["stats"];
  for (const fid in w.factions) {
    const f = w.factions[fid];
    f.growthTimer = f.growthTimer ?? 0;
    f.stats = { ...{ gathered: 0, built: 0, thrown: 0, struck: 0, blessed: 0, stolen: 0 }, ...(f.stats as Partial<World["factions"][string]["stats"]>) } as World["factions"][string]["stats"];
  }
  for (const id in w.projectiles) if (w.projectiles[id].held) w.projectiles[id].held = false;
  for (const isl of w.islands) {
    isl.blocked = new Array(isl.size * isl.size).fill(0);
    isl.navVersion = (isl.navVersion ?? 0) + 1;
    rebuildIslandNav(w, isl);
    isl.dirty = true;
  }
  for (const id in w.creatures) {
    const c = w.creatures[id];
    c.path = null;
    c.target = null;
    if (c.state === "held") c.state = "idle";
    if (c.state === "aboard" && !Object.values(w.skiffs ?? {}).some((k) => k.passengers.includes(c.id))) c.state = "recover";
    c.held = false;
    c.partnerId = null;
    c.raidTarget = c.raidTarget ?? null;
  }
  for (const id in w.tasks) w.tasks[id].assignedTo = null;
  for (const id in w.buildings) if (w.buildings[id].hp === undefined) w.buildings[id].hp = 100;
  for (const id in w.nodes) w.nodes[id].reservedBy = null;
  for (const id in w.items) w.items[id].reservedBy = null;
  clearPathCache();
  return w;
}

/** Compact per-tick delta for networking: creature transforms + quick-changing fields. */
export interface Delta {
  t: number;
  tick: number;
  c: number[]; // [id, x, z, y, heading, stateCode, carryingCode, scale*100] flattened
  p: number[]; // projectiles: [id, x, y, z, spin] flattened
  k: (number | string)[]; // skiffs: [id, faction, from, to, sx, sz, ex, ez, t, duration, purpose] flattened
  fx: World["effects"];
  stock: Record<string, [number, number, number, number]>;
  weather: World["weather"];
  day: number;
  xp: number;
  level: number;
}

const STATE_CODES = ["idle", "wander", "seekFood", "eat", "rest", "gather", "carry", "build", "explore", "socialise", "flee", "fight", "follow", "celebrate", "recover", "held", "thrown", "swim", "raid", "aboard"] as const;
const CARRY_CODES = ["", "wood", "stone", "food"] as const;

export function makeDelta(w: World, sinceEffectId: number): Delta {
  const c: number[] = [];
  for (const id in w.creatures) {
    const cr = w.creatures[id];
    c.push(cr.id, Math.round(cr.x * 100) / 100, Math.round(cr.z * 100) / 100, Math.round(cr.y * 100) / 100, Math.round(cr.heading * 100) / 100, STATE_CODES.indexOf(cr.state), cr.carrying ? CARRY_CODES.indexOf(cr.carrying.type) : 0, Math.round(cr.scale * 100));
  }
  const stock: Delta["stock"] = {};
  for (const fid in w.factions) {
    const f = w.factions[fid];
    stock[fid] = [f.stock.wood, f.stock.stone, f.stock.food, Math.round(f.essence)];
  }
  const p: number[] = [];
  for (const id in w.projectiles) {
    const pr = w.projectiles[id];
    p.push(pr.id, Math.round(pr.x * 100) / 100, Math.round(pr.y * 100) / 100, Math.round(pr.z * 100) / 100, Math.round(pr.spin * 100) / 100);
  }
  const k: (number | string)[] = [];
  for (const id in w.skiffs) {
    const sk = w.skiffs[id];
    k.push(sk.id, sk.faction, sk.fromIslandId, sk.toIslandId, sk.sx, sk.sz, sk.ex, sk.ez, Math.round(sk.t * 1000) / 1000, sk.duration, sk.purpose);
  }
  return { t: w.time, tick: w.tick, c, p, k, fx: w.effects.filter((e) => e.id > sinceEffectId), stock, weather: w.weather, day: w.day, xp: w.xp, level: w.level };
}

/** Apply a delta onto a client-side world copy. Unknown creatures are ignored until the next full snapshot. */
export function applyDelta(w: World, d: Delta) {
  w.time = d.t;
  w.tick = d.tick;
  w.day = d.day;
  w.weather = d.weather;
  for (let i = 0; i < d.c.length; i += 8) {
    const cr = w.creatures[d.c[i]];
    if (!cr) continue;
    cr.x = d.c[i + 1];
    cr.z = d.c[i + 2];
    cr.y = d.c[i + 3];
    cr.heading = d.c[i + 4];
    cr.state = STATE_CODES[d.c[i + 5]] ?? "idle";
    const carry = CARRY_CODES[d.c[i + 6]];
    cr.carrying = carry ? { type: carry, amount: cr.carrying?.amount ?? 1 } : null;
    cr.scale = d.c[i + 7] / 100;
  }
  for (let i = 0; i < (d.p ?? []).length; i += 5) {
    const pr = w.projectiles[d.p[i]];
    if (!pr) continue;
    pr.x = d.p[i + 1];
    pr.y = d.p[i + 2];
    pr.z = d.p[i + 3];
    pr.spin = d.p[i + 4];
  }
  const seen = new Set<number>();
  for (let i = 0; i < (d.k ?? []).length; i += 11) {
    const id = d.k[i] as number;
    seen.add(id);
    const ex = w.skiffs[id];
    if (ex) ex.t = d.k[i + 8] as number;
    else w.skiffs[id] = { id, faction: d.k[i + 1] as string, fromIslandId: d.k[i + 2] as number, toIslandId: d.k[i + 3] as number, sx: d.k[i + 4] as number, sz: d.k[i + 5] as number, ex: d.k[i + 6] as number, ez: d.k[i + 7] as number, t: d.k[i + 8] as number, duration: d.k[i + 9] as number, passengers: [], purpose: d.k[i + 10] as "raid" | "home" };
  }
  for (const id in w.skiffs) if (!seen.has(Number(id))) delete w.skiffs[id];
  w.xp = d.xp ?? w.xp;
  w.level = d.level ?? w.level;
  for (const e of d.fx) if (!w.effects.some((x) => x.id === e.id)) w.effects.push(e);
  for (const fid in d.stock) {
    const f = w.factions[fid];
    if (f) {
      f.stock.wood = d.stock[fid][0];
      f.stock.stone = d.stock[fid][1];
      f.stock.food = d.stock[fid][2];
      f.essence = d.stock[fid][3];
    }
  }
}
