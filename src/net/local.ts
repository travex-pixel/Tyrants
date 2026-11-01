import type { NetMessage, PresenceInfo, Transport } from "./transport";

/**
 * In-memory transport bus for tests and local development. Every LocalTransport joined to the same
 * room name receives broadcasts from the others; presence is tracked synchronously.
 */
const rooms = new Map<string, Set<LocalTransport>>();
const stored = new Map<string, { snapshot: string; name: string; mode: string; mpMode: string; updatedAt: number }>();

export class LocalTransport implements Transport {
  readonly me: PresenceInfo;
  private room = "";
  private msgCbs = new Set<(m: NetMessage) => void>();
  private presCbs = new Set<(p: PresenceInfo[]) => void>();
  public latency = 0; // simulated delivery delay (ms)

  constructor(me: PresenceInfo) {
    this.me = me;
  }
  async join(room: string) {
    this.room = room;
    if (!rooms.has(room)) rooms.set(room, new Set());
    rooms.get(room)!.add(this);
    this.notifyPresence();
  }
  async leave() {
    const set = rooms.get(this.room);
    if (set) {
      set.delete(this);
      for (const t of set) t.notifyPresence();
    }
  }
  private notifyPresence() {
    const list = this.presence();
    for (const t of rooms.get(this.room) ?? []) for (const cb of t.presCbs) cb(list);
  }
  presence(): PresenceInfo[] {
    return Array.from(rooms.get(this.room) ?? [])
      .map((t) => t.me)
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }
  send(msg: NetMessage) {
    const copy = JSON.parse(JSON.stringify(msg)) as NetMessage;
    for (const t of rooms.get(this.room) ?? []) {
      if (t === this) continue;
      const deliver = () => {
        for (const cb of t.msgCbs) cb(copy);
      };
      if (this.latency > 0) setTimeout(deliver, this.latency);
      else deliver();
    }
  }
  onMessage(cb: (m: NetMessage) => void) {
    this.msgCbs.add(cb);
    return () => this.msgCbs.delete(cb);
  }
  onPresence(cb: (p: PresenceInfo[]) => void) {
    this.presCbs.add(cb);
    return () => this.presCbs.delete(cb);
  }
  async saveRoom(room: string, data: { name: string; mode: string; snapshot: string; hostId: string; players: number; mpMode: string }) {
    stored.set(room, { snapshot: data.snapshot, name: data.name, mode: data.mode, mpMode: data.mpMode, updatedAt: Date.now() });
  }
  async loadRoom(room: string) {
    return stored.get(room) ?? null;
  }
  static reset() {
    rooms.clear();
    stored.clear();
  }
}
