import { Engine } from "@/src/sim/engine";
import type { ChronicleEntry, Command, CommandResult, PlayerState, World } from "@/src/sim/types";
import { createWorld, FACTION_COLORS, type CreateWorldOptions } from "@/src/sim/world";
import { serializeWorld, deserializeWorld, makeDelta, applyDelta, type Delta } from "@/src/sim/snapshot";
import { applyOfflineProgress, type OfflineReport } from "@/src/sim/offline";
import { saveWorld } from "@/src/persistence/saves";
import type { NetMessage, PresenceInfo, Transport } from "@/src/net/transport";
import { compressString, decompressString, chunkString } from "@/src/net/codec";
import { CHALLENGES, startChallenge } from "@/src/sim/challenges";

export type Role = "solo" | "host" | "client";

export interface SessionEvents {
  onChronicle?: (e: ChronicleEntry) => void;
  onNet?: (status: { connected: boolean; role: Role; players: PresenceInfo[]; error?: string | null; latency?: number }) => void;
  onWorldReplaced?: (w: World) => void;
  onToast?: (text: string, kind?: "info" | "good" | "bad") => void;
}

/**
 * GameSession drives one world: solo (local engine), host (local engine + broadcast), or client
 * (remote authoritative host; we render snapshots + deltas and send commands).
 */
export class GameSession {
  world: World;
  engine: Engine | null;
  role: Role = "solo";
  transport: Transport | null = null;
  me: PresenceInfo;
  roomCode: string | null = null;
  events: SessionEvents;
  private chronicleCursor = 0;
  private saveTimer = 0;
  private deltaTimer = 0;
  private snapshotTimer = 0;
  private persistTimer = 0;
  private lastEffectId = 0;
  private seq = 0;
  private unsubs: (() => void)[] = [];
  private incomingSnapshot: { id: number; parts: string[]; got: number; total: number } | null = null;
  private snapshotId = 0;
  private awaitingSnapshot = false;
  private lastSnapshotAt = 0;
  private pingTimer = 0;
  destroyed = false;
  offlineReport: OfflineReport | null = null;

  constructor(world: World, me: PresenceInfo, events: SessionEvents = {}) {
    this.world = world;
    this.engine = new Engine(world);
    this.me = me;
    this.events = events;
    this.chronicleCursor = world.chronicle.length;
    this.registerLocalPlayer();
  }

  // ── Factory helpers ──
  static newWorld(opts: CreateWorldOptions, me: PresenceInfo, events?: SessionEvents, challengeId?: string): GameSession {
    const ch = challengeId ? CHALLENGES.find((c) => c.id === challengeId) : undefined;
    const world = createWorld({ ...(ch?.worldOptions ?? {}), ...opts, mode: challengeId ? "challenge" : opts.mode });
    if (ch) startChallenge(world, ch);
    return new GameSession(world, me, events);
  }

  static fromSave(world: World, me: PresenceInfo, events?: SessionEvents): GameSession {
    const report = applyOfflineProgress(world);
    const s = new GameSession(world, me, events);
    s.offlineReport = report.elapsedReal >= 20 ? report : null;
    s.chronicleCursor = world.chronicle.length;
    return s;
  }

  private registerLocalPlayer() {
    const w = this.world;
    const faction = this.factionForPlayer(this.me.id, this.me.faction);
    this.me.faction = faction;
    const p: PlayerState = { id: this.me.id, name: this.me.name, faction, color: this.me.color, cursorX: 0, cursorZ: 0, power: "grab", lastSeen: w.time, isHost: this.role !== "client" };
    if (this.engine) this.engine.applyNow({ type: "joinPlayer", player: p });
  }

  private factionForPlayer(id: string, requested: string): string {
    const w = this.world;
    if (w.meta.mpMode === "rivals") {
      if (requested && requested !== "p1" && requested.startsWith("h_")) return requested;
      return `h_${id}`;
    }
    return w.playerFaction;
  }

  get myFaction(): string {
    return this.world.players[this.me.id]?.faction ?? this.world.playerFaction;
  }

  // ── Commands ──
  dispatch(cmd: Command): CommandResult {
    if (this.destroyed) return { ok: false, reason: "Session closed" };
    if (this.role === "client") {
      this.transport?.send({ kind: "cmd", from: this.me.id, cmd, seq: this.seq++ });
      return { ok: true };
    }
    return this.engine!.applyNow(cmd);
  }

