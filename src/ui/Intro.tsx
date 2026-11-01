"use client";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/src/store/game";
import { getSession, getWorld } from "@/src/render/context";
import { cameraCtl } from "@/src/render/cameraCtl";
import { CHALLENGES, finishChallenge } from "@/src/sim/challenges";
import { Icons } from "./icons";
import { audio } from "@/src/audio/audio";
import { bestScore, recordScore } from "./Menu";

/**
 * The first 60 seconds. Every beat is gated on the player actually doing the thing:
 *  0 reveal · 1 alive · 2 pick up · 3 throw · 4 make a friend · 5 shine the Sun · 6 build a farm · 7 payoff · 8 the wider world
 */
const LINES: Record<number, { big: string; small?: string }> = {
  0: { big: "An entire world. Yours to ruin." },
  1: { big: "Look. They're alive, and they have opinions." },
  2: { big: "Pick someone up.", small: "Drag a creature with your finger or mouse" },
  3: { big: "Now throw them. Into the lake if you can!", small: "Flick and let go" },
  4: { big: "Make a friend.", small: "Tap FRIEND, then tap the ground" },
  5: { big: "Shine the Sun on them.", small: "Tap SUN, then tap the group" },
  6: { big: "Build them a Farm.", small: "Tap BUILD, pick the Farm, tap the ground" },
  7: { big: "They'll build it themselves. Watch them carry.", small: "Everything they do, they remember" },
  8: { big: "Your neighbours are getting stronger." },
};

