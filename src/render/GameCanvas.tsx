"use client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useRef } from "react";
import { Sky, Clouds, IntroClouds, CloudSea } from "./Sky";
import { Post } from "./Post";
import { Terrain } from "./Terrain";
import { Vegetation } from "./Vegetation";
import { Creatures } from "./Creatures";
import { Buildings, Items, Discoveries } from "./Buildings";
import { Effects } from "./Effects";
import { Interaction } from "./Interaction";
import { CameraRig } from "./CameraRig";
import { getSession } from "./context";
import { useGame } from "@/src/store/game";
import { labelLayer } from "./labels";

/** Advances the session every frame and bumps the low-frequency UI tick. */
function Ticker() {
  const acc = useRef(0);
  const frames = useRef(0);
  const fpsT = useRef(0);
  useFrame((_, dt) => {
    const s = getSession();
    const d = Math.min(dt, 0.25);
    if (s) s.update(d);
    acc.current += d;
    frames.current++;
    fpsT.current += d;
    if (acc.current >= 0.25) {
      acc.current = 0;
      useGame.getState().bump();
    }
    if (fpsT.current >= 1) {
      useGame.getState().setFps(Math.round(frames.current / fpsT.current));
      frames.current = 0;
      fpsT.current = 0;
    }
  });
  return null;
}

function Setup() {
  const { gl, scene } = useThree();
  const quality = useGame((s) => s.settings.quality);
  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 0.92;
    gl.shadowMap.enabled = quality !== "low";
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    scene.background = null;
  }, [gl, scene, quality]);
  return null;
}

export function GameCanvas() {
  const quality = useGame((s) => s.settings.quality);
  return (
    <div className="absolute inset-0">
      <Canvas
        shadows={quality !== "low"}
        dpr={quality === "high" ? [1, 1.75] : quality === "medium" ? [1, 1.25] : 1}
        camera={{ fov: 42, near: 0.5, far: 1200, position: [60, 60, 60] }}
        gl={{ antialias: quality !== "low", powerPreference: "high-performance", stencil: false }}
        frameloop="always"
        style={{ touchAction: "none" }}
      >
        <Setup />
        <Ticker />
        <Sky />
        <Clouds />
        <CloudSea />
        <IntroClouds />
        <Terrain />
        <Vegetation />
        <Creatures />
        <Buildings />
        <Items />
        <Discoveries />
        <Effects />
        <Interaction />
        <CameraRig />
        <Post />
      </Canvas>
      <div ref={(el) => { labelLayer.container = el; }} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
