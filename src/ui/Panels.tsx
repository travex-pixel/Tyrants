"use client";
import { useEffect, useMemo, useState } from "react";
import { useGame } from "@/src/store/game";
import { getSession, getWorld } from "@/src/render/context";
import { Icons } from "./icons";
import { Drawer } from "./Hud";
import { SPECIES, TRAITS, SKILLS, skillLevel, BUILDINGS, RESOURCE_NAMES } from "@/src/sim/species";
import type { BuildingType, JobId, ResourceType, SkillId } from "@/src/sim/types";
import { JOB_NAMES } from "@/src/sim/world";
import { PERSONA_INFO, relationLabel, overlordSummary } from "@/src/sim/overlords";
import { audio } from "@/src/audio/audio";
import { supabaseConfigured } from "@/src/net/supabase";
import { timeAgo } from "./Menu";
import { materialsDelivered } from "@/src/sim/tasks";

const STATE_TEXT: Record<string, string> = {
  idle: "Loitering", wander: "Wandering about", seekFood: "Looking for food", eat: "Eating", rest: "Resting", gather: "Gathering", carry: "Hauling", build: "Working", explore: "Exploring",
  socialise: "Chatting", flee: "Running away!", fight: "Fighting!", follow: "Following", celebrate: "Celebrating", recover: "Dazed", held: "Being held by a giant hand", thrown: "Airborne", swim: "Swimming (involuntarily)", raid: "Raiding",
};

function Bar({ v, color, label }: { v: number; color: string; label: string }) {
  return (
    <div className="flex-1 min-w-[70px]">
      <div className="row justify-between" style={{ gap: 4 }}>
        <span className="label" style={{ fontSize: 10 }}>{label}</span>
        <span className="text-[10px] font-bold tabular-nums muted">{Math.round(v)}</span>
      </div>
      <div className="bar">
        <i style={{ width: `${Math.max(0, Math.min(100, v))}%`, background: color }} />
      </div>
    </div>
  );
}

