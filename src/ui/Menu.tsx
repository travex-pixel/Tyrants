"use client";
import { useEffect, useState } from "react";
import { useGame } from "@/src/store/game";
import type { SaveMeta } from "@/src/persistence/saves";
import { deleteSave, setIdentityName } from "@/src/persistence/saves";
import { CHALLENGES } from "@/src/sim/challenges";
import { supabaseConfigured } from "@/src/net/supabase";
import { Icons } from "./icons";
import { SettingsPanel } from "./Panels";
import { audio } from "@/src/audio/audio";
import type { CreateWorldOptions } from "@/src/sim/world";

interface Actions {
  continueWorld: () => Promise<void>;
  newSolo: (o: Partial<CreateWorldOptions> & { intro?: boolean }) => Promise<void>;
  newSandbox: () => Promise<void>;
  startChallenge: (id: string) => Promise<void>;
  loadSave: (id: string) => Promise<void>;
  createRoom: (mode: "shared" | "rivals", rivals: boolean) => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  refreshSaves: () => Promise<void>;
  replayIntro: () => void;
  setName: (n: string) => void;
}

export function Menu({ saves, actions, identity }: { saves: SaveMeta[]; actions: Actions; identity: { id: string; name: string } }) {
  const sub = useGame((s) => s.menuSub);
  const setSub = useGame((s) => s.setMenuSub);
  const latest = saves[0];
  const [name, setName] = useState(identity.name);
  const pendingJoin = useGame((s) => s.pendingJoinCode);
  useEffect(() => {
    if (pendingJoin) setSub("friends");
  }, [pendingJoin, setSub]);

  const Item = ({ label, hint, onClick, primary, icon }: { label: string; hint?: string; onClick: () => void; primary?: boolean; icon?: keyof typeof Icons }) => {
    const I = icon ? Icons[icon] : null;
    return (
      <button
        className={`btn w-full justify-start text-left ${primary ? "btn-primary" : ""}`}
        style={{ padding: "13px 16px" }}
        onClick={() => {
          audio.click();
          onClick();
        }}
        onMouseEnter={() => audio.hover()}
      >
        {I && <I style={{ width: 20, height: 20, flexShrink: 0 }} />}
        <span className="flex flex-col items-start gap-0.5">
          <span>{label}</span>
          {hint && <span className={`text-[11px] font-semibold ${primary ? "opacity-70" : "muted"}`}>{hint}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="absolute inset-0 z-20 flex items-end sm:items-center justify-start p-4 sm:p-10 pointer-events-none">
      <div className="panel w-full sm:w-[420px] max-h-[92vh] flex flex-col p-5 sm:p-6 gap-4 pop" style={{ pointerEvents: "auto" }}>
        <div>
          <div className="title text-4xl sm:text-5xl leading-none">Little Tyrants</div>
          <div className="muted mt-2 text-sm font-semibold">Small worlds. Big egos.</div>
        </div>
        {sub === "main" && (
          <div className="flex flex-col gap-2 fade-up">
            {latest && <Item icon="play" primary label="Continue World" hint={`${latest.name} · Day ${latest.day} · ${latest.population} creatures`} onClick={actions.continueWorld} />}
            <Item icon="sun" label="Solo World" hint="Build a civilisation against three AI Overlords" onClick={() => setSub("new")} />
            <Item icon="users" label="Play with Friends" hint={supabaseConfigured() ? "Share one world with 2–4 players" : "Needs Supabase credentials — see README"} onClick={() => setSub("friends")} />
            <Item icon="sparkle" label="Creative Sandbox" hint="Every power unlocked, instant building, no rivals" onClick={actions.newSandbox} />
            <Item icon="trophy" label="Challenges" hint="Short, replayable scenarios" onClick={() => setSub("challenges")} />
            <div className="flex gap-2 mt-1">
              {saves.length > 0 && (
                <button className="btn btn-sm flex-1" onClick={() => setSub("saves")}>
                  <Icons.save style={{ width: 16, height: 16 }} /> Worlds ({saves.length})
                </button>
              )}
              <button className="btn btn-sm flex-1" onClick={() => setSub("settings")}>
                <Icons.cog style={{ width: 16, height: 16 }} /> Settings
              </button>
            </div>
            <div className="row mt-1">
              <span className="label">Playing as</span>
              <input
                className="input"
                style={{ padding: "6px 10px", fontSize: 13 }}
                value={name}
                maxLength={20}
                onChange={(e) => {
                  setName(e.target.value);
                  setIdentityName(e.target.value);
                  actions.setName(e.target.value);
                }}
              />
            </div>
          </div>
        )}
        {sub === "new" && <NewWorld onBack={() => setSub("main")} onStart={actions.newSolo} />}
        {sub === "friends" && <Friends onBack={() => setSub("main")} actions={actions} initialCode={pendingJoin ?? ""} />}
        {sub === "challenges" && (
          <div className="flex flex-col gap-2 fade-up scroll" style={{ maxHeight: "60vh" }}>
            {CHALLENGES.map((c) => {
              const best = bestScore(c.id);
              return (
                <button key={c.id} className="btn justify-start text-left flex-col items-start gap-1" style={{ padding: "12px 14px" }} onClick={() => actions.startChallenge(c.id)}>
                  <span className="row w-full">
                    <span className="flex-1">{c.title}</span>
                    {best !== null && <span className="chip" style={{ fontSize: 11, padding: "2px 8px" }}>Best {best}</span>}
                  </span>
                  <span className="muted text-[12px] font-semibold">{c.tagline}</span>
                </button>
              );
            })}
            <button className="btn btn-ghost" onClick={() => setSub("main")}>
              Back
            </button>
          </div>
        )}
        {sub === "saves" && (
          <div className="flex flex-col gap-2 fade-up scroll" style={{ maxHeight: "60vh" }}>
            {saves.map((s) => (
              <div key={s.id} className="row panel" style={{ padding: "10px 12px", background: "rgba(255,255,255,0.04)" }}>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{s.name}</div>
                  <div className="muted text-[12px] font-semibold">
                    {s.mode} · Day {s.day} · {s.population} creatures · {s.buildings} buildings · {timeAgo(s.savedAt)}
                  </div>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => actions.loadSave(s.id)}>
                  Load
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={async () => {
                    if (confirm(`Delete "${s.name}" forever?`)) {
                      await deleteSave(s.id);
                      await actions.refreshSaves();
                    }
                  }}
                >
                  <Icons.close style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ))}
            <button className="btn btn-ghost" onClick={() => setSub("main")}>
              Back
            </button>
          </div>
        )}
        {sub === "settings" && (
          <div className="fade-up">
            <SettingsPanel inMenu onReplayIntro={actions.replayIntro} />
            <button className="btn btn-ghost w-full mt-2" onClick={() => setSub("main")}>
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NewWorld({ onBack, onStart }: { onBack: () => void; onStart: Actions["newSolo"] }) {
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");
  const [seed, setSeed] = useState("");
  const [intro, setIntro] = useState(false);
  return (
    <div className="flex flex-col gap-3 fade-up">
      <div className="h1">New Solo World</div>
      <div>
        <div className="label mb-1">Rival difficulty</div>
        <div className="flex gap-2">
          {(["easy", "normal", "hard"] as const).map((d) => (
            <button key={d} className={`btn btn-sm flex-1 ${difficulty === d ? "btn-primary" : ""}`} onClick={() => setDifficulty(d)}>
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <div className="muted text-[12px] mt-1 font-semibold">{difficulty === "easy" ? "Rivals expand slowly and rarely raid." : difficulty === "hard" ? "Rivals think faster, build two things at once and raid when you look weak." : "Balanced competition."}</div>
      </div>
      <div>
        <div className="label mb-1">Island seed (optional)</div>
        <input className="input" placeholder="Leave empty for a random island" value={seed} onChange={(e) => setSeed(e.target.value)} />
      </div>
      <label className="row text-sm font-semibold">
        <input type="checkbox" checked={intro} onChange={(e) => setIntro(e.target.checked)} /> Play the cloud reveal intro
      </label>
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={onBack}>
          Back
        </button>
        <button className="btn btn-primary flex-1" onClick={() => onStart({ difficulty, seed: seed.trim() ? hashSeed(seed.trim()) : undefined, intro })}>
          Create World
        </button>
      </div>
    </div>
  );
}

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function Friends({ onBack, actions, initialCode }: { onBack: () => void; actions: Actions; initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [mode, setMode] = useState<"shared" | "rivals">("shared");
  const [rivals, setRivals] = useState(true);
  const ok = supabaseConfigured();
  return (
    <div className="flex flex-col gap-3 fade-up">
      <div className="h1">Play with Friends</div>
      {!ok && (
        <div className="text-[13px] font-semibold rounded-lg" style={{ padding: 12, background: "rgba(169,58,42,0.12)", border: "1px solid rgba(169,58,42,0.4)" }}>
          Multiplayer is switched off because this deployment has no Supabase credentials. Solo, Sandbox and Challenges work without them. See README.md for a 5-minute setup.
        </div>
      )}
      <div>
        <div className="label mb-1">Join a world</div>
        <div className="flex gap-2">
          <input className="input uppercase tracking-widest" placeholder="ROOM CODE" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && actions.joinRoom(code)} />
          <button className="btn btn-primary" disabled={!ok} onClick={() => actions.joinRoom(code)}>
            Join
          </button>
        </div>
      </div>
      <div className="h-px bg-[rgba(90,58,32,0.25)]" />
      <div>
        <div className="label mb-1">Create a world</div>
        <div className="flex gap-2 mb-2">
          <button className={`btn btn-sm flex-1 ${mode === "shared" ? "btn-primary" : ""}`} onClick={() => setMode("shared")}>
            Shared Sandbox
          </button>
          <button className={`btn btn-sm flex-1 ${mode === "rivals" ? "btn-primary" : ""}`} onClick={() => setMode("rivals")}>
            Rival Overlords
          </button>
        </div>
        <div className="muted text-[12px] font-semibold mb-2">{mode === "shared" ? "Everyone controls one civilisation together. Build, experiment and cause chaos." : "Each player gets their own settlement on the same island. Compete for resources and score."}</div>
        <label className="row text-sm font-semibold mb-2">
          <input type="checkbox" checked={rivals} onChange={(e) => setRivals(e.target.checked)} /> Include AI Overlords on neighbouring islands
        </label>
        <button className="btn btn-primary w-full" disabled={!ok} onClick={() => actions.createRoom(mode, rivals)}>
          Create & get invite link
        </button>
      </div>
      <button className="btn btn-ghost" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

export function timeAgo(ms: number) {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function bestScore(id: string): number | null {
  try {
    const v = localStorage.getItem(`lt:best:${id}`);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
export function recordScore(id: string, score: number): boolean {
  const prev = bestScore(id);
  if (prev !== null && prev >= score) return false;
  try {
    localStorage.setItem(`lt:best:${id}`, String(score));
  } catch {
    /* ignore */
  }
  return true;
}
