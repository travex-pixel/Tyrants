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
  verdant: { grass: "#6a8f40", meadow: "#98ad4e", grassDark: "#4a7536", dirt: "#8c6e52", sand: "#cdb58f", rock: "#9d9a93", peak: "#aea08a", cliffA: "#9c5a3c", cliffB: "#bf8f63", cliffC: "#5e3a29", canopy: ["#4f8a36", "#6ea444", "#8cbf4c", "#3f7a33", "#a7c653"], blossom: ["#f2b7c6", "#f7d9a6", "#ffffff"], trunk: "#6e4a2e", water: "#39b3b0", waterDeep: "#1b6f82" },
  ember: { grass: "#8d7a45", meadow: "#b59a52", grassDark: "#5e5232", dirt: "#7a4a35", sand: "#6a4f44", rock: "#4e3f3b", peak: "#d8663a", cliffA: "#4a2f2a", cliffB: "#7a4a3c", cliffC: "#2e1d1b", canopy: ["#c2652e", "#a84d2a", "#d98a3c", "#7f3a22"], blossom: ["#ff9a5a", "#ffd27a"], trunk: "#3d2a22", water: "#4fa0b0", waterDeep: "#1e5668" },
  crystal: { grass: "#7fb9a8", meadow: "#a8d0b6", grassDark: "#5a9484", dirt: "#8a7aa8", sand: "#d7e0e8", rock: "#7d7aa8", peak: "#c0b2f2", cliffA: "#6a5f98", cliffB: "#8f84c0", cliffC: "#3f3764", canopy: ["#6fd6c0", "#8f8ff0", "#b388ff", "#5fb8a8"], blossom: ["#d9c6ff", "#ffffff"], trunk: "#5a4a7a", water: "#64d4ee", waterDeep: "#2a6fa0" },
  frost: { grass: "#dfe9f2", meadow: "#eef4f8", grassDark: "#b9ccd9", dirt: "#9aa6b2", sand: "#cfd8e0", rock: "#8da0b3", peak: "#ffffff", cliffA: "#7f8fa3", cliffB: "#a9b8c8", cliffC: "#55657a", canopy: ["#c9dde8", "#9ec4d6", "#e6f1f7", "#7fa8c0"], blossom: ["#ffffff"], trunk: "#5c4a3d", water: "#8fd3ff", waterDeep: "#3f7fb8" },
} as const;