export function IntroOverlay({ onFinish }: { onFinish: () => void }) {
  const stage = useGame((s) => s.intro);
  const setIntro = useGame((s) => s.setIntro);
  const setPointer = useGame((s) => s.setPointerTarget);
  useGame((s) => s.uiTick);
  const timer = useRef<number | null>(null);
  const [visibleLine, setVisibleLine] = useState(true);
  const baseline = useRef<{ spawns: number; blessed: number; buildings: number; thrown: number } | null>(null);

  // stage timers and pointer targets
  useEffect(() => {
    if (stage < 0) {
      setPointer(null);
      return;
    }
    setVisibleLine(false);
    const t = window.setTimeout(() => setVisibleLine(true), 50);
    if (timer.current) window.clearTimeout(timer.current);
    const w = getWorld();
    if (w && !baseline.current) baseline.current = { spawns: (w.flags.playerSpawns as number) ?? 0, blessed: w.stats.blessed, buildings: Object.values(w.buildings).filter((b) => b.faction === w.playerFaction).length, thrown: w.stats.thrown };
    if (stage === 0) {
      timer.current = window.setTimeout(() => {
        if (w) {
          const c = Object.values(w.creatures).find((x) => x.faction === w.playerFaction && x.species === "goblin") ?? Object.values(w.creatures).find((x) => x.faction === w.playerFaction);
          if (c) cameraCtl.focus(c.x, c.z, 24);
        }
        setIntro(1);
      }, 6500);
    } else if (stage === 1) {
      timer.current = window.setTimeout(() => setIntro(2), 3600);
    } else if (stage === 2) {
      if (w) {
        const c = Object.values(w.creatures).find((x) => x.faction === w.playerFaction && x.species === "goblin" && x.state !== "held") ?? Object.values(w.creatures).find((x) => x.faction === w.playerFaction);
        if (c) {
          setPointer({ creatureId: c.id });
          w.flags.tutorialStar = c.id;
          cameraCtl.focus(c.x, c.z, 17);
        }
      }
    } else if (stage === 3) {
      setPointer(null);
      if (w) delete w.flags.tutorialStar;
    } else if (stage === 4) {
      useGame.getState().setPower("spawn");
      useGame.getState().setSpawnSpecies("goblin");
      if (w) {
        const cf = Object.values(w.buildings).find((b) => b.faction === w.playerFaction && b.type === "campfire");
        if (cf) setPointer({ x: cf.x + 2.5, z: cf.z + 1.5 });
      }
    } else if (stage === 5) {
      useGame.getState().setPower("bless");
      if (w) {
        const cf = Object.values(w.buildings).find((b) => b.faction === w.playerFaction && b.type === "campfire");
        if (cf) setPointer({ x: cf.x, z: cf.z });
      }
    } else if (stage === 6) {
      useGame.getState().setPower("grab");
      useGame.getState().setPanel("build");
      setPointer(null);
    } else if (stage === 7) {
      useGame.getState().setPanel("none");
      setPointer(null);
      timer.current = window.setTimeout(() => {
        cameraCtl.zoom(1.6);
        setIntro(8);
      }, 3200);
    }
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // action gates (checked on the UI tick)
  useEffect(() => {
    const w = getWorld();
    if (!w || stage < 0 || !baseline.current) return;
    const b = baseline.current;
    if (stage === 3 && w.stats.thrown > b.thrown) {
      // wait for the flight to end, then celebrate
      const flying = Object.values(w.creatures).some((c) => c.faction === w.playerFaction && (c.state === "thrown" || c.state === "swim"));
      if (!flying) {
        audio.giggle();
        setIntro(4);
      }
    } else if (stage === 4 && ((w.flags.playerSpawns as number) ?? 0) > b.spawns) {
      setIntro(5);
    } else if (stage === 5 && w.stats.blessed > b.blessed) {
      setIntro(6);
    } else if (stage === 6 && Object.values(w.buildings).filter((x) => x.faction === w.playerFaction).length > b.buildings) {
      setIntro(7);
    }
  });

  if (stage < 0) return null;
  const skip = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setPointer(null);
    const w0 = getWorld();
    if (w0) delete w0.flags.tutorialStar;
    useGame.getState().setPanel("none");
    useGame.getState().setPower("grab");
    onFinish();
  };
  const line = LINES[stage] ?? LINES[8];
  const top = stage >= 2 && stage <= 7;
  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {stage < 8 && (
        <div className="absolute top-4 right-4 pointer-events-auto">
          <button className="btn btn-sm" onClick={skip}>
            Skip intro
          </button>
        </div>
      )}
      <div className={`absolute left-1/2 -translate-x-1/2 ${top ? "top-[14%]" : "bottom-[18%]"} text-center px-6 transition-opacity duration-700 ${visibleLine ? "opacity-100" : "opacity-0"}`}>
        <div className="text-2xl sm:text-4xl font-black text-[#fff4dc] drop-shadow-[0_4px_16px_rgba(0,0,0,0.7)]" style={{ letterSpacing: "-0.01em", textShadow: "0 2px 0 rgba(60,30,5,0.6), 0 6px 18px rgba(0,0,0,0.6)" }}>
          {line.big}
        </div>
        {line.small && <div className="mt-2 text-sm font-bold text-[#fff1d0] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">{line.small}</div>}
      </div>
      {stage === 8 && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-[16%] flex flex-col sm:flex-row gap-3 pointer-events-auto pop">
          <button className="btn btn-primary" onClick={() => { skip(); useGame.getState().setPanel("build"); }}>
            <Icons.mallet style={{ width: 18, height: 18 }} /> Keep building
          </button>
          <button className="btn" onClick={() => { skip(); const w = getWorld(); if (w && w.islands[1]) useGame.getState().focusCamera(w.islands[1].center.x, w.islands[1].center.z, 48); useGame.getState().toast("Tap a rival island to size them up. Their Book tab lets you trade or raid.", "info"); }}>
            <Icons.eye style={{ width: 18, height: 18 }} /> Meet the neighbours
          </button>
          <button className="btn" onClick={() => { skip(); useGame.getState().setBookTab("players"); }}>
            <Icons.users style={{ width: 18, height: 18 }} /> Play with friends
          </button>
        </div>
      )}
    </div>
  );
}

