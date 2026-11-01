"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { GameCanvas } from "@/src/render/GameCanvas";
import { GameSession } from "@/src/game/session";
import { setSession, getSession } from "@/src/render/context";
import { cameraCtl } from "@/src/render/cameraCtl";
import { useGame } from "@/src/store/game";
import { getIdentity, introSeen, listSaves, loadSettings, loadWorld, markIntroSeen, storeSettings, type SaveMeta } from "@/src/persistence/saves";
import { audio } from "@/src/audio/audio";
import { Menu } from "./Menu";
import { Hud } from "./Hud";
import { IntroOverlay, BriefingModal, ChallengeHud } from "./Intro";
import { supabaseConfigured, SupabaseTransport } from "@/src/net/supabase";
import { makeRoomCode, normaliseCode, type PresenceInfo } from "@/src/net/transport";
import { FACTION_COLORS, type CreateWorldOptions } from "@/src/sim/world";
import type { ChronicleEntry } from "@/src/sim/types";
import { renderCreatures } from "@/src/render/context";
import { findFlatSpot, heightAt, isBuildable } from "@/src/sim/terrain";
import { RNG } from "@/src/sim/rng";
import { Vector3 } from "three";

export default function Game() {
  const screen = useGame((s) => s.screen);
  const setScreen = useGame((s) => s.setScreen);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const booted = useRef(false);
  const identity = useRef<{ id: string; name: string }>({ id: "p_local", name: "Overlord" });

  const me = useCallback((): PresenceInfo => ({ id: identity.current.id, name: identity.current.name, color: FACTION_COLORS[0], joinedAt: Date.now(), faction: "p1" }), []);

  const wireEvents = useCallback(() => {
    const st = useGame.getState();
    return {
      onChronicle: (e: ChronicleEntry) => {
        const s = useGame.getState();
        if (e.importance >= 2) s.pushStory(e);
        if (e.importance >= 3 && e.kind !== "milestone") s.toast(e.text, e.kind === "disaster" || e.kind === "rival" ? "story" : "info");
        if (e.kind === "milestone" && e.text.startsWith("Achievement")) {
          s.toast(e.text.replace("Achievement: ", "🏆 "), "good");
          audio.complete();
        } else if (e.kind === "build" && e.text.includes("completed")) audio.complete();
        else if (e.kind === "rival" && e.importance >= 3) audio.notify();
      },
      onNet: (n: { connected: boolean; role: string; players: PresenceInfo[]; error?: string | null; latency?: number }) => {
        const s = getSession();
        useGame.getState().setNet({
          connected: n.connected,
          role: n.role as "none" | "host" | "client",
          players: n.players.map((p, i) => ({ id: p.id, name: p.name, color: p.color, isHost: i === 0, faction: s?.world.players[p.id]?.faction ?? p.faction })),
          error: n.error ?? null,
          ...(n.latency !== undefined ? { latency: n.latency } : {}),
        });
      },
      onWorldReplaced: () => useGame.getState().bump(),
      onToast: (text: string, kind?: "info" | "good" | "bad") => st.toast(text, kind),
    };
  }, []);

  const replaceSession = useCallback(
    async (next: GameSession) => {
      const prev = getSession();
      setSession(null);
      if (prev) await prev.destroy();
      setSession(next);
      const w = next.world;
      const st = useGame.getState();
      st.select(null);
      st.setPanel("none");
      st.setBuildType(null);
      st.setPower("grab");
      cameraCtl.followId = null;
      const home = w.islands.find((i) => i.id === w.factions[next.myFaction]?.homeIslandId) ?? w.islands[0];
      cameraCtl.desired.set(home.spawnPoint.x, 1, home.spawnPoint.z);
      cameraCtl.desiredDist = 34;
      cameraCtl.desiredYaw = 0.6;
      cameraCtl.snap();
      st.setNet({ enabled: supabaseConfigured(), connected: next.role !== "solo", role: next.role === "solo" ? "none" : next.role, roomCode: next.roomCode, players: [], error: null });
      st.bump();
    },
    [],
  );

  const refreshSaves = useCallback(async () => setSaves(await listSaves()), []);

  // ── Boot ──
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const st = useGame.getState();
      st.setSettings(loadSettings());
      identity.current = getIdentity();
      audio.setVolumes({ master: st.settings.master, sfx: st.settings.sfx, ambient: st.settings.ambient });
      const list = await listSaves();
      setSaves(list);
      const params = new URLSearchParams(window.location.search);
      const join = params.get("join");
      if (join) st.setPendingJoinCode(normaliseCode(join));
      if (join && supabaseConfigured()) {
        // land in the menu's join flow with the code pre-filled
        const bg = GameSession.newWorld({ mode: "sandbox", noRivals: true, starterCreatures: 6 }, me(), wireEvents());
        await replaceSession(bg);
        st.setMenuSub("friends");
        setScreen("menu");
        return;
      }
      if (list.length === 0 && !introSeen()) {
        // First ever visit: straight into the reveal.
        const s = GameSession.newWorld({ mode: "solo", starterCreatures: 5 }, me(), wireEvents());
        await replaceSession(s);
        beginIntro();
        setScreen("game");
        return;
      }
      // Returning player: living world behind the menu
      const latest = list[0];
      const world = latest ? await loadWorld(latest.id) : null;
      const s = world ? GameSession.fromSave(world, me(), wireEvents()) : GameSession.newWorld({ mode: "solo", starterCreatures: 5 }, me(), wireEvents());
      await replaceSession(s);
      setScreen("menu");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist settings + volumes
  const settings = useGame((s) => s.settings);
  useEffect(() => {
    storeSettings(settings);
    audio.setVolumes({ master: settings.master, sfx: settings.sfx, ambient: settings.ambient });
  }, [settings]);

  // save on leave
  useEffect(() => {
    const onHide = () => {
      const s = getSession();
      if (s && s.role === "solo") void s.save();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    return () => window.removeEventListener("pagehide", onHide);
  }, []);

  const beginIntro = () => {
    const st = useGame.getState();
    st.setIntro(0);
    cameraCtl.intro = { t: 0, duration: 6.5 };
    cameraCtl.dist = 150;
    cameraCtl.desiredDist = 26;
  };

  // ── Actions exposed to menu/hud ──
  const actions = {
    continueWorld: async () => {
      const s = getSession();
      if (!s) return;
      setScreen("game");
      if (s.offlineReport) {
        useGame.getState().setBriefing(s.offlineReport);
        s.offlineReport = null;
      }
      audio.unlock();
    },
    newSolo: async (opts: Partial<CreateWorldOptions> & { intro?: boolean }) => {
      setBusy("Raising an island from the clouds…");
      const s = GameSession.newWorld({ mode: "solo", starterCreatures: 5, ...opts }, me(), wireEvents());
      await replaceSession(s);
      await s.save();
      await refreshSaves();
      setBusy(null);
      if (opts.intro) beginIntro();
      setScreen("game");
      audio.unlock();
    },
    newSandbox: async () => {
      setBusy("Preparing the sandbox…");
      const s = GameSession.newWorld({ mode: "sandbox", noRivals: true, starterCreatures: 8 }, me(), wireEvents());
      s.world.factions.p1.stock = { wood: 200, stone: 120, food: 150 };
      s.world.factions.p1.essence = 60;
      s.world.unlockedPowers = ["grab", "spawn", "lightning", "bless", "terraform", "giant", "clone", "storm"];
      s.world.flags.instantBuild = 1;
      await replaceSession(s);
      await s.save();
      await refreshSaves();
      setBusy(null);
      setScreen("game");
      audio.unlock();
    },
    startChallenge: async (id: string) => {
      setBusy("Setting the stage…");
      const s = GameSession.newWorld({ mode: "challenge", name: undefined }, me(), wireEvents(), id);
      await replaceSession(s);
      setBusy(null);
      setScreen("game");
      audio.unlock();
    },
    loadSave: async (id: string) => {
      setBusy("Loading your world…");
      const w = await loadWorld(id);
      if (!w) {
        setBusy(null);
        useGame.getState().toast("Couldn't load that world", "bad");
        return;
      }
      const s = GameSession.fromSave(w, me(), wireEvents());
      await replaceSession(s);
      setBusy(null);
      setScreen("game");
      if (s.offlineReport) {
        useGame.getState().setBriefing(s.offlineReport);
        s.offlineReport = null;
      }
      audio.unlock();
    },
    createRoom: async (mpMode: "shared" | "rivals", withRivals: boolean) => {
      if (!supabaseConfigured()) {
        useGame.getState().toast("Multiplayer needs Supabase credentials (see README)", "bad");
        return;
      }
      setBusy("Opening a world to your friends…");
      try {
        const code = makeRoomCode();
        const s = GameSession.newWorld({ mode: "friends", starterCreatures: 5, rivals: withRivals, noRivals: !withRivals, mpMode, roomCode: code }, me(), wireEvents());
        await replaceSession(s);
        const t = new SupabaseTransport(me());
        await s.host(t, code, mpMode);
        useGame.getState().setNet({ enabled: true, connected: true, role: "host", roomCode: code });
        setScreen("game");
        useGame.getState().setPanel("players");
      } catch (e) {
        useGame.getState().toast(`Couldn't create the room: ${(e as Error).message}`, "bad");
      }
      setBusy(null);
      audio.unlock();
    },
    joinRoom: async (codeRaw: string) => {
      const code = normaliseCode(codeRaw);
      if (code.length < 4) return useGame.getState().toast("Enter the 6-character room code", "bad");
      if (!supabaseConfigured()) return useGame.getState().toast("Multiplayer needs Supabase credentials (see README)", "bad");
      setBusy(`Joining ${code}…`);
      try {
        const t = new SupabaseTransport(me());
        const s = await GameSession.join(t, code, me(), wireEvents());
        await replaceSession(s);
        useGame.getState().setNet({ enabled: true, connected: true, role: s.role === "host" ? "host" : "client", roomCode: code });
        setScreen("game");
        useGame.getState().setPendingJoinCode(null);
        window.history.replaceState(null, "", "/");
      } catch (e) {
        useGame.getState().toast(`Couldn't join: ${(e as Error).message}`, "bad");
      }
      setBusy(null);
      audio.unlock();
    },
    leaveToMenu: async () => {
      const s = getSession();
      if (s) {
        if (s.role === "solo") await s.save();
        if (s.role !== "solo") {
          // leave the room; keep a local sandbox running behind the menu
          const bg = GameSession.newWorld({ mode: "sandbox", noRivals: true, starterCreatures: 6 }, me(), wireEvents());
          await replaceSession(bg);
        }
      }
      await refreshSaves();
      useGame.getState().setPanel("none");
      useGame.getState().setMenuSub("main");
      setScreen("menu");
    },
    saveNow: async () => {
      const s = getSession();
      if (!s) return;
      const ok = await s.save();
      useGame.getState().toast(ok ? "World saved" : "This world can't be saved locally", ok ? "good" : "bad");
      await refreshSaves();
    },
    refreshSaves,
    finishIntro: () => {
      markIntroSeen();
      useGame.getState().setIntro(-1);
      cameraCtl.intro = null;
    },
    replayIntro: () => {
      setScreen("game");
      beginIntro();
    },
    setName: (name: string) => {
      identity.current.name = name;
    },
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[var(--bg)]">
      {screen !== "boot" && <GameCanvas />}
      {screen === "boot" && (
        <div className="absolute inset-0 flex items-center justify-center boot-screen">
          <div className="text-center boot-card fade-up">
            <div className="title-dark text-5xl">Little Tyrants</div>
            <div className="mt-3 text-[#f6e8cf] font-bold">Small worlds. Big egos.</div>
            <div className="mt-4 text-[13px] font-bold text-[#e3c27e] pulse">Raising an island from the clouds…</div>
          </div>
        </div>
      )}
      {screen === "menu" && <Menu saves={saves} actions={actions} identity={identity.current} />}
      {screen === "game" && (
        <>
          <Hud actions={actions} />
          <IntroOverlay onFinish={actions.finishIntro} />
          <BriefingModal />
          <ChallengeHud onLeave={actions.leaveToMenu} onRetry={actions.startChallenge} />
        </>
      )}
      {busy && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[rgba(30,15,5,0.45)] backdrop-blur-sm">
          <div className="panel px-8 py-6 text-center pop">
            <div className="h1 pulse">{busy}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Test hooks (harmless in production; used by scripts/smoke.mjs) ──
if (typeof window !== "undefined") {
  (window as unknown as { __lt: unknown }).__lt = {
    stats: () => {
      const s = getSession();
      if (!s) return null;
      const w = s.world;
      let pop = 0;
      for (const id in w.creatures) if (w.creatures[id].faction === s.myFaction) pop++;
      return { ...w.stats, pop, time: w.time, wood: w.factions[s.myFaction].stock.wood, buildings: Object.values(w.buildings).filter((b) => b.faction === s.myFaction).map((b) => `${b.type}:${b.complete ? "done" : Math.round(b.progress * 100)}`) };
    },
    creatureScreenPos: () => {
      const s = getSession();
      const cam = cameraCtl.camera;
      if (!s || !cam) return null;
      let best: { x: number; y: number; d: number } | null = null;
      for (const id in s.world.creatures) {
        const c = s.world.creatures[id];
        if (c.faction !== s.myFaction || c.state === "held" || c.state === "thrown") continue;
        const rc = renderCreatures.get(c.id);
        const v = new Vector3(rc ? rc.x : c.x, (rc ? rc.y : c.y) + 0.5, rc ? rc.z : c.z).project(cam);
        const x = ((v.x + 1) / 2) * window.innerWidth;
        const y = ((1 - v.y) / 2) * window.innerHeight;
        const d = Math.hypot(x - window.innerWidth / 2, y - window.innerHeight / 2);
        if (x > 40 && y > 80 && x < window.innerWidth - 40 && y < window.innerHeight - 120 && (!best || d < best.d)) best = { x, y, d };
      }
      return best;
    },
    buildSpotScreen: (k: number) => {
      const s = getSession();
      const cam = cameraCtl.camera;
      if (!s || !cam) return null;
      const w = s.world;
      const isl = w.islands[0];
      let sp: { x: number; z: number } | null = null;
      for (let r = 5; r < 16 && !sp; r += 1) {
        for (let a = 0; a < Math.PI * 2 && !sp; a += 0.25) {
          const x = isl.spawnPoint.x + Math.cos(a + k * 2) * r;
          const z = isl.spawnPoint.z + Math.sin(a + k * 2) * r;
          if (!isBuildable(isl, x, z, 2)) continue;
          let clash = false;
          for (const id in w.buildings) if ((w.buildings[id].x - x) ** 2 + (w.buildings[id].z - z) ** 2 < 4.5 ** 2) clash = true;
          for (const id in w.nodes) if (w.nodes[id].islandId === 1 && w.nodes[id].kind !== "berry" && w.nodes[id].kind !== "stump" && (w.nodes[id].x - x) ** 2 + (w.nodes[id].z - z) ** 2 < 3.2 ** 2) clash = true;
          if (!clash) sp = { x, z };
        }
      }
      if (!sp) sp = findFlatSpot(isl, isl.spawnPoint.x, isl.spawnPoint.z, 2, new RNG(k + 3), 80, 5)!;
      const v = new Vector3(sp.x, heightAt(isl, sp.x, sp.z), sp.z).project(cam);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, wx: sp.x, wz: sp.z };
    },
    focusNearest: (zoom: number) => {
      const s = getSession();
      if (!s) return;
      const w = s.world;
      const cf = Object.values(w.buildings).find((b) => b.type === "campfire" && b.faction === s.myFaction);
      if (cf) useGame.getState().focusCamera(cf.x, cf.z, zoom);
    },
    focusSelected: (zoom: number) => {
      const s = getSession();
      const id = useGame.getState().selectedCreature;
      if (!s || id === null) return;
      const c = s.world.creatures[id];
      if (c) useGame.getState().focusCamera(c.x, c.z, zoom);
    },
    held: () => {
      const s = getSession();
      return !!s && Object.values(s.world.creatures).some((c) => c.state === "held");
    },
    /** Dress the world for a marketing capture: a small settlement, a crowd, golden hour, a blessing. */
    stageForPreview: (zoom: number, yaw: number) => {
      const s = getSession();
      if (!s || !s.engine) return null;
      const w = s.world;
      const isl = w.islands[0];
      const cf = Object.values(w.buildings).find((b) => b.type === "campfire" && b.faction === s.myFaction);
      if (!cf) return null;
      w.meta.mode = "sandbox";
      w.flags.instantBuild = 1;
      const types = ["house", "storage", "lumber", "farm", "house", "workshop"] as const;
      let placed = 0;
      for (const t of types) {
        for (let r = 4; r < 13 && placed <= types.indexOf(t); r += 0.7)
          for (let a = 0; a < Math.PI * 2 && placed <= types.indexOf(t); a += 0.2) {
            const x = cf.x + Math.cos(a + placed * 1.9) * r;
            const z = cf.z + Math.sin(a + placed * 1.9) * r;
            const res = s.dispatch({ type: "place", building: t, x, z, player: s.me.id, instant: true });
            if (res.ok) placed++;
          }
      }
      const species = ["goblin", "goblin", "trollkin", "mushroom", "goblin", "mushroom"] as const;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        s.dispatch({ type: "spawn", species: species[i % species.length], x: cf.x + Math.cos(a) * 2.2, z: cf.z + Math.sin(a) * 2.2, player: s.me.id });
      }
      // late afternoon light and a few seconds of settling, then a blessing for sparkle
      w.time = Math.floor(w.time / w.dayLength) * w.dayLength + w.dayLength * 0.55;
      for (let i = 0; i < 60; i++) s.engine.step();
      s.dispatch({ type: "bless", x: cf.x, z: cf.z, player: s.me.id });
      cameraCtl.desiredYaw = yaw;
      cameraCtl.focus(cf.x + 1.5, cf.z + 1, zoom);
      cameraCtl.snap();
      void isl;
      return { x: cf.x, z: cf.z, placed };
    },
    buildingCount: () => {
      const s = getSession();
      return s ? Object.values(s.world.buildings).filter((b) => b.faction === s.myFaction).length : 0;
    },
    fastForward: (seconds: number) => {
      const s = getSession();
      if (!s || !s.engine) return;
      for (let i = 0; i < seconds * 10; i++) s.engine.step();
    },
  };
}
