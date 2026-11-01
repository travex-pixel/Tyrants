import type { World, PendingOmen, SpeciesId } from "./types";
import { worldRng, saveRng, spawnCreature } from "./world";
import { chronicle, effect } from "./chronicle";
import { noteAIEvent } from "./overlords";
import { creaturesOf, population, canAfford } from "./query";
import { addXp } from "./progression";
import { relation, remember } from "./creature";
import { unlockAchievement } from "./progression";

/**
 * Omens: small choice cards grounded in the current world state. One at a time, every few minutes,
 * each with two options and real consequences.
 */
interface OmenDef {
  id: string;
  weight: number;
  available: (w: World) => boolean;
  make: (w: World) => PendingOmen;
  resolve: (w: World, option: number, p: PendingOmen) => string; // returns chronicle line
}

const rivals = (w: World) => Object.values(w.factions).filter((f) => f.isAI);
const me = (w: World) => w.factions[w.playerFaction];
const pick = <T,>(w: World, arr: T[]): T => {
  const rng = worldRng(w);
  const v = rng.pick(arr);
  saveRng(w, rng);
  return v;
};

export const OMENS: OmenDef[] = [
  {
    id: "sky_trader",
    weight: 3,
    available: (w) => me(w).stock.wood >= 6,
    make: (w) => ({ id: "sky_trader", title: "A sky-trader moors at your island", text: "A weathered skiff bobs at the rim. The trader offers 16 food for 8 wood and promises it is only slightly stale.", options: [{ label: "Trade (−8 wood, +16 food)", disabled: me(w).stock.wood < 8 ? "Not enough wood" : undefined }, { label: "Wave them off" }], expiresAt: w.time + 60, params: {} }),
    resolve: (w, o) => {
      if (o === 0) {
        me(w).stock.wood -= 8;
        me(w).stock.food += 16;
        return "You traded 8 wood for 16 slightly stale food. Nobody complained. Much.";
      }
      return "The sky-trader left, muttering about ungrateful Overlords.";
    },
  },
  {
    id: "stray",
    weight: 3,
    available: (w) => population(w, w.playerFaction) < 24,
    make: (w) => {
      const species = pick(w, ["goblin", "trollkin", "mushroom"] as SpeciesId[]);
      return { id: "stray", title: "A stray arrives", text: `A damp, hopeful ${species === "mushroom" ? "mushroom person" : species} drifts in on a leaf and asks to stay. Taking them in costs 5 food for the welcome feast.`, options: [{ label: "Welcome them (−5 food)", disabled: me(w).stock.food < 5 ? "Not enough food" : undefined }, { label: "Send them away" }], expiresAt: w.time + 60, params: { species } };
    },
    resolve: (w, o, p) => {
      if (o === 0) {
        const rng = worldRng(w);
        const isl = w.islands.find((i) => i.id === me(w).homeIslandId)!;
        const c = spawnCreature(w, p.params.species as SpeciesId, w.playerFaction, isl.id, isl.spawnPoint.x + rng.range(-1, 1), isl.spawnPoint.z + rng.range(-1, 1), rng);
        saveRng(w, rng);
        me(w).stock.food -= 5;
        c.traits = [...new Set([...c.traits, "loyal" as const])].slice(0, 3);
        effect(w, "sparkle", c.x, c.z, { ttl: 1.5, color: "#ffe08a" });
        return `${c.name} joined your settlement and immediately asked where the food is kept.`;
      }
      return "The stray drifted on to the next island. Somewhere, a rival got a free worker.";
    },
  },
  {
    id: "shiny",
    weight: 2,
    available: (w) => rivals(w).length > 0 && creaturesOf(w, w.playerFaction).length > 0,
    make: (w) => {
      const c = pick(w, creaturesOf(w, w.playerFaction));
      const r = pick(w, rivals(w));
      return { id: "shiny", title: `${c.name} found a shiny stone`, text: `${c.name} is clutching a stone that hums faintly. ${r.name} would very much like it.`, options: [{ label: "Keep it (+6 essence)" }, { label: `Gift it to ${r.name} (+relations)` }], expiresAt: w.time + 60, params: { rival: r.id, creature: c.id } };
    },
    resolve: (w, o, p) => {
      if (o === 0) {
        me(w).essence += 6;
        return "You kept the humming stone. It is now humming in your treasury.";
      }
      noteAIEvent(w, String(p.params.rival), "gift", 14, "They gifted me a humming stone.");
      return `${w.factions[String(p.params.rival)]?.name} received the humming stone and is, for now, delighted.`;
    },
  },
  {
    id: "cold_snap",
    weight: 2,
    available: () => true,
    make: (w) => ({ id: "cold_snap", title: "A cold snap rolls in", text: "Frost on the berry bushes. Your creatures are huddling. Burn 6 wood for a roaring fire, or let them toughen up?", options: [{ label: "Burn 6 wood (everyone cheers up)", disabled: me(w).stock.wood < 6 ? "Not enough wood" : undefined }, { label: "Tough it out (everyone's tired)" }], expiresAt: w.time + 60, params: {} }),
    resolve: (w, o) => {
      const cs = creaturesOf(w, w.playerFaction);
      if (o === 0) {
        me(w).stock.wood -= 6;
        for (const c of cs) {
          c.happiness = Math.min(100, c.happiness + 18);
          remember(c, "celebrated", 0.8, undefined, undefined, undefined, w.time);
        }
        return "A roaring fire. Everyone gathered round and told lies about their achievements.";
      }
      for (const c of cs) c.energy = Math.max(5, c.energy - 25);
      return "Your creatures toughed out the cold snap. They would like it noted that they did not enjoy it.";
    },
  },
  {
    id: "prank_war",
    weight: 2,
    available: (w) => creaturesOf(w, w.playerFaction).length >= 2,
    make: (w) => {
      const cs = creaturesOf(w, w.playerFaction);
      const a = pick(w, cs);
      const b = pick(w, cs.filter((c) => c.id !== a.id));
      return { id: "prank_war", title: "A prank war is escalating", text: `${a.name} filled ${b.name}'s hat with berries. ${b.name} is planning something involving a rock. Intervene?`, options: [{ label: "Make them shake hands" }, { label: "Let it play out" }], expiresAt: w.time + 60, params: { a: a.id, b: b.id } };
    },
    resolve: (w, o, p) => {
      const a = w.creatures[Number(p.params.a)];
      const b = w.creatures[Number(p.params.b)];
      if (!a || !b) return "The prank war fizzled out on its own.";
      if (o === 0) {
        relation(a, b.id, 30);
        relation(b, a.id, 30);
        effect(w, "heart", (a.x + b.x) / 2, (a.z + b.z) / 2, { ttl: 1.5, y: 1 });
        return `${a.name} and ${b.name} shook hands. Begrudgingly. They are now, technically, friends.`;
      }
      relation(a, b.id, -25);
      relation(b, a.id, -25);
      b.health = Math.max(20, b.health - 10);
      return `${b.name}'s rock plan worked. ${a.name} has a lump and a grudge.`;
    },
  },
  {
    id: "bloom",
    weight: 2,
    available: (w) => rivals(w).some((f) => f.persona === "wildkeeper"),
    make: (w) => ({ id: "bloom", title: "Glowing mushrooms bloomed overnight", text: "A ring of luminous mushrooms appeared by the lake. Harvest them for food, or leave them be and earn the Wildkeeper's quiet approval?", options: [{ label: "Harvest (+14 food)" }, { label: "Leave them (+5 essence, Wildkeeper pleased)" }], expiresAt: w.time + 60, params: {} }),
    resolve: (w, o) => {
      if (o === 0) {
        me(w).stock.food += 14;
        noteAIEvent(w, "ai_wildkeeper", "harvest_bloom", -4, "They harvested the luminous bloom.");
        return "The glowing mushrooms were delicious and only mildly hallucinogenic.";
      }
      me(w).essence += 5;
      noteAIEvent(w, "ai_wildkeeper", "spared_bloom", 10, "They left the luminous bloom untouched.");
      return "You left the bloom. The Wildkeeper noticed. Essence hummed in the air.";
    },
  },
  {
    id: "envoy",
    weight: 2,
    available: (w) => rivals(w).some((f) => (f.relations[w.playerFaction] ?? 0) < 0),
    make: (w) => {
      const r = pick(w, rivals(w).filter((f) => (f.relations[w.playerFaction] ?? 0) < 0));
      return { id: "envoy", title: `An envoy from ${r.name}`, text: `A nervous goblin with a white flag proposes a truce: ${r.name} will stop their scheming if you gift 6 food as a sign of good faith.`, options: [{ label: "Accept the truce (−6 food)", disabled: me(w).stock.food < 6 ? "Not enough food" : undefined }, { label: "Throw the envoy in the lake" }], expiresAt: w.time + 60, params: { rival: r.id } };
    },
    resolve: (w, o, p) => {
      const r = w.factions[String(p.params.rival)];
      if (o === 0) {
        me(w).stock.food -= 6;
        if (r) r.stock.food += 6;
        noteAIEvent(w, String(p.params.rival), "truce", 25, "They accepted my truce.");
        return `Truce with ${r?.name}. The envoy left with 6 food and visible relief.`;
      }
      noteAIEvent(w, String(p.params.rival), "envoy_dunked", -15, "They threw my envoy in a lake.");
      return `The envoy was thrown in the lake. ${r?.name} will not forget this. The envoy certainly won't.`;
    },
  },
  {
    id: "map",
    weight: 2,
    available: (w) => creaturesOf(w, w.playerFaction).length >= 3,
    make: (w) => {
      const c = pick(w, creaturesOf(w, w.playerFaction));
      return { id: "map", title: "An old map", text: `${c.name} dug up a map with an X on it. Digging there will take them away from work for a while, but X usually means stone.`, options: [{ label: `Send ${c.name} to dig (+15 stone, they're tired after)` }, { label: "It's probably nothing" }], expiresAt: w.time + 60, params: { creature: c.id } };
    },
    resolve: (w, o, p) => {
      const c = w.creatures[Number(p.params.creature)];
      if (o === 0 && c) {
        me(w).stock.stone += 15;
        c.energy = Math.max(5, c.energy - 40);
        c.skills.exploration += 10;
        effect(w, "sparkle", c.x, c.z, { ttl: 1.5, color: "#c7c7c7" });
        return `${c.name} dug all afternoon and found 15 stone, two bones and a sense of accomplishment.`;
      }
      return "The map was used to wrap a sandwich.";
    },
  },
];

