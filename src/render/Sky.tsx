"use client";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getWorld } from "./context";
import { dayFraction, sunHeightFor } from "@/src/sim/creature";
import { useGame } from "@/src/store/game";

const skyVert = `varying vec3 vWorld; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const skyFrag = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform float night; varying vec3 vWorld;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
void main(){
  vec3 d = normalize(vWorld - cameraPosition);
  float h = d.y;
  vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, bottom, pow(-h, 0.6));
  // stars at night
  if (night > 0.05 && h > 0.05) {
    vec3 cell = floor(d * 180.0);
    float s = hash(cell);
    float star = step(0.9965, s) * night * smoothstep(0.05, 0.4, h);
    c += vec3(star);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

/**
 * Golden-hour palette. Daytime is a warm, slightly hazy afternoon (never a flat blue noon),
 * sunset leans peach and rose, night is a deep warm indigo with a lifted horizon.
 */
function dayColors(f: number) {
  const sunHeight = sunHeightFor(f); // >0 during day
  const day = THREE.MathUtils.clamp(sunHeight * 2.2, 0, 1);
  const dusk = THREE.MathUtils.clamp(1 - Math.abs(sunHeight) * 3.5, 0, 1);
  const top = new THREE.Color("#1c2250").lerp(new THREE.Color("#5f9bd0"), day).lerp(new THREE.Color("#8a5f9e"), dusk * 0.55);
  const horizon = new THREE.Color("#3a3f70").lerp(new THREE.Color("#e9cfad"), day).lerp(new THREE.Color("#f3a76e"), dusk * 0.85);
  const bottom = new THREE.Color("#141833").lerp(new THREE.Color("#d9bb98"), day).lerp(new THREE.Color("#c98a7a"), dusk * 0.5);
  return { top, horizon, bottom, day, dusk, sunHeight };
}

export function Sky() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const { scene } = useThree();
  const quality = useGame((s) => s.settings.quality);
  const uniforms = useMemo(() => ({ top: { value: new THREE.Color("#4f9ee8") }, horizon: { value: new THREE.Color("#cfe6f7") }, bottom: { value: new THREE.Color("#8fb8d8") }, night: { value: 0 } }), []);
  const fog = useMemo(() => new THREE.Fog("#e6ccab", 110, 420), []);
  useMemo(() => {
    scene.fog = fog;
  }, [scene, fog]);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const w = getWorld();
    const f = w ? dayFraction(w) : 0.3;
    const c = dayColors(f);
    uniforms.top.value.copy(c.top);
    uniforms.horizon.value.copy(c.horizon);
    uniforms.bottom.value.copy(c.bottom);
    uniforms.night.value = 1 - c.day;
    fog.color.copy(c.horizon);
    const storm = w?.weather.kind === "storm";
    if (storm) {
      fog.color.lerp(new THREE.Color("#4a5566"), 0.6);
      uniforms.top.value.lerp(new THREE.Color("#2a3140"), 0.7);
      uniforms.horizon.value.lerp(new THREE.Color("#5a6472"), 0.7);
    }
    if (sun.current) {
      const ang = (((f + 0.1) % 1) / 0.82) * Math.PI;
      const cx = 32;
      const cz = 32;
      tmp.set(Math.cos(ang) * 80 + cx, Math.max(14, c.sunHeight * 90), Math.sin(ang * 0.6) * 50 + cz + 30);
      sun.current.position.copy(tmp);
      sun.current.target.position.set(cx, 0, cz);
      sun.current.target.updateMatrixWorld();
      const base = 0.65 + c.day * 2.0;
      sun.current.intensity = storm ? base * 0.45 : base;
      sun.current.color.set("#9fb0ff").lerp(new THREE.Color("#ffe9c8"), c.day).lerp(new THREE.Color("#ffb27c"), c.dusk * 0.75);
    }
    if (hemi.current) {
      hemi.current.intensity = 0.45 + c.day * 0.35;
      hemi.current.color.set("#5a6aa8").lerp(new THREE.Color("#dfe9f6"), c.day);
      hemi.current.groundColor.set("#5a4634").lerp(new THREE.Color("#7a6248"), c.day);
    }
    if (amb.current) amb.current.intensity = 0.12 + (1 - c.day) * 0.35;
  });

  const shadows = quality !== "low";
  const size = quality === "high" ? 2048 : 1024;
  return (
    <>
      <mesh frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[900, 32, 16]} />
        <shaderMaterial ref={mat} vertexShader={skyVert} fragmentShader={skyFrag} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} fog={false} />
      </mesh>
      <hemisphereLight ref={hemi} args={["#ffe9c9", "#8a6a45", 0.9]} />
      <ambientLight ref={amb} intensity={0.15} />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        intensity={2}
        position={[60, 80, 40]}
        shadow-mapSize-width={size}
        shadow-mapSize-height={size}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={quality === "high" ? 6 : 3}
      />
    </>
  );
}

/** Dense cloud bank the camera descends through during the intro; fades away afterwards. */
export function IntroClouds() {
  const intro = useGame((s) => s.intro);
  const group = useRef<THREE.Group>(null);
  const fade = useRef(1);
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.7)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const puffs = useMemo(() => {
    const arr: { x: number; y: number; z: number; s: number }[] = [];
    let seed = 99;
    const rnd = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
    for (let i = 0; i < 70; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = rnd() * 110;
      arr.push({ x: 32 + Math.cos(ang) * r, y: 26 + rnd() * 60, z: 32 + Math.sin(ang) * r, s: 30 + rnd() * 40 });
    }
    return arr;
  }, []);
  const active = intro >= 0;
  useFrame((state, dt) => {
    if (!group.current) return;
    const target = active && intro < 1 ? 1 : 0;
    fade.current += (target - fade.current) * Math.min(1, dt * (target ? 2 : 0.8));
    group.current.visible = fade.current > 0.02;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((c, i) => {
      const sp = c as THREE.Sprite;
      sp.material.opacity = 0.85 * fade.current;
      sp.position.x = puffs[i].x + Math.sin(t * 0.08 + i) * 3;
    });
  });
  if (!tex) return null;
  return (
    <group ref={group} visible={false}>
      {puffs.map((p, i) => (
        <sprite key={i} position={[p.x, p.y, p.z]} scale={[p.s, p.s * 0.5, 1]}>
          <spriteMaterial map={tex} transparent opacity={0.85} depthWrite={false} fog={false} />
        </sprite>
      ))}
    </group>
  );
}

const seaVert = `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const seaFrag = `
uniform float time; uniform vec3 colA; uniform vec3 colB; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vW;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0; float a = 0.5; for(int i=0;i<5;i++){ v += a*noise(p); p = p*2.03 + 17.0; a *= 0.5; } return v; }
void main(){
  vec2 p = vW.xz * 0.028 + vec2(time*0.012, time*0.007);
  float n = fbm(p);
  float n2 = fbm(p*2.3 + 5.0);
  float h = n*0.8 + n2*0.3;
  float alpha = smoothstep(0.42, 0.78, h);
  // fake lighting: brighter on the sun-facing slopes of the noise field
  float dx = fbm(p + vec2(0.03, 0.0)) - n;
  float shade = 0.82 + 0.5 * clamp(dx * 18.0 * sunDir.x, -0.3, 0.3) + 0.18 * (h - 0.5);
  vec3 c = mix(colB, colA, clamp(shade, 0.0, 1.3));
  float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x) * smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.92, vUv.y);
  gl_FragColor = vec4(c, alpha * 0.96 * edge);
}`;