  // ── Frame update ──
  update(dt: number) {
    if (this.destroyed) return;
    if (this.engine && this.role !== "client") {
      this.engine.update(dt);
      this.flushChronicle();
      // autosave local worlds
      if (this.role === "solo") {
        this.saveTimer += dt;
        if (this.saveTimer > 30) {
          this.saveTimer = 0;
          void this.save();
        }
      } else if (this.role === "host" && this.transport) {
        this.deltaTimer += dt;
        if (this.deltaTimer >= 0.2) {
          this.deltaTimer = 0;
          const d = makeDelta(this.world, this.lastEffectId);
          for (const e of this.world.effects) if (e.id > this.lastEffectId) this.lastEffectId = e.id;
          this.transport.send({ kind: "delta", delta: d });
        }
        this.snapshotTimer += dt;
        if (this.snapshotTimer >= 8) {
          this.snapshotTimer = 0;
          void this.broadcastSnapshot();
        }
        this.persistTimer += dt;
        if (this.persistTimer >= 30) {
          this.persistTimer = 0;
          void this.persistRoom();
        }
      }
    } else if (this.role === "client") {
      this.flushChronicle();
      this.pingTimer += dt;
      if (this.pingTimer > 5) {
        this.pingTimer = 0;
        this.transport?.send({ kind: "ping", from: this.me.id, t: Date.now() });
        if (this.awaitingSnapshot && Date.now() - this.lastSnapshotAt > 6000) this.transport?.send({ kind: "needSnapshot", from: this.me.id });
      }
      // if host vanished and we're the senior player, take over
      this.checkHostMigration();
    }
  }

  private flushChronicle() {
    const ch = this.world.chronicle;
    if (ch.length < this.chronicleCursor) this.chronicleCursor = Math.max(0, ch.length - 5);
    for (let i = this.chronicleCursor; i < ch.length; i++) this.events.onChronicle?.(ch[i]);
    this.chronicleCursor = ch.length;
  }

  async save(): Promise<boolean> {
    if (this.role === "client") return false;
    if (this.world.meta.mode === "friends") return false;
    const ok = await saveWorld(this.world);
    return !!ok;
  }

  // ── Multiplayer: host ──
  async host(transport: Transport, roomCode: string, mpMode: "shared" | "rivals") {
    this.transport = transport;
    this.roomCode = roomCode;
    this.world.meta.roomCode = roomCode;
    this.world.meta.mode = "friends";
    this.world.meta.mpMode = mpMode;
    this.role = "host";
    this.world.players[this.me.id] && (this.world.players[this.me.id].isHost = true);
    this.wire();
    await transport.join(roomCode);
    this.emitNet();
    await this.persistRoom();
    await this.broadcastSnapshot();
  }

  // ── Multiplayer: join ──
  static async join(transport: Transport, roomCode: string, me: PresenceInfo, events: SessionEvents): Promise<GameSession> {
    await transport.join(roomCode);
    // wait briefly for presence sync
    await new Promise((r) => setTimeout(r, 900));
    const others = transport.presence().filter((p) => p.id !== me.id);
    const stored = await transport.loadRoom(roomCode);
    if (others.length === 0) {
      // Nobody here: become host from the stored snapshot (or a fresh world if the room is new).
      if (!stored) throw new Error("That room doesn't exist. Check the code.");
      const world = deserializeWorld(await maybeDecompress(stored.snapshot));
      const s = new GameSession(world, me, events);
      s.transport = transport;
      s.roomCode = roomCode;
      s.role = "host";
      s.wire();
      s.registerLocalPlayer();
      s.emitNet();
      await s.broadcastSnapshot();
      return s;
    }
    // Someone is here: be a client. Start with the stored snapshot (if any) so the island shows immediately.
    let world: World;
    if (stored) world = deserializeWorld(await maybeDecompress(stored.snapshot));
    else world = createWorld({ mode: "friends", seed: 1, noRivals: true, starterCreatures: 0 });
    const s = new GameSession(world, me, events);
    s.engine = null;
    s.role = "client";
    s.transport = transport;
    s.roomCode = roomCode;
    s.wire();
    s.awaitingSnapshot = true;
    transport.send({ kind: "hello", from: me.id, name: me.name });
    transport.send({ kind: "needSnapshot", from: me.id });
    s.emitNet();
    return s;
  }

  private wire() {
    const t = this.transport!;
    this.unsubs.push(t.onMessage((m) => this.onMessage(m)));
    this.unsubs.push(
      t.onPresence((players) => {
        if (this.role === "host" && this.engine) {
          // register/unregister players in the world
          for (const p of players) {
            if (!this.world.players[p.id]) {
              const faction = this.factionForPlayer(p.id, p.faction);
              this.engine.applyNow({ type: "joinPlayer", player: { id: p.id, name: p.name, faction, color: p.color, cursorX: 0, cursorZ: 0, power: "grab", lastSeen: this.world.time, isHost: false } });
            }
          }
          for (const id in this.world.players) if (!players.some((p) => p.id === id)) this.engine.applyNow({ type: "leavePlayer", playerId: id });
        }
        this.emitNet();
        this.checkHostMigration();
      }),
    );
  }

  private emitNet(error?: string | null) {
    const players = this.transport?.presence() ?? [];
    this.events.onNet?.({ connected: !!this.transport, role: this.role, players, error: error ?? null });
  }

  private hostId(): string | null {
    const players = this.transport?.presence() ?? [];
    if (!players.length) return null;
    return players[0].id; // earliest joinedAt
  }

