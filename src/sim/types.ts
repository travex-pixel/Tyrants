/**
 * Core simulation data model for Little Tyrants.
 * Everything here is plain, JSON-serialisable data (typed arrays are converted in snapshot.ts).
 * The engine (engine.ts) mutates a World in fixed time steps; the renderer only reads it.
 */

export type SpeciesId = "goblin" | "trollkin" | "mushroom" | "boar";
export type ResourceType = "wood" | "stone" | "food";
export type BiomeId = "verdant" | "ember" | "crystal" | "frost";

export type TraitId =
  | "greedy"
  | "lazy"
  | "brave"
  | "curious"
  | "loyal"
  | "mischievous"
  | "hardworking"
  | "clumsy";

export type SkillId = "woodcutting" | "construction" | "farming" | "exploration" | "gathering";

export type CreatureState =
  | "idle"
  | "wander"
  | "seekFood"
  | "eat"
  | "rest"
  | "gather"
  | "carry"
  | "build"
  | "explore"
  | "socialise"
  | "flee"
  | "fight"
  | "follow"
  | "celebrate"
  | "recover"
  | "held"
  | "thrown"
  | "swim"
  | "raid"
  | "aboard";

export type JobId = "gather" | "build" | "farm" | "haul" | "explore";

export type NodeKind = "tree" | "rock" | "berry" | "crop" | "crystal" | "stump";

export interface Vec2 {
  x: number;
  z: number;
}

export interface MemoryEntry {
  t: number; // sim time (seconds)
  kind: string; // e.g. "stolen_from", "helped", "thrown", "found"
  who?: number; // creature id
  x?: number;
  z?: number;
  weight: number; // relevance, decays
}

export interface CarriedItem {
  type: ResourceType;
  amount: number;
}

export interface Creature {
  id: number;
  name: string;
  species: SpeciesId;
  faction: string;
  islandId: number;
  age: number; // seconds alive
  traits: TraitId[];
  x: number;
  z: number;
  y: number; // vertical offset above terrain (used when thrown/held)
  vx: number;
  vz: number;
  vy: number;
  heading: number; // radians
  speedMul: number;
  scale: number; // 1 = normal; giants are 2.4
  health: number; // 0..100
  hunger: number; // 0 (full) .. 100 (starving)
  energy: number; // 100 (fresh) .. 0 (exhausted)
  social: number; // 100 satisfied .. 0 lonely
  happiness: number; // 0..100
  skills: Record<SkillId, number>; // xp
  state: CreatureState;
  stateTime: number; // seconds in current state
  decisionCooldown: number;
  taskId: number | null;
  path: Vec2[] | null;
  pathIndex: number;
  target: Vec2 | null;
  stuckTime: number;
  carrying: CarriedItem | null;
  homeId: number | null; // building id (house)
  relationships: Record<number, number>; // creatureId -> -100..100
  memory: MemoryEntry[];
  partnerId: number | null; // socialise / fight partner
  followId: number | null; // creature being followed (or -1 = player cursor, unused)
  blessedUntil: number;
  lastEventText?: string;
  held: boolean;
  bornAt: number;
  xpBadge?: string;
  variant: number; // visual variant 0..1
  mood: "happy" | "neutral" | "grumpy" | "scared";
  raidTarget?: { factionId: string; phase: "go" | "return"; homeIslandId?: number } | null;
  jobPref?: JobId | null;
  jumpy?: number; // times thrown/struck by the hand: 3+ = flees the cursor
  devout?: number; // times blessed: 3+ = follows and cheers the cursor
}

/** A tree or rock that the Overlord has uprooted: it flies, spins and shatters into resources. */
export interface Projectile {
  id: number;
  kind: "tree" | "rock" | "crystal";
  islandId: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  held: boolean;
  scale: number;
  variant: number;
  resource: ResourceType;
  amount: number;
  spin: number;
}

/** A sky-skiff ferrying creatures between islands along an arc. */
export interface Skiff {
  id: number;
  faction: string;
  fromIslandId: number;
  toIslandId: number;
  sx: number;
  sz: number;
  ex: number;
  ez: number;
  t: number; // 0..1
  duration: number;
  passengers: number[];
  purpose: "raid" | "home";
}

/** A timed, on-world dare generated from live state. */
export interface Dare {
  id: string;
  kind: "dunk" | "bowl" | "tree" | "friends" | "gather" | "bless3" | "tame";
  text: string;
  targetId?: number;
  targetId2?: number;
  x?: number;
  z?: number;
  startedAt: number;
  expiresAt: number;
  progress: number;
  target: number;
  essence: number;
  xp: number;
  baseline?: number;
}

export interface GoalState {
  active: string[];
  done: string[];
  completedAt: Record<string, number>;
}