export function CreaturePanel({ id }: { id: number }) {
  useGame((s) => s.uiTick);
  const select = useGame((s) => s.select);
  const follow = useGame((s) => s.followCreature);
  const setFollow = useGame((s) => s.setFollow);
  const focus = useGame((s) => s.focusCamera);
  const commandMode = useGame((s) => s.commandMode);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const w = getWorld();
  const s = getSession();
  const c = w?.creatures[id];
  if (!w || !s || !c) return null;
  const sp = SPECIES[c.species];
  const f = w.factions[c.faction];
  const mine = c.faction === s.myFaction;
  const rels = Object.entries(c.relationships)
    .map(([k, v]) => ({ id: Number(k), v, name: w.creatures[Number(k)]?.name }))
    .filter((r) => r.name && Math.abs(r.v) >= 15)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 3);
  const skills = (Object.keys(SKILLS) as SkillId[]).map((k) => ({ k, lvl: skillLevel(c.skills[k]), xp: c.skills[k] })).sort((a, b) => b.xp - a.xp);
  const topSkill = skills[0];
  const memory = c.memory.slice(-3).reverse();
  const moodText = c.state === "held" ? "Please put me down" : c.mood === "scared" ? "Terrified" : c.mood === "happy" ? "Cheerful" : c.mood === "grumpy" ? "Grumpy" : "Fine, I suppose";
  return (
    <div className="absolute left-3 bottom-[96px] sm:bottom-3 w-[min(94vw,340px)] panel p-3 pop" style={{ pointerEvents: "auto" }}>
      <div className="row">
        <span className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center" style={{ background: sp.color }}>
          <span className="w-3 h-3 rounded-full bg-white/80" />
        </span>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              className="input"
              style={{ padding: "4px 8px" }}
              autoFocus
              value={name}
              maxLength={18}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  s.dispatch({ type: "rename", creatureId: c.id, name, player: s.me.id });
                  setEditing(false);
                }
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={() => setEditing(false)}
            />
          ) : (
            <button className="h1 truncate text-left" onClick={() => { setName(c.name); setEditing(true); }} title="Rename">
              {c.name} {c.scale > 1.5 && "(Giant)"}
            </button>
          )}
          <div className="muted text-[12px] font-semibold truncate">
            {sp.name} · {f?.name ?? c.faction} · {moodText}
          </div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => select(null)}>
          <Icons.close style={{ width: 16, height: 16 }} />
        </button>
      </div>
      <div className="mt-2 text-[13px] font-bold">{STATE_TEXT[c.state] ?? c.state}{c.carrying ? ` · carrying ${c.carrying.amount} ${c.carrying.type}` : ""}</div>
      <div className="flex gap-1 flex-wrap mt-2">
        {c.traits.map((t) => (
          <span key={t} className="chip" style={{ padding: "3px 8px", fontSize: 11 }} title={TRAITS[t].text}>
            {TRAITS[t].name}
          </span>
        ))}
        {w.time < c.blessedUntil && <span className="chip" style={{ padding: "3px 8px", fontSize: 11, color: "#ffe08a" }}>Blessed</span>}
      </div>
      <div className="flex gap-2 mt-3">
        <Bar v={100 - c.hunger} color="#ff8fa3" label="Food" />
        <Bar v={c.energy} color="#5fb3f0" label="Energy" />
        <Bar v={c.happiness} color="#ffd166" label="Mood" />
        <Bar v={c.health} color="#7ee787" label="Health" />
      </div>
      <div className="mt-3 row text-[12px] font-semibold flex-wrap" style={{ gap: 6 }}>
        <span className="label">Skills</span>
        {skills.slice(0, 3).map((sk) => (
          <span key={sk.k} className={`chip ${sk.lvl >= 5 ? "text-[#ffe08a]" : ""}`} style={{ padding: "3px 8px", fontSize: 11 }}>
            {SKILLS[sk.k].name} {sk.lvl}
          </span>
        ))}
        {topSkill && topSkill.lvl >= 5 && <span className="muted">— an expert {topSkill.k === "woodcutting" ? "woodcutter" : topSkill.k === "construction" ? "builder" : topSkill.k === "farming" ? "farmer" : topSkill.k === "exploration" ? "explorer" : "forager"}</span>}
      </div>
      {rels.length > 0 && (
        <div className="mt-2 text-[12px] font-semibold row flex-wrap" style={{ gap: 6 }}>
          <span className="label">Feels</span>
          {rels.map((r) => (
            <button key={r.id} className="chip" style={{ padding: "3px 8px", fontSize: 11, color: r.v > 0 ? "#b6f3bd" : "#ffb3b3" }} onClick={() => select(r.id)}>
              {r.v >= 60 ? "❤" : r.v > 0 ? "+" : r.v <= -50 ? "✕" : "−"} {r.name}
            </button>
          ))}
        </div>
      )}
      {memory.length > 0 && (
        <div className="mt-2 text-[11px] muted font-semibold">
          Remembers: {memory.map((m) => memoryText(m.kind, m.who !== undefined ? w.creatures[m.who]?.name : undefined)).join(" · ")}
        </div>
      )}
      <div className="flex gap-2 mt-3">
        <button className={`btn btn-sm flex-1 ${follow ? "btn-primary" : ""}`} onClick={() => { setFollow(!follow); audio.click(); }}>
          <Icons.eye style={{ width: 14, height: 14 }} /> {follow ? "Following" : "Follow"}
        </button>
        <button className="btn btn-sm flex-1" onClick={() => focus(c.x, c.z, 14)}>
          <Icons.target style={{ width: 14, height: 14 }} /> Find
        </button>
        {mine && (
          <button className={`btn btn-sm flex-1 ${commandMode ? "btn-primary" : ""}`} title="Then tap the ground (or right-click anytime)" onClick={() => { useGame.getState().setCommandMode(!commandMode); useGame.getState().toast(commandMode ? "Send cancelled" : `Tap the ground to send ${c.name} there`, "info"); }}>
            {commandMode ? "Tap ground…" : "Send"}
          </button>
        )}
      </div>
    </div>
  );
}

