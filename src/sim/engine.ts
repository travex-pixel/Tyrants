import type { Command, CommandResult, World } from "./types";
import { SIM_DT, worldRng, saveRng, rebuildIslandNav } from "./world";
import { updateCreature, updateItem, isNight } from "./creature";
import { updateItemRegrowth, updateBuildings, updateGrowth, updateBonfire } from "./economy";
import { updateProjectiles } from "./projectiles";
import { updateSkiffs } from "./skiffs";
import { updateGoals } from "./goals";
import { maybeSpawnOmen, expireOmen } from "./omens";
import { addXp } from "./progression";
import { updateDirector } from "./director";
import { updateDares } from "./dares";
import { generateTasks } from "./tasks";
import { thinkOverlord, stewardThink } from "./overlords";
import { applyCommand } from "./powers";
import { pruneEffects, chronicle, effect } from "./chronicle";
import { checkMilestones } from "./progression";
import { updateChallenge } from "./challenges";
import { creaturesNear } from "./query";
import { remember, interrupt } from "./creature";
import { clamp } from "./rng";

/**
 * The Engine owns a World and advances it in fixed steps. It has no knowledge of rendering or networking.
 * Players interact exclusively via commands, which are validated and applied at the start of each step.
 */
export class Engine {
  world: World;
  private accumulator = 0;
  private pending: Command[] = [];
  private taskTimer = 0;
  private secondTimer = 0;
  public lastResults: { cmd: Command; result: CommandResult }[] = [];
  public speed = 1;
  public paused = false;

  constructor(world: World) {
    this.world = world;
  }

  enqueue(cmd: Command): void {
    this.pending.push(cmd);
  }

  /** Apply a command immediately (used by the host for its own UI feedback). */
  applyNow(cmd: Command): CommandResult {
    const rng = worldRng(this.world);
    const r = applyCommand(this.world, cmd, rng);
    saveRng(this.world, rng);
    this.lastResults.push({ cmd, result: r });
    if (this.lastResults.length > 20) this.lastResults.shift();
    return r;
  }

  /** Advance by real elapsed seconds; runs as many fixed steps as needed (capped). */
  update(elapsed: number): number {
    if (this.paused) return 0;
    this.accumulator += Math.min(elapsed, 0.5) * this.speed;
    let steps = 0;
    while (this.accumulator >= SIM_DT && steps < 8) {
      this.step();
      this.accumulator -= SIM_DT;
      steps++;
    }
    if (steps === 8) this.accumulator = 0; // drop the backlog instead of spiralling
    return steps;
  }

  /** One fixed simulation step. */
  step(): void {
    const w = this.world;
    const dt = SIM_DT;
    const rng = worldRng(w);
    // commands
    if (this.pending.length) {
      for (const cmd of this.pending) {
        const r = applyCommand(w, cmd, rng);
        this.lastResults.push({ cmd, result: r });
      }
      if (this.lastResults.length > 20) this.lastResults.splice(0, this.lastResults.length - 20);
      this.pending.length = 0;
    }

    w.time += dt;
    w.tick++;
    const newDay = Math.floor(w.time / w.dayLength) + 1;
    if (newDay !== w.day) {
      w.day = newDay;
      chronicle(w, `Day ${w.day} dawns over ${w.meta.name}.`, "milestone", 1);
      addXp(w, 25, "new day");
    }

    // creatures (stagger expensive decisions through decisionCooldown; movement every tick)
    for (const id in w.creatures) {
      const c = w.creatures[id];
      if (!c) continue;
      updateCreature(w, c, dt, rng);
    }
    for (const id in w.items) {
      const it = w.items[id];
      if (it) updateItem(w, it, dt);
    }
    updateProjectiles(w, dt, rng);
    updateSkiffs(w, dt);

    // economy / buildings / regrowth (cheap, every tick)
    updateBuildings(w, dt, rng);

    // storm weather effects
    if (w.weather.kind === "storm") {
      if (w.time > w.weather.until) {
        w.weather = { kind: "clear", until: 0, intensity: 0 };
      } else if (rng.chance(dt * 0.9)) {
        const sx = (w.flags.stormX as number) ?? w.islands[0].center.x;
        const sz = (w.flags.stormZ as number) ?? w.islands[0].center.z;
        const x = sx + rng.range(-10, 10);
        const z = sz + rng.range(-10, 10);
        applyCommand(w, { type: "lightning", x, z, player: "storm" }, rng);
      }
    }

    // once per second systems
    this.secondTimer += dt;
    if (this.secondTimer >= 1) {
      this.secondTimer -= 1;
      updateItemRegrowth(w, 1);
      checkMilestones(w);
      updateChallenge(w);
      updateGrowth(w);
      updateBonfire(w);
      updateGoals(w);
      maybeSpawnOmen(w);
      expireOmen(w);
      updateDirector(w);
      updateDares(w);
      if (((w.flags.bowlChain as number) ?? 0) > 0 && w.time - ((w.flags.bowlChainAt as number) ?? 0) > 3) w.flags.bowlChain = 0;
      // AI overlords, staggered by their own timers
      for (const fid in w.factions) {
        const f = w.factions[fid];
        if (f.isAI && w.time >= f.aiNextThink) thinkOverlord(w, f, rng);
        else if (!f.isAI && w.tick % 50 === 0) stewardThink(w, f, rng);
      }
      // rebuild dirty nav grids (terraform)
      for (const isl of w.islands) {
        if (isl.dirty && (w.flags[`navDirty_${isl.id}`] as number) !== isl.navVersion) {
          rebuildIslandNav(w, isl);
          w.flags[`navDirty_${isl.id}`] = isl.navVersion;
        }
      }
      // ambient stories
      ambientEvents(w, rng);
    }

    // tasks every 0.5s
    this.taskTimer += dt;
    if (this.taskTimer >= 0.5) {
      this.taskTimer -= 0.5;
      generateTasks(w);
    }

    pruneEffects(w);
    saveRng(w, rng);
  }
}

/** Small world-driven happenings that make the chronicle worth reading. All grounded in real state. */
function ambientEvents(w: World, rng: ReturnType<typeof worldRng>) {
  if (!rng.chance(0.08)) return;
  const all = Object.values(w.creatures).filter((c) => c.faction === w.playerFaction);
  if (!all.length) return;
  const c = rng.pick(all);
  if (c.state === "held" || c.state === "thrown") return;
  if (c.traits.includes("curious") && c.state === "wander" && rng.chance(0.5)) {
    chronicle(w, `${c.name} found an interesting pebble and has been staring at it for some time.`, "story", 1, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
    return;
  }
  if (c.traits.includes("lazy") && c.state === "rest" && !isNight(w)) {
    chronicle(w, `${c.name} is having a nap. In the middle of the day. Again.`, "story", 1, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
    return;
  }
  if (c.happiness > 85 && rng.chance(0.5)) {
    effect(w, "heart", c.x, c.z, { ttl: 1.2, y: 1 });
    chronicle(w, `${c.name} is having a genuinely lovely day.`, "story", 1, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
    return;
  }
  if (c.mood === "grumpy" && rng.chance(0.5)) {
    const near = creaturesNear(w, c.x, c.z, 3, c.islandId).filter((o) => o.id !== c.id);
    if (near.length) {
      const o = near[0];
      remember(o, "pranked", 0.3, c.id, undefined, undefined, w.time);
      chronicle(w, `${c.name} snapped at ${o.name} for breathing too loudly.`, "social", 1, { faction: c.faction, x: c.x, z: c.z, islandId: c.islandId });
    }
  }
  void interrupt;
  void clamp;
}
