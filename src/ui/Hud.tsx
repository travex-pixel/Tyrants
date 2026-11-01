"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/src/store/game";
import { getSession, getWorld } from "@/src/render/context";
import { Icons } from "./icons";
import { SPECIES } from "@/src/sim/species";
import { POWER_UNLOCKS } from "@/src/sim/world";
import { POWER_COOLDOWNS } from "@/src/sim/powers";
import { unlockPower, canUnlockPower } from "@/src/sim/progression";
import type { PowerId } from "@/src/sim/types";
import { audio } from "@/src/audio/audio";
import { CreaturePanel, BuildingPanel, RivalPanel, BuildMenu, ChroniclePanel, PlayersPanel, AchievementsPanel, SettingsPanel, PausePanel } from "./Panels";
import { dayFraction, isNight } from "@/src/sim/creature";
import { population } from "@/src/sim/query";

interface HudActions {
  leaveToMenu: () => Promise<void>;
  saveNow: () => Promise<void>;
  createRoom: (mode: "shared" | "rivals", rivals: boolean) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
}

const POWERS: { id: PowerId; name: string; icon: keyof typeof Icons; hint: string }[] = [
  { id: "grab", name: "Grab", icon: "hand", hint: "Drag creatures. Flick to throw. Tap to select." },
  { id: "spawn", name: "Spawn", icon: "sparkle", hint: "Tap the ground to create a creature." },
  { id: "lightning", name: "Bolt", icon: "bolt", hint: "Smite a spot. Burns trees into loose wood." },
  { id: "bless", name: "Bless", icon: "sun", hint: "Cheer up and speed up everyone nearby for 45s." },
  { id: "terraform", name: "Shape", icon: "mountain", hint: "Hold to raise land. Right-click or Lower mode to dig." },
  { id: "giant", name: "Giant", icon: "giant", hint: "Tap a creature to make it enormous (toggle)." },
  { id: "clone", name: "Clone", icon: "clone", hint: "Tap a creature to duplicate it." },
  { id: "storm", name: "Storm", icon: "storm", hint: "Summon 25 seconds of lightning over an area." },
];