function memoryText(kind: string, who?: string) {
  switch (kind) {
    case "stolen_from": return `${who ?? "someone"} stole from them`;
    case "pranked": return `${who ?? "someone"} pranked them`;
    case "thrown": return "being thrown";
    case "struck": return "the lightning";
    case "blessed": return "being blessed";
    case "found": return "finding something";
    case "celebrated": return "a celebration";
    case "helped": return `${who ?? "someone"} helping`;
    case "threat": return "a fright";
    default: return kind;
  }
}

export function BuildingPanel({ id }: { id: number }) {
  useGame((s) => s.uiTick);
  const w = getWorld();
  const s = getSession();
  const b = w?.buildings[id];
  if (!w || !s || !b) return null;
  const def = BUILDINGS[b.type];
  const mine = b.faction === s.myFaction;
  const occupants = b.occupants.map((o) => w.creatures[o]?.name).filter(Boolean);
  return (
    <div className="absolute left-3 bottom-[96px] sm:bottom-3 w-[min(94vw,320px)] panel p-3 pop" style={{ pointerEvents: "auto" }}>
      <div className="row">
        <div className="flex-1">
          <div className="h1">{def.name}</div>
          <div className="muted text-[12px] font-semibold">{w.factions[b.faction]?.name ?? b.faction}</div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => useGame.getState().selectBuilding(null)}>
          <Icons.close style={{ width: 16, height: 16 }} />
        </button>
      </div>
      <div className="muted text-[12px] font-semibold mt-1">{def.text}</div>
      {!b.complete && (
        <div className="mt-3">
          <div className="label mb-1">{materialsDelivered(b) ? `Building · ${Math.round(b.progress * 100)}%` : "Waiting for materials"}</div>
          {!materialsDelivered(b) && (
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(b.cost) as ResourceType[]).map((r) => (
                <span key={r} className="chip" style={{ fontSize: 12 }}>
                  {RESOURCE_NAMES[r]} {b.delivered[r] ?? 0}/{b.cost[r]}
                </span>
              ))}
            </div>
          )}
          {materialsDelivered(b) && (
            <div className="bar">
              <i style={{ width: `${b.progress * 100}%` }} />
            </div>
          )}
        </div>
      )}
      {b.complete && b.type === "farm" && (
        <div className="mt-3">
          <div className="label mb-1">{b.cropTimer >= 1 ? "Ripe! Waiting for a farmer" : `Crops growing · ${Math.round(b.cropTimer * 100)}%`}</div>
          <div className="bar">
            <i style={{ width: `${b.cropTimer * 100}%`, background: "#7ee787" }} />
          </div>
        </div>
      )}
      {b.complete && b.type === "house" && <div className="mt-2 text-[12px] font-semibold">Residents: {occupants.length ? occupants.join(", ") : "nobody yet"}</div>}
      {mine && (
        <button
          className="btn btn-sm btn-danger mt-3 w-full"
          onClick={() => {
            const r = s.dispatch({ type: "cancelBuilding", buildingId: b.id, player: s.me.id });
            if (!r.ok) useGame.getState().toast(r.reason, "bad");
            else useGame.getState().selectBuilding(null);
          }}
        >
          {b.complete ? "Demolish (refunds half)" : "Cancel (refunds materials)"}
        </button>
      )}
    </div>
  );
}

