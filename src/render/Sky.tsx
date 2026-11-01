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

function dayColors(f: number) {
  // f: 0..1 day fraction. Dawn ~0.0, noon ~0.35, dusk ~0.72, night ~0.85
  const sunHeight = sunHeightFor(f); // >0 during day
  const day = THREE.MathUtils.clamp(sunHeight * 2.2, 0, 1);
  const dusk = THREE.MathUtils.clamp(1 - Math.abs(sunHeight) * 3.5, 0, 1);
  const top = new THREE.Color("#141d4a").lerp(new THREE.Color("#4f9ee8"), day).lerp(new THREE.Color("#6a4ea0"), dusk * 0.5);
  const horizon = new THREE.Color("#2a3566").lerp(new THREE.Color("#cfe6f7"), day).lerp(new THREE.Color("#f0a36b"), dusk * 0.8);
  const bottom = new THREE.Color("#0a0f26").lerp(new THREE.Color("#8fb8d8"), day).lerp(new THREE.Color("#8a5a6a"), dusk * 0.4);
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
  const fog = useMemo(() => new THREE.Fog("#cfe6f7", 60, 260), []);
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
      const base = 0.7 + c.day * 1.8;
      sun.current.intensity = storm ? base * 0.45 : base;
      sun.current.color.set("#8ea7ff").lerp(new THREE.Color("#fff4dc"), c.day).lerp(new THREE.Color("#ffb074"), c.dusk * 0.7);
    }
    if (hemi.current) {
      hemi.current.intensity = 0.6 + c.day * 0.6;
      hemi.current.color.copy(c.top);
      hemi.current.groundColor.set("#5a4a3a");
    }
    if (amb.current) amb.current.intensity = 0.15 + (1 - c.day) * 0.4;
  });

  const shadows = quality !== "low";
  const size = quality === "high" ? 2048 : 1024;
  return (
    <>
      <mesh frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[900, 32, 16]} />
        <shaderMaterial ref={mat} vertexShader={skyVert} fragmentShader={skyFrag} uniforms={uniforms} side={THREE.BackSide} depthWrite={false} fog={false} />
      </mesh>
      <hemisphereLight ref={hemi} args={["#bfe3ff", "#5a4a3a", 0.9]} />
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
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
    </>
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
      arr.push({ x: 32 + Math.cos(ang) * r, y: below ? -14 - rnd() * 30 : 28 + rnd() * 30, z: 32 + Math.sin(ang) * r, s: 18 + rnd() * 30, v: 0.3 + rnd() * 0.6, o: 0.45 + rnd() * 0.4 });
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
          <spriteMaterial map={tex} transparent opacity={c.o} depthWrite={false} fog />
        </sprite>
      ))}
    </group>
  );
}