export interface OmenOption {
  label: string;
  hint?: string;
  disabled?: string; // reason the option is unavailable
}
export interface PendingOmen {
  id: string;
  title: string;
  text: string;
  options: OmenOption[];
  expiresAt: number;
  params: Record<string, number | string>;
}

export interface ResourceNode {
  id: number;
  kind: NodeKind;
  resource: ResourceType;
  islandId: number;
  x: number;
  z: number;
  amount: number;
  maxAmount: number;
  regrow: number; // amount per minute
  scale: number;
  variant: number;
  reservedBy: number | null; // creature id
  burning?: number; // seconds remaining on fire
  ownerBuildingId?: number;
}

export interface GroundItem {
  id: number;
  type: ResourceType;
  amount: number;
  islandId: number;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  vy: number;
  reservedBy: number | null;
}

export type BuildingType = "campfire" | "storage" | "lumber" | "farm" | "house" | "workshop" | "totem" | "monument";

export interface Building {
  id: number;
  type: BuildingType;
  faction: string;
  islandId: number;
  x: number;
  z: number;
  rotation: number;
  cost: Partial<Record<ResourceType, number>>;
  delivered: Partial<Record<ResourceType, number>>;
  progress: number; // 0..1 construction
  complete: boolean;
  work: number; // total build work required (seconds of builder time)
  workDone: number;
  occupants: number[];
  cropTimer: number; // farms: 0..1 growth
  level: number;
  placedAt: number;
  struck?: number; // time of last lightning strike (for scorched visual)
  hp: number; // 0..100; fire, rocks, giants and lightning wear it down; at 0 it collapses
}

export interface Task {
  id: number;
  job: JobId;
  faction: string;
  islandId: number;
  kind: "gatherNode" | "haulItem" | "deliverMaterial" | "construct" | "tendFarm" | "exploreSpot";
  nodeId?: number;
  itemId?: number;
  buildingId?: number;
  resource?: ResourceType;
  amount?: number;
  x: number;
  z: number;
  assignedTo: number | null;
  priority: number;
  createdAt: number;
  attempts: number;
}

export interface Discovery {
  id: number;
  kind: "cave" | "glowplant" | "ruins" | "shrine" | "crystalVein";
  islandId: number;
  x: number;
  z: number;
  found: boolean;
  foundBy?: number;
  name: string;
  essence: number;
}

export interface Island {
  id: number;
  name: string;
  biome: BiomeId;
  ox: number; // world offset
  oz: number;
  size: number; // cells per side
  seed: number;
  heights: number[]; // (size+1)^2 vertex heights; < -0.5 means void
  waterLevel: number;
  blocked: number[]; // size*size: 0 free, 1 blocked (obstacle), 2 void/water
  dirty: boolean; // heights changed (render + nav rebuild)
  navVersion: number;
  ownerFaction: string | null;
  center: Vec2;
  spawnPoint: Vec2;
}

export type OverlordPersona = "hoarder" | "wildkeeper" | "architect";

export interface AIMemory {
  t: number;
  kind: string;
  delta: number;
  text: string;
}

export interface TradeOffer {
  id: number;
  from: string;
  give: Partial<Record<ResourceType, number>>;
  want: Partial<Record<ResourceType, number>>;
  expiresAt: number;
  text: string;
}

export interface Faction {
  id: string;
  name: string;
  color: string;
  isAI: boolean;
  persona?: OverlordPersona;
  homeIslandId: number;
  stock: Record<ResourceType, number>;
  essence: number;
  jobPriorities: Record<JobId, number>;
  relations: Record<string, number>; // other faction id -> -100..100
  aiMemory: AIMemory[];
  aiNextThink: number;
  aiGoal: string;
  aiGoalText: string;
  score: number;
  difficulty: "easy" | "normal" | "hard";
  tradeOffers: TradeOffer[];
  raidCooldown: number;
  growthTimer: number;
  stats: { gathered: number; built: number; thrown: number; struck: number; blessed: number; stolen: number };
}

export interface ChronicleEntry {
  id: number;
  t: number;
  day: number;
  text: string;
  kind: "story" | "build" | "power" | "rival" | "discovery" | "disaster" | "social" | "milestone" | "player";
  importance: 1 | 2 | 3;
  faction?: string;
  x?: number;
  z?: number;
  islandId?: number;
}

export interface WorldEffect {
  id: number;
  kind: "lightning" | "bless" | "splash" | "dust" | "scorch" | "levelup" | "heart" | "anger" | "zzz" | "storm" | "sparkle" | "fall" | "text" | "crash";
  text?: string;
  x: number;
  z: number;
  y?: number;
  t: number; // time created
  ttl: number;
  size?: number;
  color?: string;
}