export function BuildMenu() {
  useGame((s) => s.uiTick);
  const setBuildType = useGame((s) => s.setBuildType);
  const w = getWorld();
  const s = getSession();
  if (!w || !s) return null;
  const f = w.factions[s.myFaction];
  const canSet = s.role !== "client" || true;
  return (
    <Drawer title="Build">
      <div className="muted text-[12px] font-semibold mb-2">Pick a building, then tap the ground. Creatures gather the materials and build it themselves.</div>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(BUILDINGS) as BuildingType[]).map((t) => {
          const d = BUILDINGS[t];
          const locked = d.unlock && !w.achievements[d.unlock]?.unlockedAt;
          const affordable = Object.entries(d.cost).every(([k, v]) => f.stock[k as ResourceType] >= (v ?? 0));
          return (
            <button
              key={t}
              className={`btn flex-col items-start gap-1 text-left ${locked ? "opacity-50" : ""}`}
              style={{ padding: "10px 12px" }}
              disabled={!!locked}
              title={locked ? `Unlock: ${w.achievements[d.unlock!]?.title}` : d.text}
              onClick={() => {
                setBuildType(t);
                audio.click();
              }}
            >
              <span className="font-bold">{d.name}</span>
              <span className="row flex-wrap" style={{ gap: 4 }}>
                {Object.entries(d.cost).map(([k, v]) => (
                  <span key={k} className="text-[11px] font-bold" style={{ color: f.stock[k as ResourceType] >= (v ?? 0) ? "var(--muted)" : "var(--bad)" }}>
                    {v} {k}
                  </span>
                ))}
                {!affordable && <span className="text-[10px] muted">(they'll gather it)</span>}
              </span>
              <span className="muted text-[11px] font-semibold leading-tight">{d.text}</span>
            </button>
          );
        })}
      </div>
      {w.meta.mode === "sandbox" && (
        <label className="row text-sm font-semibold mt-3">
          <input type="checkbox" checked={!!w.flags.instantBuild} onChange={(e) => { w.flags.instantBuild = e.target.checked ? 1 : 0; useGame.getState().bump(); }} /> Instant construction (sandbox)
        </label>
      )}
      <div className="mt-4">
        <div className="label mb-2">Job priorities</div>
        {(Object.keys(JOB_NAMES) as JobId[]).map((j) => (
          <div key={j} className="row mb-1.5">
            <span className="w-16 text-[13px] font-bold">{JOB_NAMES[j]}</span>
            <input className="flex-1" type="range" min={0} max={2} step={0.1} value={f.jobPriorities[j]} disabled={!canSet} onChange={(e) => s.dispatch({ type: "setPriority", job: j, value: Number(e.target.value), player: s.me.id })} />
            <span className="w-8 text-right text-[12px] font-bold tabular-nums muted">{f.jobPriorities[j].toFixed(1)}</span>
          </div>
        ))}
        <div className="muted text-[11px] font-semibold">Higher priority makes creatures prefer that kind of work. Lumber camps and farms add dedicated workers.</div>
      </div>
    </Drawer>
  );
}

