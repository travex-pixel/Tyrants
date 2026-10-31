import type { World } from "./types";
import type { RNG } from "./rng";
import { rebuildIslandNav } from "./world";
import { islandById, creaturesNear } from "./query";
import { effect } from "./chronicle";

/** Resource node regrowth (berries, stumps → trees). Called once per second. */
export function updateItemRegrowth(w: World, dt: number) {
  let navDirtyIsland: number | null = null;
  for (const id in w.nodes) {
    const n = w.nodes[id];
    if (n.burning !== undefined && n.burning > 0) {
      n.burning -= dt;
      if (n.burning <= 0) n.burning = undefined;
    }
    if (n.regrow > 0 && n.amount < n.maxAmount) {
      n.amount = Math.min(n.maxAmount, n.amount + (n.regrow / 60) * dt);
      if (n.kind === "stump" && n.amount >= 3) {
        n.kind = "tree";
        navDirtyIsland = n.islandId;
      }
    }
  }
  if (navDirtyIsland !== null) rebuildIslandNav(w, islandById(w, navDirtyIsland));
}

/** Per-tick building behaviour: farm growth, campfire happiness aura, totem aura. */
export function updateBuildings(w: World, dt: number, rng: RNG) {
  for (const id in w.buildings) {
    const b = w.buildings[id];
    if (!b.complete) continue;
    if (b.type === "farm") {
      // slow passive growth even without a farmer; farmers accelerate it (see creature.ts)
      if (b.cropTimer < 1) b.cropTimer = Math.min(1, b.cropTimer + 0.003 * dt);
    } else if (b.type === "campfire" || b.type === "totem") {
      if (rng.chance(dt * 0.25)) {
        for (const c of creaturesNear(w, b.x, b.z, 4, b.islandId)) {
          if (c.faction === b.faction) c.happiness = Math.min(100, c.happiness + 0.4);
        }
      }
      if (b.type === "campfire" && rng.chance(dt * 0.4)) effect(w, "sparkle", b.x + rng.range(-0.2, 0.2), b.z + rng.range(-0.2, 0.2), { ttl: 0.9, size: 0.3, color: "#ffb347", y: 0.5 });
    }
  }
}
