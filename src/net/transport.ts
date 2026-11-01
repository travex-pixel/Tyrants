/**
 * Transport abstraction for multiplayer. The game only talks to this interface, so the
 * Supabase implementation can be swapped for a dedicated authoritative server later.
 */
export interface PresenceInfo {
  id: string;
  name: string;
  color: string;
  joinedAt: number;
  faction: string;
}

export type NetMessage =
  | { kind: "cmd"; from: string; cmd: unknown; seq: number }
  | { kind: "delta"; delta: unknown }
  | { kind: "snapshot"; json: string; part: number; parts: number; id: number }
  | { kind: "needSnapshot"; from: string }
  | { kind: "hello"; from: string; name: string }
  | { kind: "hostIs"; hostId: string }
  | { kind: "chat"; from: string; name: string; text: string }
  | { kind: "ping"; from: string; t: number }
  | { kind: "pong"; to: string; t: number };

export interface Transport {
  readonly me: PresenceInfo;
  join(room: string): Promise<void>;
  leave(): Promise<void>;
  send(msg: NetMessage): void;
  onMessage(cb: (msg: NetMessage) => void): () => void;
  onPresence(cb: (players: PresenceInfo[]) => void): () => void;
  presence(): PresenceInfo[];
  /** Persist/load a room snapshot (optional capability). */
  saveRoom(room: string, data: { name: string; mode: string; snapshot: string; hostId: string; players: number; mpMode: string }): Promise<void>;
  loadRoom(room: string): Promise<{ snapshot: string; name: string; mode: string; mpMode: string; updatedAt: number } | null>;
}

export function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}