export function ChroniclePanel() {
  useGame((s) => s.uiTick);
  const setSeen = useGame((s) => s.setLastChronicleSeen);
  const [filter, setFilter] = useState<string>("all");
  const w = getWorld();
  useEffect(() => {
    if (w && w.chronicle.length) setSeen(w.chronicle[w.chronicle.length - 1].id);
  });
  if (!w) return null;
  const entries = w.chronicle.filter((e) => filter === "all" || e.kind === filter).slice(-80).reverse();
  const kinds = ["all", "story", "social", "build", "rival", "power", "discovery", "milestone"];
  return (
    <Drawer title="Chronicle">
      <div className="flex gap-1 flex-wrap mb-2">
        {kinds.map((k) => (
          <button key={k} className={`btn btn-sm ${filter === k ? "btn-primary" : "btn-ghost"}`} style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => setFilter(k)}>
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {entries.map((e) => (
          <button
            key={e.id}
            className={`text-left px-3 py-2 rounded-xl text-[13px] font-semibold ${e.importance >= 3 ? "bg-[rgba(242,184,75,0.12)]" : e.importance === 2 ? "bg-white/5" : ""}`}
            onClick={() => {
              if (e.x !== undefined && e.z !== undefined) useGame.getState().focusCamera(e.x, e.z, 18);
            }}
          >
            <span className="muted text-[11px] mr-2 tabular-nums">D{e.day}</span>
            {e.text}
          </button>
        ))}
        {entries.length === 0 && <div className="muted text-sm">Nothing yet. Give it a minute.</div>}
      </div>
    </Drawer>
  );
}

export function RivalPanel({ islandId }: { islandId?: number }) {
  useGame((s) => s.uiTick);
  const w = getWorld();
  const s = getSession();
  const focus = useGame((s) => s.focusCamera);
  if (!w || !s) return null;
  const rivals = Object.values(w.factions).filter((f) => f.isAI && (islandId === undefined || f.homeIslandId === islandId));
  const me = w.factions[s.myFaction];
  const humans = Object.values(w.factions).filter((f) => !f.isAI);
  const body = (
    <div className="flex flex-col gap-3">
      {rivals.length === 0 && <div className="muted text-sm font-semibold">No AI Overlords in this world.</div>}
      {rivals.map((f) => {
        const sum = overlordSummary(w, f);
        const P = f.persona ? PERSONA_INFO[f.persona] : null;
        const isl = w.islands.find((i) => i.id === f.homeIslandId);
        const rel = sum.relation;
        return (
          <div key={f.id} className="panel p-3" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="row">
              <span className="w-3 h-3 rounded-full" style={{ background: f.color }} />
              <div className="flex-1">
                <div className="h1">{f.name}</div>
                <div className="muted text-[12px] font-semibold">{P?.blurb}</div>
              </div>
            </div>
            <div className="row mt-2 flex-wrap" style={{ gap: 6 }}>
              <span className="chip" style={{ fontSize: 12, color: rel <= -25 ? "#ffb3b3" : rel >= 25 ? "#b6f3bd" : undefined }}>{relationLabel(rel)} ({Math.round(rel)})</span>
              <span className="chip" style={{ fontSize: 12 }}>{sum.pop} creatures</span>
              <span className="chip" style={{ fontSize: 12 }}>{sum.complete} buildings</span>
              <span className="chip" style={{ fontSize: 12 }}>Score {sum.score}</span>
            </div>
            <div className="text-[12px] font-semibold mt-2">Currently: {sum.goal}</div>
            <div className="muted text-[11px] font-semibold mt-1">Stores: {Math.floor(f.stock.wood)} wood · {Math.floor(f.stock.stone)} stone · {Math.floor(f.stock.food)} food</div>
            {f.aiMemory.length > 0 && (
              <div className="muted text-[11px] font-semibold mt-1">Remembers: {f.aiMemory.slice(-3).map((m) => m.text).join(" ")}</div>
            )}
            {f.tradeOffers.map((o) => (
              <div key={o.id} className="mt-2 panel p-2" style={{ background: "rgba(242,184,75,0.1)", borderColor: "rgba(242,184,75,0.3)" }}>
                <div className="text-[12px] font-bold">Trade offer: {o.text}</div>
                <div className="flex gap-2 mt-1">
                  <button className="btn btn-sm btn-primary flex-1" onClick={() => { const r = s.dispatch({ type: "trade", offerId: o.id, accept: true, player: s.me.id }); if (!r.ok) useGame.getState().toast(r.reason, "bad"); }}>Accept</button>
                  <button className="btn btn-sm flex-1" onClick={() => s.dispatch({ type: "trade", offerId: o.id, accept: false, player: s.me.id })}>Decline</button>
                </div>
              </div>
            ))}
            <div className="flex gap-2 mt-2 flex-wrap">
              {isl && (
                <button className="btn btn-sm flex-1" onClick={() => focus(isl.center.x, isl.center.z, 36)}>
                  <Icons.target style={{ width: 14, height: 14 }} /> Visit
                </button>
              )}
              {(["wood", "food"] as ResourceType[]).map((r) => (
                <button key={r} className="btn btn-sm flex-1" disabled={!me || me.stock[r] < 5} title="Gifts improve relations" onClick={() => s.dispatch({ type: "gift", toFaction: f.id, resource: r, amount: 5, player: s.me.id })}>
                  Gift 5 {r}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {humans.length > 1 && (
        <div>
          <div className="label mb-1">Overlords in this world</div>
          {humans.map((f) => (
            <div key={f.id} className="row text-[13px] font-semibold py-1">
              <span className="w-3 h-3 rounded-full" style={{ background: f.color }} /> <span className="flex-1">{f.name}</span> <span className="muted">Score {f.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  if (islandId !== undefined) {
    return (
      <div className="absolute left-3 bottom-[96px] sm:bottom-3 w-[min(94vw,360px)] panel p-3 pop scroll" style={{ pointerEvents: "auto", maxHeight: "60vh" }}>
        <div className="row mb-2">
          <div className="h1 flex-1">{w.islands.find((i) => i.id === islandId)?.name}</div>
          <button className="btn btn-sm btn-ghost" onClick={() => useGame.getState().selectIsland(null)}>
            <Icons.close style={{ width: 16, height: 16 }} />
          </button>
        </div>
        {body}
      </div>
    );
  }
  return <Drawer title="Rival Overlords">{body}</Drawer>;
}

export function PlayersPanel({ actions }: { actions: { createRoom: (mode: "shared" | "rivals", rivals: boolean) => Promise<void>; joinRoom: (code: string) => Promise<void>; leaveToMenu: () => Promise<void> } }) {
  useGame((s) => s.uiTick);
  const net = useGame((s) => s.net);
  const [code, setCode] = useState("");
  const w = getWorld();
  const s = getSession();
  if (!w || !s) return null;
  const link = net.roomCode ? `${(process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "")}/join/${net.roomCode}` : "";
  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => useGame.getState().toast("Copied!", "good")).catch(() => useGame.getState().toast(text, "info"));
  };
  return (
    <Drawer title="Players">
      {net.connected && net.roomCode ? (
        <div className="flex flex-col gap-3">
          <div>
            <div className="label">Room code</div>
            <div className="row mt-1">
              <span className="text-3xl font-black tracking-[0.3em]">{net.roomCode}</span>
              <button className="btn btn-sm" onClick={() => copy(net.roomCode!)}>
                <Icons.copy style={{ width: 14, height: 14 }} /> Copy
              </button>
            </div>
            <button className="btn btn-primary w-full mt-2" onClick={() => copy(link)}>
              <Icons.link style={{ width: 16, height: 16 }} /> Copy invite link
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button className="btn w-full mt-2" onClick={() => navigator.share({ title: "Little Tyrants", text: `Join my world: ${net.roomCode}`, url: link }).catch(() => {})}>
                Share…
              </button>
            )}
          </div>
          <div>
            <div className="label mb-1">In this world ({net.players.length})</div>
            {net.players.map((p) => (
              <div key={p.id} className="row py-1 text-[13px] font-semibold">
                <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                <span className="flex-1">{p.name}{p.id === s.me.id ? " (you)" : ""}</span>
                {p.isHost && (
                  <span className="chip" style={{ fontSize: 11 }}>
                    <Icons.crown style={{ width: 12, height: 12 }} /> Host
                  </span>
                )}
              </div>
            ))}
            {net.players.length <= 1 && <div className="muted text-[12px] font-semibold mt-1">Waiting for friends. Send them the link!</div>}
          </div>
          <div className="muted text-[11px] font-semibold">
            {net.role === "host" ? "You are hosting: your browser runs the simulation. If you leave, the longest-connected player takes over." : "Another player hosts the simulation. Your actions are sent to them and the world streams back."}
            {" "}Mode: {w.meta.mpMode === "rivals" ? "Rival Overlords" : "Shared Sandbox"}.
          </div>
          <button className="btn btn-danger" onClick={actions.leaveToMenu}>
            Leave world
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {!supabaseConfigured() && (
            <div className="panel text-[12px] font-semibold" style={{ padding: 10, background: "rgba(255,107,107,0.12)", borderColor: "rgba(255,107,107,0.3)" }}>
              Multiplayer needs Supabase credentials. Everything else works offline. See README.md.
            </div>
          )}
          <div className="muted text-[12px] font-semibold">Open a new shared world for your friends (this one stays saved locally).</div>
          <button className="btn btn-primary" disabled={!supabaseConfigured()} onClick={() => actions.createRoom("shared", true)}>
            Create shared world
          </button>
          <button className="btn" disabled={!supabaseConfigured()} onClick={() => actions.createRoom("rivals", true)}>
            Create rival-overlords world
          </button>
          <div className="row">
            <input className="input uppercase tracking-widest" placeholder="ROOM CODE" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <button className="btn" disabled={!supabaseConfigured()} onClick={() => actions.joinRoom(code)}>
              Join
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

export function AchievementsPanel() {
  useGame((s) => s.uiTick);
  const w = getWorld();
  if (!w) return null;
  const list = Object.values(w.achievements);
  const done = list.filter((a) => a.unlockedAt !== null).length;
  return (
    <Drawer title={`Achievements · ${done}/${list.length}`}>
      <div className="flex flex-col gap-1">
        {list
          .slice()
          .sort((a, b) => (b.unlockedAt !== null ? 1 : 0) - (a.unlockedAt !== null ? 1 : 0))
          .map((a) => (
            <div key={a.id} className={`row px-3 py-2 rounded-xl ${a.unlockedAt !== null ? "bg-[rgba(242,184,75,0.12)]" : "opacity-60"}`}>
              <Icons.trophy style={{ width: 18, height: 18, color: a.unlockedAt !== null ? "var(--accent)" : "var(--muted)" }} />
              <div className="flex-1">
                <div className="text-[13px] font-bold">{a.title}</div>
                <div className="muted text-[11px] font-semibold">{a.text}</div>
              </div>
              <span className="chip" style={{ fontSize: 11 }}>
                +{a.essence}✦
              </span>
            </div>
          ))}
      </div>
      <div className="mt-3">
        <div className="label mb-1">Discoveries</div>
        {Object.values(w.discoveries)
          .filter((d) => d.found)
          .map((d) => (
            <button key={d.id} className="text-[13px] font-semibold block py-0.5" onClick={() => useGame.getState().focusCamera(d.x, d.z, 14)}>
              ✦ {d.name} — found by {w.creatures[d.foundBy ?? -1]?.name ?? "someone"}
            </button>
          ))}
        {!Object.values(w.discoveries).some((d) => d.found) && <div className="muted text-[12px] font-semibold">Nothing found yet. Curious creatures wander furthest.</div>}
      </div>
    </Drawer>
  );
}

export function SettingsPanel({ inMenu, onReplayIntro }: { inMenu?: boolean; onReplayIntro?: () => void }) {
  const settings = useGame((s) => s.settings);
  const set = useGame((s) => s.setSettings);
  const Slider = ({ k, label }: { k: "master" | "sfx" | "ambient"; label: string }) => (
    <div className="row mb-2">
      <span className="w-20 text-[13px] font-bold">{label}</span>
      <input className="flex-1" type="range" min={0} max={1} step={0.05} value={settings[k]} onChange={(e) => set({ [k]: Number(e.target.value) })} />
      <span className="w-8 text-right text-[12px] muted font-bold">{Math.round(settings[k] * 100)}</span>
    </div>
  );
  return (
    <div>
      <div className="label mb-2">Audio</div>
      <Slider k="master" label="Master" />
      <Slider k="sfx" label="Effects" />
      <Slider k="ambient" label="Ambience" />
      <div className="label mb-2 mt-3">Graphics</div>
      <div className="flex gap-2">
        {(["low", "medium", "high"] as const).map((q) => (
          <button key={q} className={`btn btn-sm flex-1 ${settings.quality === q ? "btn-primary" : ""}`} onClick={() => set({ quality: q })}>
            {q[0].toUpperCase() + q.slice(1)}
          </button>
        ))}
      </div>
      <div className="muted text-[11px] font-semibold mt-1">Low disables shadows and antialiasing for older phones.</div>
      <label className="row text-sm font-semibold mt-3">
        <input type="checkbox" checked={settings.showNames} onChange={(e) => set({ showNames: e.target.checked })} /> Show creature names when zoomed in
      </label>
      <label className="row text-sm font-semibold mt-2">
        <input type="checkbox" checked={settings.invertDrag} onChange={(e) => set({ invertDrag: e.target.checked })} /> Invert camera drag
      </label>
      {inMenu && onReplayIntro && (
        <button className="btn w-full mt-3" onClick={onReplayIntro}>
          Replay the intro
        </button>
      )}
      {!inMenu && (
        <div className="mt-4">
          <div className="label mb-2">Controls</div>
          <div className="text-[12px] font-semibold flex flex-col gap-1 muted">
            <div><span className="kbd">Drag</span> pan · <span className="kbd">Wheel</span> / pinch zoom · <span className="kbd">Right-drag</span> / two-finger twist rotate</div>
            <div><span className="kbd">Tap</span> select / use power · <span className="kbd">Right-click</span> send selected creature</div>
            <div><span className="kbd">1–8</span> powers · <span className="kbd">B</span> build · <span className="kbd">C</span> chronicle · <span className="kbd">F</span> follow · <span className="kbd">H</span> home · <span className="kbd">Space</span> pause</div>
            <div><span className="kbd">WASD</span> pan · <span className="kbd">Q/E</span> rotate · <span className="kbd">Shift</span>+place keeps build mode</div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PausePanel({ actions }: { actions: { leaveToMenu: () => Promise<void>; saveNow: () => Promise<void> } }) {
  const setPanel = useGame((s) => s.setPanel);
  const s = getSession();
  const w = getWorld();
  const [tab, setTab] = useState<"menu" | "settings">("menu");
  const saved = useMemo(() => (w ? timeAgo(w.meta.savedAt) : ""), [w]);
  if (!s || !w) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[2px]" style={{ pointerEvents: "auto" }} onClick={() => setPanel("none")}>
      <div className="panel p-5 w-full max-w-sm pop" onClick={(e) => e.stopPropagation()}>
        <div className="row mb-3">
          <div className="title text-2xl flex-1">Little Tyrants</div>
          <button className={`btn btn-sm ${tab === "settings" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab(tab === "menu" ? "settings" : "menu")}>
            <Icons.cog style={{ width: 14, height: 14 }} /> Settings
          </button>
        </div>
        {tab === "settings" ? (
          <SettingsPanel />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="muted text-[12px] font-semibold">
              {w.meta.name} · Day {w.day} · {w.meta.mode}{s.role === "solo" ? ` · saved ${saved}` : ` · ${s.role}`}
            </div>
            <button className="btn btn-primary" onClick={() => setPanel("none")}>
              <Icons.play style={{ width: 16, height: 16 }} /> Resume
            </button>
            {s.engine && (
              <button className="btn" onClick={() => { s.engine!.paused = !s.engine!.paused; setPanel("none"); }}>
                <Icons.pause style={{ width: 16, height: 16 }} /> {s.engine.paused ? "Unpause simulation" : "Pause simulation"}
              </button>
            )}
            {s.engine && (
              <div className="row">
                <span className="text-[13px] font-bold w-16">Speed</span>
                {[1, 2, 3].map((sp) => (
                  <button key={sp} className={`btn btn-sm flex-1 ${s.engine!.speed === sp ? "btn-primary" : ""}`} onClick={() => { s.engine!.speed = sp; useGame.getState().bump(); }}>
                    {sp}×
                  </button>
                ))}
              </div>
            )}
            {s.role === "solo" && (
              <button className="btn" onClick={actions.saveNow}>
                <Icons.save style={{ width: 16, height: 16 }} /> Save now
              </button>
            )}
            <button className="btn" onClick={actions.leaveToMenu}>
              <Icons.home style={{ width: 16, height: 16 }} /> Main menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