export function Hud({ actions }: { actions: HudActions }) {
  const tick = useGame((s) => s.uiTick);
  const panel = useGame((s) => s.panel);
  const setPanel = useGame((s) => s.setPanel);
  const power = useGame((s) => s.power);
  const setPower = useGame((s) => s.setPower);
  const species = useGame((s) => s.spawnSpecies);
  const setSpecies = useGame((s) => s.setSpawnSpecies);
  const selected = useGame((s) => s.selectedCreature);
  const selectedBuilding = useGame((s) => s.selectedBuilding);
  const selectedIsland = useGame((s) => s.selectedIsland);
  const buildType = useGame((s) => s.buildType);
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const story = useGame((s) => s.storyFeed);
  const net = useGame((s) => s.net);
  const lastSeen = useGame((s) => s.lastChronicleSeen);
  const fps = useGame((s) => s.fps);
  const intro = useGame((s) => s.intro);
  const cooldowns = useGame((s) => s.cooldowns);
  const [, force] = useState(0);
  const s = getSession();
  const w = getWorld();

  // toast auto-dismiss
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => dismiss(toasts[0].id), 3600);
    return () => clearTimeout(t);
  }, [toasts, dismiss]);
  // cooldown re-render
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 100);
    return () => clearInterval(id);
  }, []);

  if (!w || !s) return null;
  const f = w.factions[s.myFaction] ?? w.factions[w.playerFaction];
  const pop = population(w, f.id);
  const unread = w.chronicle.filter((e) => e.id > lastSeen && e.importance >= 2).length;
  const df = dayFraction(w);
  const phase = (df + 0.1) % 1;
  const hour = Math.floor(phase < 0.82 ? 6 + (phase / 0.82) * 14 : (20 + ((phase - 0.82) / 0.18) * 10) % 24);
  const night = isNight(w);
  const hideForIntro = intro >= 0 && intro < 4;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none">
      {/* Top bar */}
      {!hideForIntro && (
        <div className="absolute top-3 left-3 right-3 flex items-start gap-2 flex-wrap">
          <div className="bar-wood row px-3 py-2 fade-up" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 6 }} title={w.meta.name}>
              {night ? <Icons.moon style={{ width: 16, height: 16, color: "#9ecbff" }} /> : <Icons.sun style={{ width: 16, height: 16, color: "#ffd166" }} />}
              <span className="font-bold text-sm hidden sm:inline max-w-[140px] truncate">{w.meta.name}</span>
              <span className="muted text-xs font-bold tabular-nums">
                Day {w.day} · {String(hour).padStart(2, "0")}:00
              </span>
            </div>
            <span className="w-px h-5 bg-[rgba(60,30,10,0.4)] mx-1" />
            <Chip icon="wood" value={Math.floor(f.stock.wood)} title="Wood" color="#7a4a22" />
            <Chip icon="stone" value={Math.floor(f.stock.stone)} title="Stone" color="#4f5a66" />
            <Chip icon="food" value={Math.floor(f.stock.food)} title="Food" color="#a93a2a" />
            <Chip icon="essence" value={Math.floor(f.essence)} title="Essence — earned from discoveries and achievements; unlocks powers" color="#6a4aa8" />
            <Chip icon="pop" value={pop} title="Population" />
            {s.engine?.paused && <span className="chip" style={{ color: "#7a4a10" }}>Paused</span>}
          </div>
          <div className="flex-1 flex justify-center">
            <div className="plaque hidden md:inline-block fade-up" title={w.meta.name}>{w.meta.name}</div>
          </div>
          <div className="bar-wood row p-1.5 fade-up" style={{ gap: 4 }}>
            <IconButton icon="hammer" title="Build (B)" active={panel === "build"} onClick={() => setPanel("build")} />
            <IconButton icon="book" title="Chronicle (C)" active={panel === "chronicle"} badge={unread} onClick={() => setPanel("chronicle")} />
            <IconButton icon="flag" title="Rival Overlords" active={panel === "rivals"} onClick={() => setPanel("rivals")} />
            <IconButton icon="users" title="Players & invites" active={panel === "players"} onClick={() => setPanel("players")} dot={net.connected} />
            <IconButton icon="trophy" title="Achievements" active={panel === "achievements"} onClick={() => setPanel("achievements")} />
            <IconButton icon="cog" title="Menu (Esc)" active={panel === "pause"} onClick={() => setPanel("pause")} />
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="absolute top-[64px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[min(92vw,520px)]">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-parch toast px-4 py-2 text-sm font-bold text-center ${t.kind === "bad" ? "text-[var(--bad)]" : t.kind === "good" ? "text-[var(--good)]" : t.kind === "story" ? "text-[#7a4a10]" : ""}`} style={{ pointerEvents: "auto" }} onClick={() => dismiss(t.id)}>
            {t.text}
          </div>
        ))}
      </div>

      {/* Story feed (bottom right) */}
      {!hideForIntro && story.length > 0 && panel === "none" && (
        <div className="absolute right-3 bottom-[96px] sm:bottom-3 flex flex-col items-end gap-1 max-w-[min(70vw,360px)]">
          {story.slice(-3).map((e) => (
            <button
              key={e.id}
              className="toast-parch px-3 py-1.5 text-[12px] font-bold text-right fade-up"
              style={{ pointerEvents: "auto", opacity: 0.9 }}
              onClick={() => {
                if (e.x !== undefined && e.z !== undefined) useGame.getState().focusCamera(e.x, e.z, 18);
              }}
            >
              {e.text}
            </button>
          ))}
        </div>
      )}

      {/* Power bar */}
      {!hideForIntro && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          {power === "spawn" && !buildType && (
            <div className="panel row p-1.5 pop" style={{ gap: 4 }}>
              {(Object.keys(SPECIES) as (keyof typeof SPECIES)[]).map((id) => (
                <button key={id} className={`btn btn-sm ${species === id ? "btn-primary" : ""}`} title={SPECIES[id].blurb} onClick={() => { setSpecies(id); audio.click(); }}>
                  <span className="w-3 h-3 rounded-full border border-[#4a3522]" style={{ background: SPECIES[id].color }} /> {SPECIES[id].name}
                </button>
              ))}
            </div>
          )}
          {power === "terraform" && !buildType && (
            <div className="panel row p-1.5 pop" style={{ gap: 4 }}>
              <button className={`btn btn-sm ${(cooldowns.terraLower ?? 0) < performance.now() ? "btn-primary" : ""}`} onClick={() => useGame.getState().setCooldown("terraLower", 0)}>
                <Icons.arrowUp style={{ width: 14, height: 14 }} /> Raise
              </button>
              <button className={`btn btn-sm ${(cooldowns.terraLower ?? 0) > performance.now() ? "btn-primary" : ""}`} onClick={() => useGame.getState().setCooldown("terraLower", performance.now() + 1e9)}>
                <Icons.arrowDown style={{ width: 14, height: 14 }} /> Lower
              </button>
              <span className="muted text-[11px] font-bold px-1 hidden sm:inline">Hold on the ground to sculpt</span>
            </div>
          )}
          {buildType && (
            <div className="panel row px-3 py-1.5 pop">
              <span className="text-sm font-bold">Tap the ground to place</span>
              <button className="btn btn-sm" onClick={() => useGame.getState().setBuildType(null)}>
                Cancel
              </button>
            </div>
          )}
          <div className="panel row p-1.5" style={{ gap: 4 }}>
            {POWERS.map((p, i) => {
              const unlocked = w.unlockedPowers.includes(p.id);
              if (!unlocked && w.meta.mode === "challenge" && w.flags.peaceful && (p.id === "lightning" || p.id === "storm")) return null;
              const I = Icons[p.icon];
              const cdUntil = cooldowns[p.id] ?? 0;
              const cdTotal = (POWER_COOLDOWNS[p.id] ?? 0) * 1000;
              const cdFrac = cdTotal > 0 ? Math.max(0, Math.min(1, (cdUntil - performance.now()) / cdTotal)) : 0;
              const req = POWER_UNLOCKS[p.id];
              return (
                <button
                  key={p.id}
                  className={`power-btn ${power === p.id ? "active" : ""} ${!unlocked ? "locked" : ""}`}
                  title={unlocked ? `${p.name} (${i + 1}) — ${p.hint}` : `${p.name}: unlock for ${req.essence} essence`}
                  onClick={() => {
                    audio.click();
                    if (!unlocked) {
                      const chk = canUnlockPower(w, p.id);
                      if (chk.ok && unlockPower(w, p.id)) {
                        useGame.getState().toast(`${p.name} unlocked!`, "good");
                        audio.complete();
                      } else useGame.getState().toast(chk.reason ?? "Locked", "bad");
                      return;
                    }
                    setPower(p.id);
                    useGame.getState().toast(p.hint, "info");
                  }}
                >
                  <I />
                  <span>{unlocked ? p.name : `${req.essence}✦`}</span>
                  {cdFrac > 0 && <i className="cd" style={{ transform: `scaleY(${cdFrac})` }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Contextual panels */}
      {!hideForIntro && selected !== null && panel === "none" && <CreaturePanel id={selected} key={selected} />}
      {!hideForIntro && selectedBuilding !== null && panel === "none" && <BuildingPanel id={selectedBuilding} key={`b${selectedBuilding}`} />}
      {!hideForIntro && selectedIsland !== null && panel === "none" && <RivalPanel islandId={selectedIsland} key={`i${selectedIsland}`} />}
      {panel === "build" && <BuildMenu />}
      {panel === "chronicle" && <ChroniclePanel />}
      {panel === "rivals" && <RivalPanel />}
      {panel === "players" && <PlayersPanel actions={actions} />}
      {panel === "achievements" && <AchievementsPanel />}
      {panel === "settings" && (
        <Drawer title="Settings">
          <SettingsPanel />
        </Drawer>
      )}
      {panel === "pause" && <PausePanel actions={actions} />}

      {/* FPS (debug, tiny) */}
      <div className="absolute bottom-1 left-2 text-[10px] font-bold text-white/60">{fps} fps{net.connected ? ` · ${net.role}${net.latency ? ` ${net.latency}ms` : ""}` : ""}</div>
      <span className="hidden">{tick}</span>
    </div>
  );
}

function Chip({ icon, value, title, color }: { icon: keyof typeof Icons; value: string | number; title: string; color?: string }) {
  const I = Icons[icon];
  return (
    <div className="chip" title={title} style={color ? { color } : undefined}>
      <I /> <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function IconButton({ icon, title, onClick, active, badge, dot }: { icon: keyof typeof Icons; title: string; onClick: () => void; active?: boolean; badge?: number; dot?: boolean }) {
  const I = Icons[icon];
  return (
    <button className={`btn icon-btn ${active ? "btn-primary" : "btn-ghost"}`} title={title} onClick={() => { audio.click(); onClick(); }} onMouseEnter={() => audio.hover()}>
      <I />
      {!!badge && <span className="badge">{badge > 9 ? "9+" : badge}</span>}
      {dot && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--good)]" />}
    </button>
  );
}

export function Drawer({ title, children, wide, onClose }: { title: string; children: React.ReactNode; wide?: boolean; onClose?: () => void }) {
  const setPanel = useGame((s) => s.setPanel);
  return (
    <div className={`absolute right-3 top-[64px] bottom-[96px] sm:bottom-3 ${wide ? "w-[min(94vw,520px)]" : "w-[min(94vw,400px)]"} panel flex flex-col pop`} style={{ pointerEvents: "auto" }}>
      <div className="row px-4 py-3 border-b border-[rgba(90,58,32,0.25)]">
        <div className="h1 flex-1">{title}</div>
        <button className="btn btn-sm btn-ghost" onClick={() => (onClose ? onClose() : setPanel("none"))}>
          <Icons.close style={{ width: 16, height: 16 }} />
        </button>
      </div>
      <div className="scroll flex-1 p-3">{children}</div>
    </div>
  );
}