export function BriefingModal() {
  const briefing = useGame((s) => s.briefing);
  const set = useGame((s) => s.setBriefing);
  if (!briefing) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-[rgba(30,15,5,0.4)] backdrop-blur-sm" onClick={() => set(null)}>
      <div className="panel p-6 w-full max-w-md pop" onClick={(e) => e.stopPropagation()}>
        <div className="label">While you were away</div>
        <div className="h1 text-xl mt-1">{briefing.lines[0]}</div>
        <ul className="mt-3 flex flex-col gap-2 text-sm font-semibold">
          {briefing.lines.slice(1).map((l, i) => (
            <li key={i} className="row">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" /> {l}
            </li>
          ))}
          {briefing.events.map((e) => (
            <li key={e.id} className="row muted">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-2)]" /> {e.text}
            </li>
          ))}
        </ul>
        <button className="btn btn-primary w-full mt-5" onClick={() => set(null)}>
          Back to ruling
        </button>
      </div>
    </div>
  );
}

export function ChallengeHud({ onLeave, onRetry }: { onLeave: () => void; onRetry: (id: string) => void }) {
  useGame((s) => s.uiTick);
  const w = getWorld();
  const [showRules, setShowRules] = useState(true);
  if (!w || !w.challenge) return null;
  const ch = w.challenge;
  const def = CHALLENGES.find((d) => d.id === ch.id);
  if (!def) return null;
  const elapsed = w.time - ch.startedAt;
  const left = ch.duration > 0 ? Math.max(0, ch.duration - elapsed) : null;
  if (ch.finished) {
    const isBest = !w.flags.scoreRecorded ? (w.flags.scoreRecorded = 1, recordScore(ch.id, ch.score)) : w.flags.wasBest;
    if (isBest) w.flags.wasBest = 1;
    const best = bestScore(ch.id);
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-[rgba(30,15,5,0.45)] backdrop-blur-sm">
        <div className="panel p-6 w-full max-w-md text-center pop">
          <div className="label">{ch.result === "won" ? "Victory" : ch.result === "lost" ? "Defeat" : "Time's up"}</div>
          <div className="title text-3xl mt-1">{def.title}</div>
          <div className="mt-3 text-lg font-bold">
            {def.scoreLabel}: {ch.score} {isBest ? <span className="chip" style={{ color: "#7a4a10", fontSize: 12 }}>New best!</span> : best !== null ? <span className="muted text-sm">(best {best})</span> : null}
          </div>
          <div className="muted mt-1 text-sm font-semibold">{ch.summary}</div>
          <div className="flex gap-2 mt-5">
            <button className="btn flex-1" onClick={onLeave}>
              Menu
            </button>
            <button className="btn btn-primary flex-1" onClick={() => onRetry(ch.id)}>
              Play again
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute top-[64px] left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-2">
      <div className="panel row px-4 py-2 pointer-events-auto">
        <Icons.trophy style={{ width: 18, height: 18, color: "#7a4a10" }} />
        <span className="font-bold">{def.title}</span>
        <span className="muted">·</span>
        <span className="font-bold">
          {def.scoreLabel} {ch.score}
        </span>
        {left !== null && (
          <>
            <span className="muted">·</span>
            <span className={`font-black tabular-nums ${left < 30 ? "text-[var(--bad)]" : ""}`}>
              {Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, "0")}
            </span>
          </>
        )}
        <button className="btn btn-sm btn-ghost" onClick={() => setShowRules((v) => !v)}>
          {showRules ? "Hide rules" : "Rules"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => finishChallenge(w, "ended")}>
          End
        </button>
      </div>
      {showRules && (
        <div className="panel px-4 py-3 text-[13px] font-bold max-w-md pointer-events-auto fade-up">
          {def.rules.map((r, i) => (
            <div key={i} className="row">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shrink-0" /> {r}
            </div>
          ))}
        </div>
      )}
      <div className="hidden">{getSession()?.role}</div>
    </div>
  );
}