export interface Achievement {
  id: string;
  title: string;
  text: string;
  unlockedAt: number | null;
  essence: number;
}

export type PowerId = "grab" | "spawn" | "lightning" | "bless" | "terraform" | "giant" | "clone" | "storm";

export interface PlayerState {
  id: string;
  name: string;
  faction: string;
  color: string;
  cursorX: number;
  cursorZ: number;
  power: PowerId;
  lastSeen: number;
  isHost: boolean;
}

export interface ChallengeState {
  id: string;
  startedAt: number;
  duration: number; // seconds, 0 = untimed
  score: number;
  finished: boolean;
  result?: "won" | "lost" | "ended";
  summary?: string;
  params: Record<string, number | string | boolean>;
}

export type GameMode = "solo" | "friends" | "sandbox" | "challenge";

export interface WorldMeta {
  id: string;
  name: string;
  mode: GameMode;
  seed: number;
  createdAt: number; // wall-clock ms
  savedAt: number; // wall-clock ms
  version: number;
  roomCode?: string;
  mpMode?: "shared" | "rivals";
}

export interface World {
  meta: WorldMeta;
  time: number; // sim seconds
  tick: number;
  day: number;
  dayLength: number;
  nextId: number;
  islands: Island[];
  creatures: Record<number, Creature>;
  nodes: Record<number, ResourceNode>;
  items: Record<number, GroundItem>;
  buildings: Record<number, Building>;
  tasks: Record<number, Task>;
  discoveries: Record<number, Discovery>;
  factions: Record<string, Faction>;
  players: Record<string, PlayerState>;
  chronicle: ChronicleEntry[];
  effects: WorldEffect[];
  achievements: Record<string, Achievement>;
  unlockedPowers: PowerId[];
  challenge: ChallengeState | null;
  weather: { kind: "clear" | "storm"; until: number; intensity: number };
  rngState: number;
  playerFaction: string; // faction controlled by the local/human players (shared mode)
  stats: { thrown: number; struck: number; blessed: number; spawned: number; built: number; gathered: number; discoveries: number; treesThrown: number; raidsSent: number; omens: number; arrivals: number };
  flags: Record<string, boolean | number>;
  projectiles: Record<number, Projectile>;
  skiffs: Record<number, Skiff>;
  goals: GoalState;
  xp: number;
  level: number;
  omen: PendingOmen | null;
  nextOmenAt: number;
  dare: Dare | null;
  nextDareAt: number;
}

/** Commands are the only way players (local or remote) change the world. */
export type Command =
  | { type: "spawn"; species: SpeciesId; x: number; z: number; faction?: string; player?: string }
  | { type: "grab"; creatureId: number; player: string }
  | { type: "move"; creatureId: number; x: number; z: number; player: string }
  | { type: "throw"; creatureId: number; vx: number; vz: number; vy: number; player: string }
  | { type: "drop"; creatureId: number; player: string }
  | { type: "lightning"; x: number; z: number; player: string }
  | { type: "bless"; x: number; z: number; player: string }
  | { type: "terraform"; x: number; z: number; dir: 1 | -1; radius: number; player: string }
  | { type: "giant"; creatureId: number; player: string }
  | { type: "clone"; creatureId: number; player: string }
  | { type: "storm"; x: number; z: number; player: string }
  | { type: "place"; building: BuildingType; x: number; z: number; faction?: string; player?: string; instant?: boolean }
  | { type: "cancelBuilding"; buildingId: number; player: string }
  | { type: "setPriority"; job: JobId; value: number; faction?: string; player?: string }
  | { type: "command"; creatureId: number; x: number; z: number; player: string }
  | { type: "follow"; creatureId: number; targetId: number | null; player: string }
  | { type: "rename"; creatureId: number; name: string; player: string }
  | { type: "trade"; offerId: number; accept: boolean; player: string }
  | { type: "gift"; toFaction: string; resource: ResourceType; amount: number; player: string }
  | { type: "cursor"; x: number; z: number; player: string; power: PowerId }
  | { type: "grabNode"; nodeId: number; player: string }
  | { type: "moveNode"; projectileId: number; x: number; z: number; player: string }
  | { type: "throwNode"; projectileId: number; vx: number; vz: number; vy: number; player: string }
  | { type: "dropNode"; projectileId: number; player: string }
  | { type: "setJobPref"; creatureId: number; job: JobId | null; player: string }
  | { type: "resolveOmen"; option: number; player: string }
  | { type: "raid"; targetFaction: string; player: string }
  | { type: "joinPlayer"; player: PlayerState }
  | { type: "leavePlayer"; playerId: string }
  | { type: "setDifficulty"; difficulty: "easy" | "normal" | "hard" };

export type CommandResult = { ok: true; id?: number } | { ok: false; reason: string };
