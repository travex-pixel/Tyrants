"use client";
import dynamic from "next/dynamic";

const Game = dynamic(() => import("@/src/ui/Game"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center boot-screen">
      <div className="text-center boot-card">
        <div className="title-dark text-5xl">Little Tyrants</div>
        <div className="mt-3 text-[#f6e8cf] font-bold">Small worlds. Big egos.</div>
        <div className="mt-4 text-[13px] font-bold text-[#e3c27e] pulse">Raising an island from the clouds…</div>
      </div>
    </div>
  ),
});

export default function GameLoader() {
  return <Game />;
}
