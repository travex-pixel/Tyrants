"use client";
import { useEffect, useState } from "react";
import { useGame, type Panel } from "@/src/store/game";
import { getSession, getWorld } from "@/src/render/context";
import { Icons } from "./icons";
import { SPECIES, BUILDINGS, RESOURCE_NAMES } from "@/src/sim/species";
import { POWER_UNLOCKS } from "@/src/sim/world";
import { POWER_COOLDOWNS } from "@/src/sim/powers";
import { unlockPower, canUnlockPower } from "@/src/sim/progression";
import type { BuildingType, PowerId, ResourceType, SpeciesId } from "@/src/sim/types";
import { audio } from "@/src/audio/audio";
import { CreaturePanel, BuildingPanel, RivalPanel, ChroniclePanel, PlayersPanel, AchievementsPanel, SettingsPanel, PausePanel } from "./Panels";
import { isNight } from "@/src/sim/creature";
import { population } from "@/src/sim/query";
import { DecreesPanel, OmenCard, AscendModal } from "./Decrees";

interface HudActions {
  leaveToMenu: () => Promise<void>;
  saveNow: () => Promise<void>;
  createRoom: (mode: "shared" | "rivals", rivals: boolean) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
}

/** The five everyday tokens. "grab" means no tool is armed: tap selects, drag always grabs. */
const TOKENS: { id: PowerId | "build"; name: string; icon: keyof typeof Icons; tint: string; hint: string }[] = [
  { id: "build", name: "Build", icon: "mallet", tint: "#8e5f36", hint: "Pick something to build, then tap the ground." },
  { id: "spawn", name: "Friend", icon: "sparkle", tint: "#4f8a3a", hint: "Tap the ground to make a new creature." },
  { id: "lightning", name: "Zap", icon: "boltFill", tint: "#3f7fb0", hint: "Tap anywhere to call down lightning." },
  { id: "bless", name: "Sun", icon: "sunFace", tint: "#e9a93c", hint: "Tap a group to cheer them up and speed them up." },
  { id: "terraform", name: "Hill", icon: "hills", tint: "#3f7d3a", hint: "Hold on the ground to raise a hill. It launches whoever stands there." },
];
const POUCH: { id: PowerId | "dig"; name: string; icon: keyof typeof Icons; tint: string; hint: string }[] = [
  { id: "dig", name: "Dig", icon: "shovel", tint: "#6e5238", hint: "Hold on the ground to dig. Dig below the water and it floods." },
  { id: "giant", name: "Giant", icon: "giant", tint: "#c9553f", hint: "Tap a creature to make it enormous. Giants trample everything." },
  { id: "clone", name: "Twin", icon: "twin", tint: "#5fb3f0", hint: "Tap a creature to make a twin." },
  { id: "storm", name: "Storm", icon: "storm", tint: "#5a6aa8", hint: "Tap to summon a lightning storm over an area." },
];
const BUILD_MAIN: BuildingType[] = ["campfire", "house", "farm", "storage"];
const BUILD_MORE: BuildingType[] = ["lumber", "workshop", "totem", "monument"];
const BUILD_ICON: Record<BuildingType, keyof typeof Icons> = { campfire: "campfire", house: "house", farm: "sprout", storage: "barrel", lumber: "axe", workshop: "anvil", totem: "totem", monument: "obelisk" };
const BOOK_TABS: { id: Panel; name: string; icon: keyof typeof Icons }[] = [
  { id: "chronicle", name: "Story", icon: "scroll" },
  { id: "rivals", name: "Rivals", icon: "crown" },
  { id: "players", name: "Friends", icon: "users" },
  { id: "achievements", name: "Awards", icon: "trophy" },
  { id: "settings", name: "Settings", icon: "cog" },
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
  const setBuildType = useGame((s) => s.setBuildType);
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const story = useGame((s) => s.storyFeed);
  const net = useGame((s) => s.net);
  const lastSeen = useGame((s) => s.lastChronicleSeen);
  const fps = useGame((s) => s.fps);
  const intro = useGame((s) => s.intro);
  const cooldowns = useGame((s) => s.cooldowns);
  const pouchOpen = useGame((s) => s.pouchOpen);
  const setPouchOpen = useGame((s) => s.setPouchOpen);
  const bookTab = useGame((s) => s.bookTab);
  const setBookTab = useGame((s) => s.setBookTab);
  const [buildMore, setBuildMore] = useState(false);
  const [, force] = useState(0);
  const s = getSession();
  const w = getWorld();

  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => dismiss(toasts[0].id), 3400);
    return () => clearTimeout(t);
  }, [toasts, dismiss]);
  useEffect(() => {
    const id = setInterval(() => force((x) => x + 1), 100);
    return () => clearInterval(id);
  }, []);

  if (!w || !s) return null;
  const f = w.factions[s.myFaction] ?? w.factions[w.playerFaction];
  const pop = population(w, f.id);
  const unread = w.chronicle.filter((e) => e.id > lastSeen && e.importance >= 2).length;
  const night = isNight(w);
  const hideForIntro = intro >= 0 && intro < 4;
  const teaching = intro >= 4 && intro <= 7;
  const tokenVisible = (id: string) => !teaching || (intro === 4 ? id === "spawn" : intro === 5 ? id === "spawn" || id === "bless" : id === "build" || id === "spawn" || id === "bless");
  const teachToken = intro === 4 ? "spawn" : intro === 5 ? "bless" : intro === 6 && !buildType ? "build" : null;
  const buildOpen = panel === "build";
  const digging = (cooldowns.terraLower ?? 0) > performance.now();
  const mayhem = (w.flags.mayhem as number) ?? 0;
  const anyPouch = POUCH.some((p) => p.id === "dig" || w.unlockedPowers.includes(p.id as PowerId)) || f.essence >= 10;

  const armToken = (id: PowerId | "build") => {
    audio.click();
    if (id === "build") {
      setPower("grab");
      setPanel(buildOpen ? "none" : "build");
      return;
    }
    if (power === id && !buildType) {
      setPower("grab");
      return;
    }
    setPanel("none");
    setPower(id);
    if (id === "terraform") useGame.getState().setCooldown("terraLower", 0);
    const tk = TOKENS.find((t) => t.id === id);
    if (tk) useGame.getState().toast(tk.hint, "info");
  };

  const Token = ({ id, name, icon, tint, active, locked, cost, teach, onClick }: { id: string; name: string; icon: keyof typeof Icons; tint: string; active: boolean; locked?: boolean; cost?: number; teach?: boolean; onClick: () => void }) => {
    const I = Icons[icon];
    const cdUntil = cooldowns[id] ?? 0;
    const cdTotal = (POWER_COOLDOWNS[id] ?? 0) * 1000;
    const cdFrac = cdTotal > 0 ? Math.max(0, Math.min(1, (cdUntil - performance.now()) / cdTotal)) : 0;
    return (
      <button className={`token ${active ? "active" : ""} ${locked ? "locked" : ""} ${teach ? "teach" : ""}`} style={{ "--tint": tint } as React.CSSProperties} onClick={onClick} title={name}>
        <I />
        <span>{locked ? `${cost}✦` : name}</span>
        {cdFrac > 0 && <i className="cd" style={{ transform: `scaleY(${cdFrac})` }} />}
      </button>
    );
  };

  return (
    <div className="absolute inset-0 z-10 pointer-events-none select-none" data-hud>
      {/* ── Top bar: information only ── */}
      {!hideForIntro && (
        <div className="absolute top-3 left-3 right-3 flex items-start gap-2 flex-wrap">
          <div className="bar-wood row px-3 py-2 fade-up" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 6 }} title={`${w.meta.name} · day ${w.day}`}>
              {night ? <Icons.moon style={{ width: 18, height: 18, color: "#cfe0ff" }} /> : <Icons.sun style={{ width: 18, height: 18, color: "#ffd166" }} />}
              <span className="text-xs font-black tabular-nums" style={{ color: "#f6e8cf" }}>Day {w.day}</span>
            </div>
            <span className="w-px h-5 bg-[rgba(60,30,10,0.4)] mx-1" />
            <Chip icon="wood" value={Math.floor(f.stock.wood)} label="wood" title="Wood: chopped from trees" color="#7a4a22" />
            <Chip icon="stone" value={Math.floor(f.stock.stone)} label="stone" title="Stone: mined from rocks" color="#4f5a66" />
            <Chip icon="food" value={Math.floor(f.stock.food)} label="food" title="Food: berries and crops" color="#a93a2a" />
            <Chip icon="pop" value={pop} label="folk" title="Population" />
            <span className="w-px h-5 bg-[rgba(60,30,10,0.4)] mx-1" />
            <button className="btn btn-sm" style={{ padding: "5px 9px" }} title="Fly home (H)" onClick={() => { const home = w.islands.find((i) => i.id === f.homeIslandId) ?? w.islands[0]; const cf = Object.values(w.buildings).find((b) => b.faction === f.id && b.type === "campfire"); useGame.getState().focusCamera(cf ? cf.x : home.spawnPoint.x, cf ? cf.z : home.spawnPoint.z, 52); audio.whooshCamera(); }}>
              <Icons.home style={{ width: 16, height: 16 }} /> <span className="hidden sm:inline">Home</span>
            </button>
            {s.engine && (
              <button className="btn btn-sm" style={{ padding: "5px 9px", minWidth: 44 }} title="Speed: tap to change" onClick={() => { s.engine!.speed = s.engine!.speed >= 3 ? 1 : s.engine!.speed + 1; useGame.getState().bump(); audio.click(); }}>
                {s.engine.paused ? "❚❚" : `${s.engine.speed}×`}
              </button>
            )}
          </div>
          <div className="flex-1 flex flex-col items-center gap-1">
            <div className="plaque hidden md:inline-block fade-up" title={w.meta.name}>{w.meta.name}</div>
            {mayhem >= 2 && <div className="chip pulse" style={{ background: "linear-gradient(180deg,#ffd166,#e9a93c)", color: "#3b2508", border: "1px solid #7a4d14" }}>Mayhem {Math.floor(mayhem)}</div>}
          </div>
          {!teaching && <button className="bar-wood row p-1.5 fade-up relative" style={{ gap: 6, padding: "6px 12px" }} title="The Book: story, rivals, friends, awards, settings" onClick={() => { audio.click(); setPanel(BOOK_TABS.some((t) => t.id === panel) ? "none" : bookTab); }}>
            <Icons.book2 style={{ width: 26, height: 26, color: "#f6e8cf" }} />
            <span className="icon-label" style={{ color: "#f6e8cf", fontSize: 11 }}>Book</span>
            {!!unread && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
            {net.connected && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--good)]" />}
          </button>}
        </div>
      )}

      {!hideForIntro && !teaching && panel === "none" && <DecreesPanel />}
      {!hideForIntro && !teaching && <OmenCard />}
      <AscendModal />

      {/* Toasts */}
      <div className="absolute top-[70px] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[min(92vw,520px)]">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-parch toast px-4 py-2 text-sm font-bold text-center ${t.kind === "bad" ? "text-[var(--bad)]" : t.kind === "good" ? "text-[var(--good)]" : t.kind === "story" ? "text-[#7a4a10]" : ""}`} style={{ pointerEvents: "auto" }} onClick={() => dismiss(t.id)}>
            {t.text}
          </div>
        ))}
      </div>

      {/* Story feed: one line */}
      {!hideForIntro && story.length > 0 && panel === "none" && !w.omen && (
        <div className="absolute right-3 bottom-[118px] sm:bottom-3 flex flex-col items-end gap-1 max-w-[min(70vw,360px)]">
          {story.slice(-1).map((e) => (
            <button key={e.id} className="toast-parch px-3 py-1.5 text-[12px] font-bold text-right fade-up" style={{ pointerEvents: "auto", opacity: 0.92 }} onClick={() => { if (e.x !== undefined && e.z !== undefined) useGame.getState().focusCamera(e.x, e.z, 22); }}>
              {e.text}
            </button>
          ))}
        </div>
      )}

      {/* ── Bottom: tokens ── */}
      {!hideForIntro && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          {power === "spawn" && !buildType && !teaching && (
            <div className="panel row p-1.5 pop" style={{ gap: 6 }}>
              {(Object.keys(SPECIES) as SpeciesId[]).filter((id) => id !== "boar").map((id) => (
                <button key={id} className={`face ${species === id ? "active" : ""}`} title={`${SPECIES[id].name}: ${SPECIES[id].blurb}`} onClick={() => { setSpecies(id); audio.click(); audio.creatureVoice(id === "goblin" ? 1 : id === "trollkin" ? 2 : 3); }}>
                  <SpeciesFace id={id} />
                  <span>{SPECIES[id].name.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          )}
          {buildOpen && (
            <div className="panel p-2 pop" style={{ pointerEvents: "auto" }}>
              <div className="flex gap-2 flex-wrap justify-center">
                {(teaching ? (["farm"] as BuildingType[]) : buildMore ? [...BUILD_MAIN, ...BUILD_MORE] : BUILD_MAIN).map((t) => {
                  const d = BUILDINGS[t];
                  const locked = d.unlock && !w.achievements[d.unlock]?.unlockedAt;
                  const I = Icons[BUILD_ICON[t]];
                  return (
                    <button key={t} className={`tile ${buildType === t ? "active" : ""} ${locked ? "locked" : ""}`} disabled={!!locked} title={locked ? (t === "monument" ? "Reach Overlord level 6" : `Unlock: ${w.achievements[d.unlock!]?.title}`) : d.text} onClick={() => { setBuildType(t); audio.click(); useGame.getState().toast(`Now tap the ground where the ${d.name} should go`, "info"); }}>
                      <I />
                      <span className="tile-name">{d.name.replace("Small ", "").replace(" Hut", "").replace(" Camp", "").replace("Sky ", "")}</span>
                      <span className="tile-cost">{(Object.keys(d.cost) as ResourceType[]).map((r) => `${d.cost[r]} ${RESOURCE_NAMES[r].toLowerCase()}`).join(" · ")}</span>
                    </button>
                  );
                })}
                {!teaching && <button className="tile more" onClick={() => { setBuildMore((v) => !v); audio.click(); }} title="More buildings">
                  <span style={{ fontSize: 22, fontWeight: 900 }}>{buildMore ? "–" : "+"}</span>
                  <span className="tile-name">{buildMore ? "Less" : "More"}</span>
                </button>}
              </div>
              {buildType && (
                <div className="row mt-2 justify-center text-[12px] font-bold">
                  <span>Tap the ground to place the {BUILDINGS[buildType].name}</span>
                  <button className="btn btn-sm btn-ghost" onClick={() => setBuildType(null)}>Cancel</button>
                </div>
              )}
            </div>
          )}
          {buildType && !buildOpen && (
            <div className="panel row px-3 py-1.5 pop" style={{ pointerEvents: "auto" }}>
              {(() => { const I = Icons[BUILD_ICON[buildType]]; return <I style={{ width: 18, height: 18, color: "#6e5238" }} />; })()}
              <span className="text-[13px] font-bold">Tap the ground to place the {BUILDINGS[buildType].name}</span>
              <button className="btn btn-sm" onClick={() => setBuildType(null)}>Cancel</button>
            </div>
          )}
          {pouchOpen && (
            <div className="panel row p-1.5 pop" style={{ gap: 6 }}>
              {POUCH.map((p) => {
                const isDig = p.id === "dig";
                const unlocked = isDig || w.unlockedPowers.includes(p.id as PowerId);
                const req = isDig ? 0 : POWER_UNLOCKS[p.id as PowerId].essence;
                const active = isDig ? power === "terraform" && digging : power === p.id;
                return (
                  <Token key={p.id} id={p.id} name={p.name} icon={p.icon} tint={p.tint} active={active} locked={!unlocked} cost={req} onClick={() => {
                    audio.click();
                    if (!unlocked) {
                      const chk = canUnlockPower(w, p.id as PowerId);
                      if (chk.ok && unlockPower(w, p.id as PowerId)) { useGame.getState().toast(`${p.name} unlocked!`, "good"); audio.complete(); } else useGame.getState().toast(chk.reason ?? "Locked", "bad");
                      return;
                    }
                    setPanel("none");
                    if (isDig) { setPower("terraform"); useGame.getState().setCooldown("terraLower", performance.now() + 1e9); } else setPower(p.id as PowerId);
                    useGame.getState().toast(p.hint, "info");
                  }} />
                );
              })}
            </div>
          )}
          <div className="panel row p-1.5" style={{ gap: 6 }}>
            {TOKENS.filter((t) => tokenVisible(t.id)).map((t) => (
              <Token key={t.id} id={t.id} name={t.name} icon={t.icon} tint={t.tint} teach={teachToken === t.id} active={t.id === "build" ? buildOpen || !!buildType : power === t.id && !digging && !buildType} onClick={() => armToken(t.id)} />
            ))}
            {anyPouch && !teaching && <Token id="pouch" name="More" icon="pouch" tint="#6a4aa8" active={pouchOpen || (power === "terraform" && digging) || power === "giant" || power === "clone" || power === "storm"} onClick={() => { audio.click(); setPouchOpen(!pouchOpen); }} />}
          </div>
        </div>
      )}

      {/* Contextual panels */}
      {!hideForIntro && selected !== null && !BOOK_TABS.some((t) => t.id === panel) && <CreaturePanel id={selected} key={selected} />}
      {!hideForIntro && selectedBuilding !== null && panel === "none" && <BuildingPanel id={selectedBuilding} key={`b${selectedBuilding}`} />}
      {!hideForIntro && selectedIsland !== null && panel === "none" && <RivalPanel islandId={selectedIsland} key={`i${selectedIsland}`} />}
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

      <div className="absolute bottom-1 left-2 text-[10px] font-bold text-white/60">{fps} fps{net.connected ? ` · ${net.role}${net.latency ? ` ${net.latency}ms` : ""}` : ""}</div>
      <span className="hidden">{tick}{setBookTab.name}</span>
    </div>
  );
}

function SpeciesFace({ id }: { id: SpeciesId }) {
  const c = SPECIES[id].color;
  if (id === "goblin")
    return (
      <svg viewBox="0 0 48 48" width="44" height="44">
        <path d="M6 20l10-10 2 14zM42 20l-10-10-2 14z" fill="#4c8536" />
        <circle cx="24" cy="26" r="15" fill="#4c8536" />
        <circle cx="18" cy="24" r="4" fill="#fff" /><circle cx="30" cy="24" r="4" fill="#fff" />
        <circle cx="19" cy="25" r="2" fill="#1a1a22" /><circle cx="31" cy="25" r="2" fill="#1a1a22" />
        <path d="M18 33c3 3 9 3 12 0" stroke="#1a1a22" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M24 6l6 10H18z" fill="#b8402f" />
      </svg>
    );
  if (id === "trollkin")
    return (
      <svg viewBox="0 0 48 48" width="44" height="44">
        <rect x="6" y="12" width="36" height="30" rx="12" fill="#7a92b5" />
        <circle cx="17" cy="24" r="3.5" fill="#fff" /><circle cx="31" cy="24" r="3.5" fill="#fff" />
        <circle cx="18" cy="25" r="1.8" fill="#1a1a22" /><circle cx="32" cy="25" r="1.8" fill="#1a1a22" />
        <path d="M17 34h14" stroke="#1a1a22" strokeWidth="2" strokeLinecap="round" />
        <path d="M18 34l-2 6M30 34l2 6" stroke="#f3ead8" strokeWidth="3" strokeLinecap="round" />
        <path d="M12 19l-3-3M36 19l3-3" stroke="#1a1a22" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  return (
    <svg viewBox="0 0 48 48" width="44" height="44">
      <rect x="16" y="22" width="16" height="20" rx="7" fill="#efe3cc" />
      <path d="M4 24c0-12 9-18 20-18s20 6 20 18z" fill="#c9412f" />
      <circle cx="14" cy="16" r="3" fill="#fff3d6" /><circle cx="27" cy="11" r="2.5" fill="#fff3d6" /><circle cx="36" cy="18" r="2" fill="#fff3d6" />
      <circle cx="21" cy="29" r="2" fill="#1a1a22" /><circle cx="27" cy="29" r="2" fill="#1a1a22" />
      <path d="M21 35c1.5 1.5 4.5 1.5 6 0" stroke="#1a1a22" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="24" cy="14" r="0" fill={c} />
    </svg>
  );
}

function Chip({ icon, value, label, title, color }: { icon: keyof typeof Icons; value: string | number; label?: string; title: string; color?: string }) {
  const I = Icons[icon];
  return (
    <div className="chip" title={title} style={color ? { color } : undefined}>
      <I /> <span className="tabular-nums">{value}</span>
      {label && <span className="chip-label">{label}</span>}
    </div>
  );
}

export function IconButton({ icon, label, title, onClick, active, badge, dot }: { icon: keyof typeof Icons; label?: string; title: string; onClick: () => void; active?: boolean; badge?: number; dot?: boolean }) {
  const I = Icons[icon];
  return (
    <button className={`btn icon-btn ${label ? "labelled" : ""} ${active ? "btn-primary" : "btn-ghost"}`} title={title} onClick={() => { audio.click(); onClick(); }} onMouseEnter={() => audio.hover()}>
      <I />
      {label && <span className="icon-label">{label}</span>}
      {!!badge && <span className="badge">{badge > 9 ? "9+" : badge}</span>}
      {dot && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--good)]" />}
    </button>
  );
}

/** Drawer with the Book's picture tabs when showing a Book panel. */
export function Drawer({ title, children, wide, onClose }: { title: string; children: React.ReactNode; wide?: boolean; onClose?: () => void }) {
  const setPanel = useGame((s) => s.setPanel);
  const panel = useGame((s) => s.panel);
  const setBookTab = useGame((s) => s.setBookTab);
  const isBook = BOOK_TABS.some((t) => t.id === panel);
  return (
    <div className={`absolute right-3 top-[70px] bottom-[118px] sm:bottom-3 ${wide ? "w-[min(94vw,520px)]" : "w-[min(94vw,420px)]"} panel flex flex-col pop`} style={{ pointerEvents: "auto" }}>
      {isBook && (
        <div className="row px-2 pt-2" style={{ gap: 4 }}>
          {BOOK_TABS.map((t) => {
            const I = Icons[t.icon];
            return (
              <button key={t.id} className={`btn icon-btn labelled flex-1 ${panel === t.id ? "btn-primary" : ""}`} style={{ width: "auto" }} onClick={() => { audio.click(); setBookTab(t.id); }}>
                <I />
                <span className="icon-label">{t.name}</span>
              </button>
            );
          })}
        </div>
      )}
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
