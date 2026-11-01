"use client";
import dynamic from "next/dynamic";

const Game = dynamic(() => import("@/src/ui/Game"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="text-center">
        <div className="title text-5xl">Little Tyrants</div>
        <div className="muted mt-3">Small worlds. Big egos.</div>
      </div>
    </div>
  ),
});

export default function GameLoader() {
  return <Game />;
}
