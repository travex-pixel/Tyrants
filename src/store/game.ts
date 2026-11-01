import { create } from "zustand";
import type { BuildingType, ChronicleEntry, PowerId, SpeciesId } from "@/src/sim/types";
import { DEFAULT_SETTINGS, type Settings } from "@/src/persistence/saves";
import type { OfflineReport } from "@/src/sim/offline";

export type Screen = "boot" | "menu" | "game";
export type Panel = "none" | "build" | "chronicle" | "players" | "rivals" | "achievements" | "settings" | "challenges" | "pause" | "powers";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "good" | "bad" | "story";
  t: number;
}

export interface NetStatus {
  enabled: boolean; // supabase configured
  connected: boolean;
  role: "none" | "host" | "client";
  roomCode: string | null;
  players: { id: string; name: string; color: string; isHost: boolean; faction: string }[];
  error: string | null;
  latency: number;
}

interface GameStore {
  screen: Screen;
  setScreen: (s: Screen) => void;
  uiTick: number; // bumped ~4x/s so HUD re-reads the world
  bump: () => void;
  selectedCreature: number | null;
  select: (id: number | null) => void;
  hoverCreature: number | null;
  setHover: (id: number | null) => void;
  selectedBuilding: number | null;
  selectBuilding: (id: number | null) => void;
  selectedIsland: number | null;
  selectIsland: (id: number | null) => void;
  power: PowerId;
  setPower: (p: PowerId) => void;
  spawnSpecies: SpeciesId;
  setSpawnSpecies: (s: SpeciesId) => void;
  buildType: BuildingType | null;
  setBuildType: (b: BuildingType | null) => void;
  panel: Panel;
  setPanel: (p: Panel) => void;
  toasts: Toast[];
  toast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
  lastChronicleSeen: number;
  setLastChronicleSeen: (id: number) => void;
  intro: number; // -1 = not showing; 0..4 = stage
  setIntro: (n: number) => void;
  briefing: OfflineReport | null;
  setBriefing: (r: OfflineReport | null) => void;
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  net: NetStatus;
  setNet: (n: Partial<NetStatus>) => void;
  cameraFocus: { x: number; z: number; zoom?: number; t: number } | null;
  focusCamera: (x: number, z: number, zoom?: number) => void;
  followCreature: boolean;
  setFollow: (f: boolean) => void;
  cursorWorld: { x: number; z: number; valid: boolean };
  setCursorWorld: (c: { x: number; z: number; valid: boolean }) => void;
  storyFeed: ChronicleEntry[];
  pushStory: (e: ChronicleEntry) => void;
  fps: number;
  setFps: (f: number) => void;
  menuSub: "main" | "friends" | "challenges" | "saves" | "settings" | "new";
  setMenuSub: (m: GameStore["menuSub"]) => void;
  pendingJoinCode: string | null;
  setPendingJoinCode: (c: string | null) => void;
  cooldowns: Record<string, number>;
  setCooldown: (p: string, until: number) => void;
  commandMode: boolean;
  setCommandMode: (v: boolean) => void;
}

let toastId = 1;

export const useGame = create<GameStore>((set) => ({
  screen: "boot",
  setScreen: (screen) => set({ screen }),
  uiTick: 0,
  bump: () => set((s) => ({ uiTick: s.uiTick + 1 })),
  selectedCreature: null,
  select: (id) => set({ selectedCreature: id, selectedBuilding: null, selectedIsland: null, followCreature: false }),
  hoverCreature: null,
  setHover: (id) => set((s) => (s.hoverCreature === id ? s : { hoverCreature: id })),
  selectedBuilding: null,
  selectBuilding: (id) => set({ selectedBuilding: id, selectedCreature: null, selectedIsland: null }),
  selectedIsland: null,
  selectIsland: (id) => set({ selectedIsland: id, selectedCreature: null, selectedBuilding: null }),
  power: "grab",
  setPower: (power) => set({ power, buildType: null }),
  spawnSpecies: "goblin",
  setSpawnSpecies: (spawnSpecies) => set({ spawnSpecies }),
  buildType: null,
  setBuildType: (buildType) => set({ buildType, panel: "none" }),
  panel: "none",
  setPanel: (panel) => set((s) => ({ panel: s.panel === panel ? "none" : panel })),
  toasts: [],
  toast: (text, kind = "info") =>
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id: toastId++, text, kind, t: Date.now() }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  lastChronicleSeen: 0,
  setLastChronicleSeen: (lastChronicleSeen) => set({ lastChronicleSeen }),
  intro: -1,
  setIntro: (intro) => set({ intro }),
  briefing: null,
  setBriefing: (briefing) => set({ briefing }),
  settings: DEFAULT_SETTINGS,
  setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
  net: { enabled: false, connected: false, role: "none", roomCode: null, players: [], error: null, latency: 0 },
  setNet: (n) => set((s) => ({ net: { ...s.net, ...n } })),
  cameraFocus: null,
  focusCamera: (x, z, zoom) => set({ cameraFocus: { x, z, zoom, t: Date.now() } }),
  followCreature: false,
  setFollow: (followCreature) => set({ followCreature }),
  cursorWorld: { x: 0, z: 0, valid: false },
  setCursorWorld: (cursorWorld) => set({ cursorWorld }),
  storyFeed: [],
  pushStory: (e) => set((s) => ({ storyFeed: [...s.storyFeed.slice(-3), e] })),
  fps: 60,
  setFps: (fps) => set({ fps }),
  menuSub: "main",
  setMenuSub: (menuSub) => set({ menuSub }),
  pendingJoinCode: null,
  setPendingJoinCode: (pendingJoinCode) => set({ pendingJoinCode }),
  cooldowns: {},
  setCooldown: (p, until) => set((s) => ({ cooldowns: { ...s.cooldowns, [p]: until } })),
  commandMode: false,
  setCommandMode: (commandMode) => set({ commandMode }),
}));
