import type { GameSession } from "@/src/game/session";
import type { World } from "@/src/sim/types";

/** Module-level handle so R3F components can read the live world each frame without React re-renders. */
let session: GameSession | null = null;
const listeners = new Set<() => void>();

export function setSession(s: GameSession | null) {
  session = s;
  for (const l of listeners) l();
}
export function getSession(): GameSession | null {
  return session;
}
export function getWorld(): World | null {
  return session?.world ?? null;
}
export function onSessionChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Per-creature render smoothing state (not part of the sim). */
export interface RenderCreature {
  x: number;
  y: number;
  z: number;
  heading: number;
  phase: number;
  lastX: number;
  lastZ: number;
  speed: number;
  squash: number;
  seen: number;
}
export const renderCreatures = new Map<number, RenderCreature>();

export const BIOME_PALETTE = {
  verdant: { grass: "#6fbf5a", grassDark: "#4e9a45", sand: "#e6d4a3", rock: "#8c8578", peak: "#a9a596", canopy: ["#5fae4b", "#79c35c", "#4f9c3f", "#8fd16a"], trunk: "#7a5436", water: "#4fa3e0" },
  ember: { grass: "#9a7a4a", grassDark: "#6d5333", sand: "#5a4a44", rock: "#4a3f3d", peak: "#e0683a", canopy: ["#c2652e", "#a84d2a", "#d98a3c"], trunk: "#3d2a22", water: "#4fa3e0" },
  crystal: { grass: "#7fc9b8", grassDark: "#5ba795", sand: "#d7e4e8", rock: "#7d7aa8", peak: "#b5a8f0", canopy: ["#6fd6c0", "#8f8ff0", "#b388ff"], trunk: "#5a4a7a", water: "#6fd0ff" },
  frost: { grass: "#dfe9f2", grassDark: "#b9ccd9", sand: "#cfd8e0", rock: "#8da0b3", peak: "#ffffff", canopy: ["#c9dde8", "#9ec4d6", "#e6f1f7"], trunk: "#5c4a3d", water: "#8fd3ff" },
} as const;