/** A sea of clouds beneath the archipelago: one big animated noise plane plus a few drifting puffs. */
export function CloudSea() {
  const uniforms = useMemo(() => ({ time: { value: 0 }, colA: { value: new THREE.Color("#fff3e2") }, colB: { value: new THREE.Color("#e2c5ad") }, sunDir: { value: new THREE.Vector3(1, 0, 0) } }), []);
  useFrame((state) => {
    uniforms.time.value = state.clock.elapsedTime;
    const w = getWorld();
    const f = w ? dayFraction(w) : 0.3;
    const c = dayColors(f);
    uniforms.colA.value.set("#2a3056").lerp(new THREE.Color("#ead8c2"), c.day).lerp(new THREE.Color("#ffc9a0"), c.dusk * 0.6);
    uniforms.colB.value.set("#171b3a").lerp(new THREE.Color("#ad8e70"), c.day).lerp(new THREE.Color("#d98c78"), c.dusk * 0.5);
  });
  return (
    <mesh position={[32, -22, 32]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-5} frustumCulled={false}>
      <planeGeometry args={[900, 900, 1, 1]} />
      <shaderMaterial vertexShader={seaVert} fragmentShader={seaFrag} uniforms={uniforms} transparent depthWrite={false} />
    </mesh>
  );
}

/** Soft drifting clouds around and below the islands. */
export function Clouds({ count = 26 }: { count?: number }) {
  const tex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0.95)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const clouds = useMemo(() => {
    const arr: { x: number; y: number; z: number; s: number; v: number; o: number }[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647), seed / 2147483647);
    for (let i = 0; i < count; i++) {
      const ang = rnd() * Math.PI * 2;
      const r = 40 + rnd() * 120;
      const below = rnd() < 0.65;
      arr.push({ x: 32 + Math.cos(ang) * r, y: below ? -16 - rnd() * 14 : 30 + rnd() * 30, z: 32 + Math.sin(ang) * r, s: 22 + rnd() * 34, v: 0.3 + rnd() * 0.6, o: below ? 0.75 + rnd() * 0.2 : 0.35 + rnd() * 0.3 });
    }
    return arr;
  }, [count]);
  const group = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    group.current.children.forEach((s, i) => {
      const c = clouds[i];
      s.position.x = c.x + Math.sin(t * 0.05 * c.v + i) * 8;
      s.position.z = c.z + Math.cos(t * 0.04 * c.v + i * 2) * 6;
      s.position.y = c.y + Math.sin(t * 0.1 + i) * 0.6;
    });
    void dt;
  });
  if (!tex) return null;
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <sprite key={i} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.45, 1]}>
          <spriteMaterial map={tex} transparent opacity={c.o} depthWrite={false} fog color="#f5e4cf" />
        </sprite>
      ))}
    </group>
  );
}
