import type { BuildingType, JobId, ResourceType, SkillId, SpeciesId, TraitId } from "./types";

export interface SpeciesDef {
  id: SpeciesId;
  name: string;
  plural: string;
  speed: number;
  carry: number; // units per trip
  gatherMul: Partial<Record<ResourceType, number>>; // gather speed multipliers
  buildMul: number;
  farmMul: number;
  hungerRate: number; // per second
  energyRate: number; // drain per second while working
  jobAffinity: Record<JobId, number>;
  traitBias: Partial<Record<TraitId, number>>; // probability weights
  color: string;
  accent: string;
  height: number; // visual
  blurb: string;
}

export const SPECIES: Record<SpeciesId, SpeciesDef> = {
  goblin: {
    id: "goblin",
    name: "Goblin",
    plural: "Goblins",
    speed: 2.6,
    carry: 3,
    gatherMul: { wood: 1.25, stone: 1.1, food: 1.3 },
    buildMul: 0.8,
    farmMul: 0.7,
    hungerRate: 0.14,
    energyRate: 0.55,
    jobAffinity: { gather: 1.5, build: 0.7, farm: 0.6, haul: 1.2, explore: 1.4 },
    traitBias: { greedy: 3, mischievous: 3, curious: 2, clumsy: 1.5, lazy: 1, brave: 0.6, loyal: 0.4, hardworking: 0.7 },
    color: "#6fb24a",
    accent: "#c9415a",
    height: 0.55,
    blurb: "Fast, greedy and unreliable. Excellent gatherers; terrible at keeping their hands to themselves.",
  },
  trollkin: {
    id: "trollkin",
    name: "Trollkin",
    plural: "Trollkins",
    speed: 1.7,
    carry: 6,
    gatherMul: { wood: 0.9, stone: 1.4, food: 0.6 },
    buildMul: 1.6,
    farmMul: 0.6,
    hungerRate: 0.2,
    energyRate: 0.4,
    jobAffinity: { gather: 0.8, build: 1.8, farm: 0.5, haul: 1.6, explore: 0.4 },
    traitBias: { loyal: 3, brave: 2.5, hardworking: 2, lazy: 1.2, clumsy: 1, greedy: 0.4, mischievous: 0.3, curious: 0.5 },
    color: "#7d8fa6",
    accent: "#d9b36c",
    height: 0.95,
    blurb: "Strong, loyal and slow. Builds like a dream, eats like a nightmare.",
  },
  mushroom: {
    id: "mushroom",
    name: "Mushroom Folk",
    plural: "Mushroom Folk",
    speed: 2.0,
    carry: 3,
    gatherMul: { wood: 0.7, stone: 0.6, food: 1.5 },
    buildMul: 0.9,
    farmMul: 1.8,
    hungerRate: 0.1,
    energyRate: 0.35,
    jobAffinity: { gather: 1.0, build: 0.8, farm: 1.9, haul: 0.8, explore: 1.1 },
    traitBias: { curious: 3, loyal: 1.5, hardworking: 1.3, brave: 0.8, lazy: 1, clumsy: 0.6, greedy: 0.3, mischievous: 0.8 },
    color: "#e6d3b3",
    accent: "#d9643a",
    height: 0.7,
    blurb: "Peaceful, eccentric farmers who keep everyone fed and occasionally talk to plants.",
  },
};

export const TRAITS: Record<TraitId, { name: string; text: string }> = {
  greedy: { name: "Greedy", text: "Hoards resources and may steal food." },
  lazy: { name: "Lazy", text: "Takes long breaks and avoids heavy work." },
  brave: { name: "Brave", text: "Investigates danger and rarely flees." },
  curious: { name: "Curious", text: "Wanders off to poke at interesting things." },
  loyal: { name: "Loyal", text: "Helps friends and sticks with the group." },
  mischievous: { name: "Mischievous", text: "Pranks and pesters other creatures." },
  hardworking: { name: "Hardworking", text: "Works faster and takes fewer breaks." },
  clumsy: { name: "Clumsy", text: "Drops things. Frequently." },
};

export const SKILLS: Record<SkillId, { name: string }> = {
  woodcutting: { name: "Woodcutting" },
  construction: { name: "Construction" },
  farming: { name: "Farming" },
  exploration: { name: "Exploration" },
  gathering: { name: "Gathering" },
};

/** Skill level 1..10 from xp. */
export function skillLevel(xp: number): number {
  return Math.min(10, 1 + Math.floor(Math.sqrt(xp / 12)));
}
export function skillEfficiency(xp: number): number {
  return 1 + (skillLevel(xp) - 1) * 0.12;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  cost: Partial<Record<ResourceType, number>>;
  work: number; // builder-seconds
  footprint: number; // radius in cells
  capacity?: number; // house occupants
  text: string;
  workers?: { job: JobId; count: number };
  unlock?: string; // achievement id required
}

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  campfire: { type: "campfire", name: "Campfire", cost: { wood: 4 }, work: 6, footprint: 1, text: "Heart of a settlement. Creatures eat, rest and gossip here. Acts as a drop-off point." },
  storage: { type: "storage", name: "Storage Hut", cost: { wood: 10 }, work: 14, footprint: 1, text: "A drop-off point for gathered resources. Shortens hauling trips." },
  lumber: { type: "lumber", name: "Lumber Camp", cost: { wood: 8, stone: 2 }, work: 16, footprint: 1, text: "Keeps three woodcutters busy and makes chopping faster nearby.", workers: { job: "gather", count: 3 } },
  farm: { type: "farm", name: "Farm", cost: { wood: 6 }, work: 12, footprint: 2, text: "Grows crops that farmers tend and harvest for food.", workers: { job: "farm", count: 2 } },
  house: { type: "house", name: "Small House", cost: { wood: 12, stone: 4 }, work: 22, footprint: 1, capacity: 3, text: "Homes three creatures. Sleeping indoors restores more energy and happiness." },
  workshop: { type: "workshop", name: "Workshop", cost: { wood: 16, stone: 10 }, work: 30, footprint: 2, text: "Builders work 40% faster across the settlement and construction skill grows quicker." },
  totem: { type: "totem", name: "Totem", cost: { stone: 8, wood: 4 }, work: 12, footprint: 1, text: "A monument to your ego. Raises happiness nearby and marks territory.", unlock: "first_workshop" },
};

export const RESOURCE_NAMES: Record<ResourceType, string> = { wood: "Wood", stone: "Stone", food: "Food" };
