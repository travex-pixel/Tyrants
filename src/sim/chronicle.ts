import type { ChronicleEntry, World, WorldEffect } from "./types";

export function chronicle(
  w: World,
  text: string,
  kind: ChronicleEntry["kind"] = "story",
  importance: 1 | 2 | 3 = 1,
  extra: Partial<Pick<ChronicleEntry, "faction" | "x" | "z" | "islandId">> = {},
): ChronicleEntry {
  const e: ChronicleEntry = { id: w.nextId++, t: w.time, day: w.day, text, kind, importance, ...extra };
  w.chronicle.push(e);
  if (w.chronicle.length > 400) w.chronicle.splice(0, w.chronicle.length - 400);
  return e;
}

export function effect(w: World, kind: WorldEffect["kind"], x: number, z: number, opts: Partial<WorldEffect> = {}): void {
  w.effects.push({ id: w.nextId++, kind, x, z, t: w.time, ttl: opts.ttl ?? 1.5, ...opts });
  if (w.effects.length > 120) w.effects.splice(0, w.effects.length - 120);
}

export function pruneEffects(w: World) {
  if (w.effects.length === 0) return;
  w.effects = w.effects.filter((e) => w.time - e.t < e.ttl);
}
