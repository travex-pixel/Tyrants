import { get, set, del, keys } from "idb-keyval";
import type { GameMode, World } from "@/src/sim/types";
import { serializeWorld, deserializeWorld } from "@/src/sim/snapshot";

export interface SaveMeta {
  id: string;
  name: string;
  mode: GameMode;
  savedAt: number;
  createdAt: number;
  day: number;
  population: number;
  buildings: number;
  seed: number;
  roomCode?: string;
}

const META_KEY = "lt:saves";
const WORLD_PREFIX = "lt:world:";
const isBrowser = typeof window !== "undefined" && typeof indexedDB !== "undefined";

export async function listSaves(): Promise<SaveMeta[]> {
  if (!isBrowser) return [];
  try {
    const list = (await get<SaveMeta[]>(META_KEY)) ?? [];
    return list.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function saveWorld(w: World): Promise<SaveMeta | null> {
  if (!isBrowser) return null;
  try {
    const json = serializeWorld(w);
    w.meta.savedAt = Date.now();
    let pop = 0;
    for (const id in w.creatures) if (w.creatures[id].faction === w.playerFaction) pop++;
    let buildings = 0;
    for (const id in w.buildings) if (w.buildings[id].faction === w.playerFaction && w.buildings[id].complete) buildings++;
    const meta: SaveMeta = { id: w.meta.id, name: w.meta.name, mode: w.meta.mode, savedAt: w.meta.savedAt, createdAt: w.meta.createdAt, day: w.day, population: pop, buildings, seed: w.meta.seed, roomCode: w.meta.roomCode };
    await set(WORLD_PREFIX + w.meta.id, json);
    const list = ((await get<SaveMeta[]>(META_KEY)) ?? []).filter((m) => m.id !== meta.id);
    list.unshift(meta);
    await set(META_KEY, list.slice(0, 12));
    return meta;
  } catch (e) {
    console.warn("save failed", e);
    return null;
  }
}

export async function loadWorld(id: string): Promise<World | null> {
  if (!isBrowser) return null;
  try {
    const json = await get<string>(WORLD_PREFIX + id);
    if (!json) return null;
    return deserializeWorld(json);
  } catch (e) {
    console.warn("load failed", e);
    return null;
  }
}

export async function deleteSave(id: string): Promise<void> {
  if (!isBrowser) return;
  try {
    await del(WORLD_PREFIX + id);
    const list = ((await get<SaveMeta[]>(META_KEY)) ?? []).filter((m) => m.id !== id);
    await set(META_KEY, list);
  } catch {
    /* ignore */
  }
}

export async function purgeOrphans() {
  if (!isBrowser) return;
  try {
    const list = (await get<SaveMeta[]>(META_KEY)) ?? [];
    const ids = new Set(list.map((m) => m.id));
    for (const k of await keys()) {
      if (typeof k === "string" && k.startsWith(WORLD_PREFIX) && !ids.has(k.slice(WORLD_PREFIX.length))) await del(k);
    }
  } catch {
    /* ignore */
  }
}

// ── Small settings / identity helpers (localStorage) ──
export interface Settings {
  master: number;
  sfx: number;
  ambient: number;
  quality: "low" | "medium" | "high";
  showNames: boolean;
  invertDrag: boolean;
}
export const DEFAULT_SETTINGS: Settings = { master: 0.8, sfx: 0.9, ambient: 0.6, quality: "high", showNames: true, invertDrag: false };

export function loadSettings(): Settings {
  if (typeof localStorage === "undefined") return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem("lt:settings") ?? "{}") as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function storeSettings(s: Settings) {
  try {
    localStorage.setItem("lt:settings", JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
export function introSeen(): boolean {
  try {
    return localStorage.getItem("lt:intro") === "1";
  } catch {
    return false;
  }
}
export function markIntroSeen() {
  try {
    localStorage.setItem("lt:intro", "1");
  } catch {
    /* ignore */
  }
}

const ADJ = ["Mighty", "Petty", "Grumpy", "Sneaky", "Dreadful", "Tiny", "Glorious", "Damp", "Shiny", "Wobbly"];
const NOUN = ["Overlord", "Tyrant", "Despot", "Menace", "Emperor", "Nuisance", "Sovereign", "Warlord", "Landlord", "Gremlin"];
export function getIdentity(): { id: string; name: string } {
  try {
    const raw = localStorage.getItem("lt:identity");
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const id = `p_${Math.random().toString(36).slice(2, 10)}`;
  const name = `${ADJ[Math.floor(Math.random() * ADJ.length)]} ${NOUN[Math.floor(Math.random() * NOUN.length)]}`;
  const ident = { id, name };
  try {
    localStorage.setItem("lt:identity", JSON.stringify(ident));
  } catch {
    /* ignore */
  }
  return ident;
}
export function setIdentityName(name: string) {
  const ident = getIdentity();
  ident.name = name.slice(0, 20);
  try {
    localStorage.setItem("lt:identity", JSON.stringify(ident));
  } catch {
    /* ignore */
  }
}
