"use client";
import { useState } from "react";
import { useGame } from "@/src/store/game";
import { getSession, getWorld } from "@/src/render/context";
import { goalById } from "@/src/sim/goals";
import { levelTitle, xpForLevel } from "@/src/sim/progression";
import { Icons } from "./icons";
import { audio } from "@/src/audio/audio";

/** The "Decrees" scroll: three live goals with progress, plus the Overlord level ring. */
export function DecreesPanel() {
  useGame((s) => s.uiTick);
  const [open, setOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 700);
  const w = getWorld();
  if (!w || w.meta.mode === "sandbox" || w.meta.mode === "challenge") return null;
  const g = w.goals;
  const active = g.active.map((id) => goalById(id)).filter(Boolean) as NonNullable<ReturnType<typeof goalById>>[];
  if (!active.length) return null;
  const f = w.factions[w.playerFaction];
  const recent = w.flags.goalJustDone && w.time - (w.flags.goalJustDone as number) < 4;
  return (
    <div className="absolute left-3 top-[70px] decrees pointer-events-none" style={{ zIndex: 5 }}>
      <div className="panel p-2 pointer-events-auto fade-up" style={{ padding: "8px 10px" }}>
        <button className="row w-full text-left" onClick={() => { setOpen((v) => !v); audio.click(); }}>
          <Icons.flag style={{ width: 16, height: 16, color: "#7a4a10" }} />
          <span className="h1 flex-1">Decrees</span>
          <span className="chip" style={{ padding: "1px 7px", fontSize: 11 }} title={`Overlord level ${w.level}: ${levelTitle(w.level)}`}>Lv {w.level}</span>
          <span className="chip" style={{ padding: "1px 7px", fontSize: 11, color: "#6a4aa8" }} title="Essence: spend it on new powers in the pouch">{Math.floor(f?.essence ?? 0)}✦</span>
          <span className="muted text-[12px]">{open ? "▾" : "▸"}</span>
        </button>
        {w.dare && (
          <button className="dare-card w-full text-left mt-2 pointer-events-auto" onClick={() => { if (w.dare?.x !== undefined && w.dare.z !== undefined) useGame.getState().focusCamera(w.dare.x, w.dare.z, 22); }}>
            <div className="row">
              <span className="text-[11px] font-black tracking-widest">DARE</span>
              <span className="flex-1 text-[13px] font-extrabold truncate">{w.dare.text}</span>
              <span className="text-[12px] font-black tabular-nums">{Math.max(0, Math.round(w.dare.expiresAt - w.time))}s</span>
            </div>
            <div className="bar mt-1" style={{ height: 5, background: "rgba(60,30,10,0.25)" }}>
              <i style={{ width: `${Math.max(0, Math.min(100, (1 - (w.time - w.dare.startedAt) / (w.dare.expiresAt - w.dare.startedAt)) * 100))}%`, background: "#3b2508" }} />
            </div>
          </button>
        )}
        {open && (
          <div className="flex flex-col gap-1.5 mt-2">
            {active.map((d) => {
              const [cur, target] = d.progress(w);
              const pct = Math.min(100, (cur / target) * 100);
              return (
                <div key={d.id} className={`decree ${recent ? "" : ""}`}>
                  <div className="row">
                    <span className="text-[13px] font-extrabold flex-1 truncate">{d.title}</span>
                    <span className="text-[11px] font-bold muted tabular-nums">{target > 1 ? `${Math.floor(cur)}/${target}` : ""}</span>
                    <span className="chip" style={{ padding: "1px 7px", fontSize: 11, color: "#6a4aa8" }}>+{d.essence}✦</span>
                  </div>
                  <div className="muted text-[11px] font-semibold leading-tight mt-0.5">{d.text}</div>
                  <div className="bar mt-1" style={{ height: 5 }}>
                    <i style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function LevelChip() {
  useGame((s) => s.uiTick);
  const w = getWorld();
  if (!w) return null;
  const cur = xpForLevel(w.level);
  const next = w.level >= 10 ? cur : xpForLevel(w.level + 1);
  const pct = w.level >= 10 ? 100 : Math.min(100, ((w.xp - cur) / Math.max(1, next - cur)) * 100);
  const recent = w.flags.levelUpAt && w.time - (w.flags.levelUpAt as number) < 4;
  return (
    <div className="chip" title={`${levelTitle(w.level)} · ${Math.floor(w.xp - cur)}/${next - cur} XP to next level`} style={{ gap: 8 }}>
      <span className={`level-ring ${recent ? "pulse" : ""}`} style={{ background: `conic-gradient(#e9a93c ${pct}%, rgba(90,58,32,0.2) ${pct}%)`, width: 26, height: 26, fontSize: 11 }}>
        <span style={{ width: 19, height: 19, borderRadius: "50%", background: "#f3e6cb", display: "grid", placeItems: "center" }}>{w.level}</span>
      </span>
      <span className="hidden md:inline">{levelTitle(w.level)}</span>
    </div>
  );
}

export function OmenCard() {
  useGame((s) => s.uiTick);
  const w = getWorld();
  const s = getSession();
  if (!w || !s || !w.omen) return null;
  const o = w.omen;
  const left = Math.max(0, Math.round(o.expiresAt - w.time));
  return (
    <div className="omen-card panel p-4 pop" style={{ pointerEvents: "auto", zIndex: 6 }}>
      <div className="row">
        <span className="label">Omen</span>
        <span className="flex-1" />
        <span className="muted text-[11px] font-bold tabular-nums">{left}s</span>
      </div>
      <div className="h1 text-[16px] mt-1">{o.title}</div>
      <div className="text-[13px] font-semibold mt-1 leading-snug">{o.text}</div>
      <div className="flex flex-col gap-2 mt-3">
        {o.options.map((opt, i) => (
          <button
            key={i}
            className={`btn btn-sm justify-start text-left ${i === 0 ? "btn-primary" : ""}`}
            disabled={!!opt.disabled}
            title={opt.disabled}
            onClick={() => {
              const r = s.dispatch({ type: "resolveOmen", option: i, player: s.me.id });
              if (!r.ok) useGame.getState().toast(r.reason, "bad");
              else audio.notify();
            }}
          >
            {opt.label}
            {opt.disabled && <span className="muted text-[11px] ml-1">({opt.disabled})</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AscendModal() {
  useGame((s) => s.uiTick);
  const [dismissed, setDismissed] = useState(false);
  const w = getWorld();
  if (!w || !w.flags.ascendedAt || dismissed || w.flags.ascendShown) return null;
  const f = w.factions[w.playerFaction];
  let pop = 0;
  for (const id in w.creatures) if (w.creatures[id].faction === w.playerFaction) pop++;
  const buildings = Object.values(w.buildings).filter((b) => b.faction === w.playerFaction && b.complete).length;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-[rgba(30,15,5,0.45)] backdrop-blur-sm">
      <div className="panel p-6 w-full max-w-md text-center pop">
        <div className="label">Ascension</div>
        <div className="title text-3xl mt-1">The Sky Monument stands</div>
        <div className="mt-3 text-sm font-semibold">
          On day {w.day}, with {pop} creatures, {buildings} buildings, {w.stats.thrown} throws and {w.stats.struck} lightning strikes, {w.meta.name} acknowledged its Little Tyrant. Level {w.level} {levelTitle(w.level)}, {Math.floor(f.essence)} essence in the vault.
        </div>
        <div className="muted text-[12px] font-semibold mt-2">The world keeps turning. Your rivals keep scheming. Nothing stops you now except boredom, and we both know that's not happening.</div>
        <button className="btn btn-primary w-full mt-5" onClick={() => { w.flags.ascendShown = 1; setDismissed(true); }}>
          Keep ruling
        </button>
      </div>
    </div>
  );
}
