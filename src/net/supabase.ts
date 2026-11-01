import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { NetMessage, PresenceInfo, Transport } from "./transport";

export function supabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      realtime: { params: { eventsPerSecond: 30 } },
      auth: { persistSession: false },
    });
  }
  return client;
}

/** Supabase Realtime (broadcast + presence) transport with Postgres room persistence. */
export class SupabaseTransport implements Transport {
  readonly me: PresenceInfo;
  private sb: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private msgCbs = new Set<(m: NetMessage) => void>();
  private presCbs = new Set<(p: PresenceInfo[]) => void>();
  private players: PresenceInfo[] = [];
  private room = "";

  constructor(me: PresenceInfo) {
    const sb = getSupabase();
    if (!sb) throw new Error("Supabase is not configured");
    this.sb = sb;
    this.me = me;
  }

  async join(room: string): Promise<void> {
    this.room = room;
    const ch = this.sb.channel(`room:${room}`, { config: { broadcast: { self: false, ack: false }, presence: { key: this.me.id } } });
    this.channel = ch;
    ch.on("broadcast", { event: "msg" }, (payload) => {
      const m = payload.payload as NetMessage;
      for (const cb of this.msgCbs) cb(m);
    });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<PresenceInfo>();
      const list: PresenceInfo[] = [];
      for (const key in state) {
        const arr = state[key];
        if (arr && arr[0]) list.push({ id: arr[0].id, name: arr[0].name, color: arr[0].color, joinedAt: arr[0].joinedAt, faction: arr[0].faction });
      }
      list.sort((a, b) => a.joinedAt - b.joinedAt);
      this.players = list;
      for (const cb of this.presCbs) cb(list);
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out connecting to the room")), 12000);
      ch.subscribe(async (status, err) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(timer);
          await ch.track(this.me);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(err ?? new Error(`Realtime ${status}`));
        }
      });
    });
  }

  async leave(): Promise<void> {
    if (this.channel) {
      try {
        await this.channel.untrack();
        await this.sb.removeChannel(this.channel);
      } catch {
        /* ignore */
      }
      this.channel = null;
    }
  }

  send(msg: NetMessage): void {
    this.channel?.send({ type: "broadcast", event: "msg", payload: msg });
  }

  onMessage(cb: (msg: NetMessage) => void): () => void {
    this.msgCbs.add(cb);
    return () => this.msgCbs.delete(cb);
  }
  onPresence(cb: (players: PresenceInfo[]) => void): () => void {
    this.presCbs.add(cb);
    return () => this.presCbs.delete(cb);
  }
  presence(): PresenceInfo[] {
    return this.players;
  }

  async saveRoom(room: string, data: { name: string; mode: string; snapshot: string; hostId: string; players: number; mpMode: string }): Promise<void> {
    const { error } = await this.sb.from("rooms").upsert({ code: room, name: data.name, mode: data.mode, mp_mode: data.mpMode, snapshot: data.snapshot, host_id: data.hostId, player_count: data.players, updated_at: new Date().toISOString() }, { onConflict: "code" });
    if (error) throw error;
  }

  async loadRoom(room: string) {
    const { data, error } = await this.sb.from("rooms").select("snapshot,name,mode,mp_mode,updated_at").eq("code", room).maybeSingle();
    if (error || !data) return null;
    return { snapshot: data.snapshot as string, name: data.name as string, mode: data.mode as string, mpMode: (data.mp_mode as string) ?? "shared", updatedAt: new Date(data.updated_at as string).getTime() };
  }
}
