"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWorld } from "./context";
import { heightAt } from "@/src/sim/terrain";
import type { WorldEffect } from "@/src/sim/types";
import { audio } from "@/src/audio/audio";
import { cameraCtl } from "./cameraCtl";
import { useGame } from "@/src/store/game";

const MAX_P = 900;
interface P {
  x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; r: number; g: number; b: number; grav: number; drag: number;
}
const dummy = new THREE.Object3D();
const col = new THREE.Color();

function groundAt(x: number, z: number): number {
  const w = getWorld();
  if (!w) return 0;
  for (const isl of w.islands) {
    const h = heightAt(isl, x, z);
    if (h > -0.5) return Math.max(h, isl.waterLevel);
  }
  return 0;
}

function makeSpriteTex(kind: "heart" | "anger" | "zzz" | "star" | "cloud"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 64, 64);
  g.lineWidth = 4;
  g.lineJoin = "round";
  if (kind === "heart") {
    g.fillStyle = "#ff5c8a";
    g.beginPath();
    g.moveTo(32, 56);
    g.bezierCurveTo(4, 36, 8, 8, 32, 20);
    g.bezierCurveTo(56, 8, 60, 36, 32, 56);
    g.fill();
  } else if (kind === "anger") {
    g.strokeStyle = "#ff3d3d";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(14, 20); g.lineTo(32, 20); g.lineTo(24, 34); g.lineTo(40, 34); g.lineTo(28, 52);
    g.stroke();
  } else if (kind === "zzz") {
    g.fillStyle = "#ffffff";
    g.font = "bold 34px sans-serif";
    g.fillText("z", 10, 48);
    g.font = "bold 22px sans-serif";
    g.fillText("z", 36, 30);
  } else if (kind === "star") {
    g.fillStyle = "#ffd166";
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 12 : 28;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  } else {
    const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface SpriteFx { x: number; y: number; z: number; kind: "heart" | "anger" | "zzz" | "star" | "cloud"; t: number; ttl: number; size: number }

export function Effects() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const particles = useMemo<P[]>(() => [], []);
  const seen = useRef(new Set<number>());
  const lightningLine = useRef<THREE.LineSegments>(null);
  const flash = useRef<THREE.PointLight>(null);
  const blessLight = useRef<THREE.PointLight>(null);
  const sprites = useRef<SpriteFx[]>([]);
  const spriteGroup = useRef<THREE.Group>(null);
  const scorches = useRef<{ x: number; y: number; z: number; t: number }[]>([]);
  const scorchMeshes = useRef<THREE.InstancedMesh>(null);
  const rain = useRef<THREE.LineSegments>(null);
  const lightningUntil = useRef(0);
  const blessUntil = useRef(0);
  const textures = useMemo(() => (typeof document === "undefined" ? null : { heart: makeSpriteTex("heart"), anger: makeSpriteTex("anger"), zzz: makeSpriteTex("zzz"), star: makeSpriteTex("star"), cloud: makeSpriteTex("cloud") }), []);
  const spritePool = useMemo(() => {
    const arr: THREE.Sprite[] = [];
    if (!textures) return arr;
    for (let i = 0; i < 40; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.heart, transparent: true, depthWrite: false }));
      s.visible = false;
      arr.push(s);
    }
    return arr;
  }, [textures]);
  useEffect(() => {
    const g = spriteGroup.current;
    if (!g) return;
    spritePool.forEach((s) => g.add(s));
    return () => {
      spritePool.forEach((s) => g.remove(s));
    };
  }, [spritePool]);
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(16 * 2 * 3), 3));
    return g;
  }, []);
  const rainGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(300 * 2 * 3), 3));
    return g;
  }, []);

  const emit = (n: number, x: number, y: number, z: number, opts: Partial<P> & { spread?: number; up?: number; color?: string }) => {
    const c = col.set(opts.color ?? "#ffffff");
    for (let i = 0; i < n; i++) {
      if (particles.length >= MAX_P) particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.spread ?? 1) * (0.3 + Math.random());
      particles.push({
        x: x + Math.cos(a) * sp * 0.3, y, z: z + Math.sin(a) * sp * 0.3,
        vx: Math.cos(a) * sp, vy: (opts.up ?? 2) * (0.5 + Math.random()), vz: Math.sin(a) * sp,
        life: 0, max: opts.max ?? 0.8 + Math.random() * 0.6, size: opts.size ?? 0.12, r: c.r, g: c.g, b: c.b, grav: opts.grav ?? 6, drag: opts.drag ?? 0.98,
      });
    }
  };

  const trigger = (e: WorldEffect) => {
    const y = e.y !== undefined ? groundAt(e.x, e.z) + e.y : groundAt(e.x, e.z);
    const quality = useGame.getState().settings.quality;
    const mul = quality === "low" ? 0.4 : 1;
    switch (e.kind) {
      case "lightning": {
        lightningUntil.current = performance.now() + 320;
        const pos = lineGeo.attributes.position as THREE.BufferAttribute;
        let px = e.x; let py = y + 28; let pz = e.z;
        for (let i = 0; i < 16; i++) {
          const nx = i === 15 ? e.x : e.x + (Math.random() - 0.5) * 2.2 * (1 - i / 16) + (px - e.x) * 0.5;
          const ny = y + 28 * (1 - (i + 1) / 16);
          const nz = i === 15 ? e.z : e.z + (Math.random() - 0.5) * 2.2 * (1 - i / 16) + (pz - e.z) * 0.5;
          pos.setXYZ(i * 2, px, py, pz);
          pos.setXYZ(i * 2 + 1, nx, ny, nz);
          px = nx; py = ny; pz = nz;
        }
        pos.needsUpdate = true;
        if (flash.current) flash.current.position.set(e.x, y + 4, e.z);
        emit(40 * mul, e.x, y + 0.2, e.z, { spread: 4, up: 5, color: "#fff2a8", size: 0.1, grav: 8 });
        emit(20 * mul, e.x, y + 0.2, e.z, { spread: 2, up: 3, color: "#4a4a55", size: 0.25, grav: 1, drag: 0.95, max: 1.6 });
        scorches.current.push({ x: e.x, y: y + 0.03, z: e.z, t: performance.now() });
        if (scorches.current.length > 30) scorches.current.shift();
        audio.lightning();
        cameraCtl.shake = Math.max(cameraCtl.shake, 0.6);
        break;
      }
      case "bless":
        blessUntil.current = performance.now() + 1500;
        if (blessLight.current) blessLight.current.position.set(e.x, y + 2, e.z);
        emit(60 * mul, e.x, y + 0.1, e.z, { spread: 3.2, up: 2.5, color: "#ffe08a", size: 0.1, grav: -1.5, drag: 0.97, max: 1.8 });
        emit(12 * mul, e.x, y + 0.5, e.z, { spread: 1, up: 3, color: "#ffffff", size: 0.16, grav: -0.5, max: 1.4 });
        audio.bless();
        break;
      case "splash":
        emit(50 * mul, e.x, y, e.z, { spread: 2.2 * (e.size ?? 1), up: 5 * (e.size ?? 1), color: "#bfe6ff", size: 0.11, grav: 9 });
        emit(14 * mul, e.x, y, e.z, { spread: 0.6, up: 1.2, color: "#ffffff", size: 0.3, grav: 0, drag: 0.9, max: 0.7 });
        break;
      case "dust":
        emit(14 * mul * (e.size ?? 1), e.x, y + 0.1, e.z, { spread: 1.2 * (e.size ?? 1), up: 1.2, color: "#c8b48a", size: 0.18, grav: 0.5, drag: 0.92, max: 0.7 });
        break;
      case "crash":
        emit(30 * mul, e.x, y + 0.2, e.z, { spread: 3 * (e.size ?? 1), up: 3.5, color: "#a8865a", size: 0.2, grav: 4, drag: 0.94, max: 1.1 });
        emit(16 * mul, e.x, y + 0.4, e.z, { spread: 2, up: 4, color: "#6ea444", size: 0.16, grav: 3, max: 1.3 });
        audio.thud();
        cameraCtl.shake = Math.max(cameraCtl.shake, 0.35);
        break;
      case "text":
        break;
      case "levelup":
        pushSprite(e.x, y + 1.3, e.z, "star", 1.6, 0.7);
        emit(14 * mul, e.x, y + 0.8, e.z, { spread: 1, up: 2.5, color: "#ffd166", size: 0.1, grav: -1 });
        audio.levelup();
        break;
      case "heart":
        pushSprite(e.x, y + 1.1, e.z, "heart", 1.3, 0.55);
        break;
      case "anger":
        pushSprite(e.x, y + 1.2, e.z, "anger", 1.0, 0.6);
        break;
      case "zzz":
        pushSprite(e.x + 0.3, y + 0.8, e.z, "zzz", 1.6, 0.6);
        break;
      case "sparkle":
        emit(24 * mul * (e.size ?? 1), e.x, y + 0.3, e.z, { spread: 1.4 * (e.size ?? 1), up: 2.5, color: e.color ?? "#ffffff", size: 0.1, grav: -0.8, drag: 0.96, max: 1.2 });
        break;
      case "fall":
        pushSprite(e.x, y + 1.0, e.z, "cloud", 2, 3.5);
        emit(16 * mul, e.x, y + 0.5, e.z, { spread: 1.5, up: 0.8, color: "#ffffff", size: 0.35, grav: -0.2, drag: 0.93, max: 1.6 });
        break;
      case "storm":
        audio.setStorm(true);
        break;
      case "scorch":
        break;
    }
  };

  const pushSprite = (x: number, y: number, z: number, kind: SpriteFx["kind"], ttl: number, size: number) => {
    sprites.current.push({ x, y, z, kind, t: performance.now(), ttl: ttl * 1000, size });
    if (sprites.current.length > 40) sprites.current.shift();
  };

  useFrame((state, dt) => {
    const w = getWorld();
    const m = mesh.current;
    if (!w || !m) return;
    // detect new effects
    for (const e of w.effects) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      trigger(e);
    }
    if (seen.current.size > 2000) {
      const ids = new Set(w.effects.map((e) => e.id));
      seen.current = new Set(Array.from(seen.current).filter((id) => ids.has(id)));
    }
    // particles
    let i = 0;
    for (let k = particles.length - 1; k >= 0; k--) {
      const p = particles[k];
      p.life += dt;
      if (p.life >= p.max) {
        particles.splice(k, 1);
        continue;
      }
      p.vy -= p.grav * dt;
      p.vx *= p.drag;
      p.vz *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const f = 1 - p.life / p.max;
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.setScalar(p.size * (0.5 + f));
      dummy.rotation.set(p.life * 3, p.life * 2, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, col.setRGB(p.r, p.g, p.b));
      i++;
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // lightning + flash
    const now = performance.now();
    if (lightningLine.current) lightningLine.current.visible = now < lightningUntil.current && Math.random() > 0.2;
    if (flash.current) flash.current.intensity = now < lightningUntil.current ? 60 * (0.5 + Math.random() * 0.5) : 0;
    if (blessLight.current) blessLight.current.intensity = now < blessUntil.current ? 6 * ((blessUntil.current - now) / 1500) : 0;
    // sprites
    const sp = sprites.current;
    for (let k = 0; k < spritePool.length; k++) {
      const s = spritePool[k];
      const fx = sp[k];
      if (!fx || !textures) {
        s.visible = false;
        continue;
      }
      const age = (now - fx.t) / fx.ttl;
      if (age >= 1) {
        sp.splice(k, 1);
        s.visible = false;
        continue;
      }
      s.visible = true;
      s.material.map = textures[fx.kind];
      s.material.opacity = age < 0.15 ? age / 0.15 : 1 - Math.max(0, age - 0.6) / 0.4;
      s.position.set(fx.x + (fx.kind === "zzz" ? Math.sin(age * 6) * 0.2 : 0), fx.y + age * (fx.kind === "cloud" ? 0.2 : 0.9), fx.z);
      const sc = fx.size * (fx.kind === "cloud" ? 1 + age * 1.2 : 0.8 + age * 0.3);
      s.scale.set(sc, sc, 1);
    }
    // scorch decals
    const sm = scorchMeshes.current;
    if (sm) {
      let j = 0;
      for (const s of scorches.current) {
        const age = (now - s.t) / 40000;
        if (age > 1) continue;
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(-Math.PI / 2, 0, s.t % 6);
        dummy.scale.setScalar(1.6 * (1 - age * 0.5));
        dummy.updateMatrix();
        sm.setMatrixAt(j, dummy.matrix);
        j++;
      }
      sm.count = j;
      sm.instanceMatrix.needsUpdate = true;
    }
    // rain during storms
    if (rain.current) {
      const storm = w.weather.kind === "storm";
      rain.current.visible = storm;
      if (storm) {
        const pos = rainGeo.attributes.position as THREE.BufferAttribute;
        const cx = (w.flags.stormX as number) ?? 32;
        const cz = (w.flags.stormZ as number) ?? 32;
        const t = state.clock.elapsedTime;
        for (let k = 0; k < 300; k++) {
          const a = k * 2.399;
          const r = 2 + (k % 50) * 0.3;
          const x = cx + Math.cos(a) * r;
          const z = cz + Math.sin(a) * r;
          const y = 14 - ((t * 18 + k * 0.37) % 14);
          pos.setXYZ(k * 2, x, y + groundAt(x, z), z);
          pos.setXYZ(k * 2 + 1, x + 0.05, y + 0.6 + groundAt(x, z), z);
        }
        pos.needsUpdate = true;
      } else audio.setStorm(false);
    }
  });

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, MAX_P]} frustumCulled={false}>
        <sphereGeometry args={[0.5, 5, 4]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <lineSegments ref={lightningLine} geometry={lineGeo} visible={false} frustumCulled={false}>
        <lineBasicMaterial color="#ffffff" linewidth={2} toneMapped={false} />
      </lineSegments>
      <pointLight ref={flash} color="#dfe8ff" intensity={0} distance={40} decay={1.5} />
      <pointLight ref={blessLight} color="#ffe08a" intensity={0} distance={14} decay={2} />
      <group ref={spriteGroup} />
      <instancedMesh ref={scorchMeshes} args={[undefined, undefined, 30]} frustumCulled={false}>
        <circleGeometry args={[1, 14]} />
        <meshBasicMaterial color="#1a1410" transparent opacity={0.55} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </instancedMesh>
      <lineSegments ref={rain} geometry={rainGeo} visible={false} frustumCulled={false}>
        <lineBasicMaterial color="#cfe6ff" transparent opacity={0.5} />
      </lineSegments>
    </group>
  );
}