export function maybeSpawnOmen(w: World) {
  if (w.omen || w.meta.mode === "sandbox" || w.meta.mode === "challenge") return;
  if (w.time < w.nextOmenAt) return;
  if (creaturesOf(w, w.playerFaction).length === 0) return;
  const rng = worldRng(w);
  const pool = OMENS.filter((o) => o.available(w) && (w.flags[`omen_last_${o.id}`] as number | undefined) !== w.day);
  if (pool.length) {
    const total = pool.reduce((s, o) => s + o.weight, 0);
    let r = rng.next() * total;
    let def = pool[0];
    for (const o of pool) {
      r -= o.weight;
      if (r <= 0) {
        def = o;
        break;
      }
    }
    saveRng(w, rng);
    w.omen = def.make(w);
    w.flags[`omen_last_${def.id}`] = w.day;
    chronicle(w, `Omen: ${w.omen.title}.`, "story", 2);
  } else saveRng(w, rng);
  w.nextOmenAt = w.time + 95 + rng.range(0, 35);
}

export function expireOmen(w: World) {
  if (w.omen && w.time > w.omen.expiresAt) {
    chronicle(w, `The moment passed: ${w.omen.title.toLowerCase()} went unanswered.`, "story", 1);
    w.omen = null;
  }
}

export function resolveOmen(w: World, option: number): { ok: true } | { ok: false; reason: string } {
  const p = w.omen;
  if (!p) return { ok: false, reason: "No omen to answer" };
  const def = OMENS.find((o) => o.id === p.id);
  if (!def) {
    w.omen = null;
    return { ok: false, reason: "Unknown omen" };
  }
  const opt = p.options[option];
  if (!opt) return { ok: false, reason: "Bad option" };
  if (opt.disabled) return { ok: false, reason: opt.disabled };
  const line = def.resolve(w, option, p);
  w.omen = null;
  w.stats.omens++;
  addXp(w, 25, "omen");
  chronicle(w, line, "story", 2);
  void canAfford;
  void unlockAchievement;
  return { ok: true };
}