  private checkHostMigration() {
    if (!this.transport || this.role === "solo") return;
    const hostId = this.hostId();
    if (!hostId) return;
    if (this.role === "client" && hostId === this.me.id) {
      // the host left: we're the senior player → take over from our latest world copy
      this.becomeHost();
    } else if (this.role === "host" && hostId !== this.me.id) {
      // someone senior exists (race on reconnect) → yield
      this.role = "client";
      this.engine = null;
      this.awaitingSnapshot = true;
      this.transport.send({ kind: "needSnapshot", from: this.me.id });
      this.emitNet();
    }
  }

  private becomeHost() {
    // revalidate the world (clear transient references the way a load does)
    const json = serializeWorld(this.world);
    this.world = deserializeWorld(json);
    this.engine = new Engine(this.world);
    this.role = "host";
    for (const id in this.world.players) this.world.players[id].isHost = id === this.me.id;
    this.chronicleCursor = this.world.chronicle.length;
    this.events.onWorldReplaced?.(this.world);
    this.events.onToast?.("The previous host left. You are now hosting this world.", "info");
    this.transport?.send({ kind: "hostIs", hostId: this.me.id });
    this.emitNet();
    void this.broadcastSnapshot();
  }

  private async onMessage(m: NetMessage) {
    if (this.destroyed) return;
    switch (m.kind) {
      case "cmd": {
        if (this.role !== "host" || !this.engine) return;
        const cmd = m.cmd as Command;
        // attribute the command to the sender; never trust a client-specified player id
        if ("player" in cmd && typeof cmd.player === "string") (cmd as { player: string }).player = m.from;
        if (cmd.type === "joinPlayer" || cmd.type === "leavePlayer" || cmd.type === "setDifficulty") return;
        if (cmd.type === "place" || cmd.type === "spawn" || cmd.type === "setPriority") (cmd as { faction?: string }).faction = this.world.players[m.from]?.faction ?? this.factionForPlayer(m.from, "");
        this.engine.applyNow(cmd);
        break;
      }
      case "delta": {
        if (this.role !== "client") return;
        applyDelta(this.world, m.delta as Delta);
        break;
      }
      case "snapshot": {
        if (this.role !== "client") return;
        if (!this.incomingSnapshot || this.incomingSnapshot.id !== m.id) this.incomingSnapshot = { id: m.id, parts: new Array(m.parts).fill(""), got: 0, total: m.parts };
        const snap = this.incomingSnapshot;
        if (!snap.parts[m.part]) {
          snap.parts[m.part] = m.json;
          snap.got++;
        }
        if (snap.got === snap.total) {
          this.incomingSnapshot = null;
          try {
            const json = await decompressString(snap.parts.join(""));
            const fresh = deserializeWorld(json);
            // keep effects we've shown; adopt everything else
            this.world = fresh;
            this.awaitingSnapshot = false;
            this.lastSnapshotAt = Date.now();
            this.chronicleCursor = Math.max(0, fresh.chronicle.length - 3);
            this.events.onWorldReplaced?.(fresh);
          } catch (e) {
            console.warn("bad snapshot", e);
          }
        }
        break;
      }
      case "needSnapshot": {
        if (this.role === "host") void this.broadcastSnapshot();
        break;
      }
      case "hello": {
        if (this.role === "host") this.events.onToast?.(`${m.name} joined the world`, "good");
        break;
      }
      case "ping": {
        if (this.role === "host") this.transport?.send({ kind: "pong", to: m.from, t: m.t });
        break;
      }
      case "pong": {
        if (m.to === this.me.id) this.events.onNet?.({ connected: true, role: this.role, players: this.transport?.presence() ?? [], latency: Date.now() - m.t });
        break;
      }
      case "hostIs":
      case "chat":
        break;
    }
  }

  private async broadcastSnapshot() {
    if (!this.transport || this.role !== "host") return;
    const json = serializeWorld(this.world);
    const packed = await compressString(json);
    const parts = chunkString(packed);
    const id = ++this.snapshotId;
    parts.forEach((p, i) => this.transport!.send({ kind: "snapshot", json: p, part: i, parts: parts.length, id }));
  }

  private async persistRoom() {
    if (!this.transport || !this.roomCode || this.role !== "host") return;
    try {
      const json = serializeWorld(this.world);
      await this.transport.saveRoom(this.roomCode, { name: this.world.meta.name, mode: this.world.meta.mode, snapshot: await compressString(json), hostId: this.me.id, players: this.transport.presence().length, mpMode: this.world.meta.mpMode ?? "shared" });
    } catch (e) {
      console.warn("persist failed", e);
    }
  }

  async destroy() {
    this.destroyed = true;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.role === "host") await this.persistRoom();
    if (this.transport) await this.transport.leave();
    if (this.role === "solo") await this.save();
  }
}

async function maybeDecompress(s: string) {
  return decompressString(s);
}

export function colorForIndex(i: number) {
  return FACTION_COLORS[i % FACTION_COLORS.length];
}
