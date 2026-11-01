"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWorld } from "./context";
import { heightAt } from "@/src/sim/terrain";
import type { Building } from "@/src/sim/types";
import { useGame } from "@/src/store/game";
import { isNight } from "@/src/sim/creature";

interface BInfo {
  id: number;
  type: Building["type"];
  x: number;
  y: number;
  z: number;
  rot: number;
  stage: number; // 0 ghost, 1..3 construction, 4 complete
  faction: string;
  color: string;
}

function stageOf(b: Building, delivered: boolean): number {
  if (b.complete) return 4;
  if (!delivered) return 0;
  if (b.progress < 0.33) return 1;
  if (b.progress < 0.66) return 2;
  return 3;
}

export function Buildings() {
  const [list, setList] = useState<BInfo[]>([]);
  const timer = useRef(0);
  useFrame((_, dt) => {
    timer.current += dt;
    if (timer.current < 0.25) return;
    timer.current = 0;
    const w = getWorld();
    if (!w) return;
    const next: BInfo[] = [];
    for (const id in w.buildings) {
      const b = w.buildings[id];
      const isl = w.islands.find((i) => i.id === b.islandId);
      if (!isl) continue;
      const delivered = Object.keys(b.cost).every((k) => (b.delivered[k as keyof typeof b.delivered] ?? 0) >= (b.cost[k as keyof typeof b.cost] ?? 0));
      next.push({ id: b.id, type: b.type, x: b.x, y: heightAt(isl, b.x, b.z), z: b.z, rot: b.rotation, stage: stageOf(b, delivered), faction: b.faction, color: w.factions[b.faction]?.color ?? "#ffffff" });
    }
    if (next.length !== list.length || next.some((n, i) => n.id !== list[i].id || n.stage !== list[i].stage)) setList(next);
  });
  return (
    <group>
      {list.map((b) => (
        <BuildingMesh key={b.id} info={b} />
      ))}
    </group>
  );
}

const BuildingMesh = memo(function BuildingMesh({ info }: { info: BInfo }) {
  const g = useRef<THREE.Group>(null);
  const selected = useGame((s) => s.selectedBuilding === info.id);
  const flame = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const crops = useRef<THREE.Group>(null);
  const window1 = useRef<THREE.MeshStandardMaterial>(null);
  const ghost = info.stage === 0;
  const building = info.stage > 0 && info.stage < 4;
  const grow = info.stage === 4 ? 1 : info.stage === 0 ? 0.15 : 0.3 + info.stage * 0.23;
  const quality = useGame((s) => s.settings.quality);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const w = getWorld();
    if (flame.current) {
      flame.current.scale.set(1 + Math.sin(t * 12) * 0.12, 1 + Math.sin(t * 9.5) * 0.25, 1 + Math.cos(t * 11) * 0.12);
      flame.current.rotation.y = t * 2;
    }
    if (light.current) light.current.intensity = (w && isNight(w) ? 3.2 : 1.4) + Math.sin(t * 13) * 0.25;
    if (crops.current && w) {
      const b = w.buildings[info.id];
      const s = b ? 0.15 + b.cropTimer * 0.85 : 1;
      crops.current.scale.set(1, s, 1);
      const ripe = b && b.cropTimer >= 1;
      crops.current.children.forEach((m) => {
        const mat = (m as THREE.Mesh).material as THREE.MeshStandardMaterial;
        mat.color.set(ripe ? "#f2c94c" : "#6fbf5a");
      });
    }
    if (window1.current && w) window1.current.emissiveIntensity = isNight(w) ? 1.6 : 0.1;
    if (g.current && w) {
      const b = w.buildings[info.id];
      if (b && b.struck && w.time - b.struck < 0.5) g.current.position.y = info.y + Math.sin(t * 60) * 0.05;
      else g.current.position.y = info.y;
    }
    void dt;
  });

  const matProps = ghost ? { transparent: true, opacity: 0.4 } : {};
  const wood = "#7d5234";
  const woodLight = "#a9784b";
  const stone = "#8e8a82";
  const plaster = "#e6d6b6";
  const slate = "#8593a6";
  const roof = info.faction === "p1" ? slate : info.color;
  const shadows = quality !== "low";

  const body = (() => {
    switch (info.type) {
      case "campfire":
        return (
          <>
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <mesh key={k} position={[Math.cos(k * 1.05) * 0.55, 0.12, Math.sin(k * 1.05) * 0.55]} castShadow={shadows}>
                <dodecahedronGeometry args={[0.16, 0]} />
                <meshStandardMaterial color={stone} roughness={1} {...matProps} />
              </mesh>
            ))}
            <mesh position={[0, 0.14, 0]} rotation={[0, 0.5, 1.2]}>
              <cylinderGeometry args={[0.07, 0.07, 0.9, 6]} />
              <meshStandardMaterial color={wood} {...matProps} />
            </mesh>
            <mesh position={[0, 0.14, 0]} rotation={[0, 1.6, 1.2]}>
              <cylinderGeometry args={[0.07, 0.07, 0.9, 6]} />
              <meshStandardMaterial color={wood} {...matProps} />
            </mesh>
            {info.stage === 4 && (
              <>
                <mesh ref={flame} position={[0, 0.45, 0]}>
                  <coneGeometry args={[0.25, 0.7, 7]} />
                  <meshStandardMaterial color="#ffb347" emissive="#ff6a00" emissiveIntensity={2.2} transparent opacity={0.9} />
                </mesh>
                <pointLight ref={light} position={[0, 0.9, 0]} color="#ffa040" intensity={2} distance={9} decay={2} />
              </>
            )}
          </>
        );
      case "storage":
        return (
          <>
            <mesh position={[0, 0.5, 0]} castShadow={shadows} receiveShadow>
              <boxGeometry args={[1.6, 1.0, 1.4]} />
              <meshStandardMaterial color={woodLight} roughness={1} {...matProps} />
            </mesh>
            {[-0.5, 0, 0.5].map((x) => (
              <mesh key={x} position={[x, 0.5, 0.72]}>
                <boxGeometry args={[0.08, 1.0, 0.04]} />
                <meshStandardMaterial color={wood} {...matProps} />
              </mesh>
            ))}
            <mesh position={[0, 1.35, 0]} rotation={[0, Math.PI / 4, 0]} castShadow={shadows}>
              <coneGeometry args={[1.45, 0.8, 4]} />
              <meshStandardMaterial color="#b58a4c" {...matProps} flatShading roughness={1} />
            </mesh>
            <mesh position={[0, 0.3, 0.71]}>
              <boxGeometry args={[0.45, 0.6, 0.05]} />
              <meshStandardMaterial color="#4a3222" {...matProps} />
            </mesh>
            {[0, 1, 2].map((k) => (
              <mesh key={k} position={[-1.1 + k * 0.25, 0.15, 0.9]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.12, 0.12, 0.5, 6]} />
                <meshStandardMaterial color={wood} {...matProps} />
              </mesh>
            ))}
          </>
        );
      case "lumber":
        return (
          <>
            {[-0.8, 0.8].flatMap((x) =>
              [-0.7, 0.7].map((z) => (
                <mesh key={`${x}${z}`} position={[x, 0.7, z]} castShadow={shadows}>
                  <cylinderGeometry args={[0.07, 0.08, 1.4, 6]} />
                  <meshStandardMaterial color={wood} {...matProps} />
                </mesh>
              )),
            )}
            <mesh position={[0, 1.5, 0]} rotation={[0.18, 0, 0]} castShadow={shadows}>
              <boxGeometry args={[2.1, 0.1, 1.9]} />
              <meshStandardMaterial color="#b58a4c" roughness={1} {...matProps} />
            </mesh>
            {[0, 1, 2, 3, 4].map((k) => (
              <mesh key={k} position={[-0.5 + (k % 3) * 0.3, 0.15 + Math.floor(k / 3) * 0.28, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.13, 0.13, 1.2, 6]} />
                <meshStandardMaterial color={woodLight} {...matProps} />
              </mesh>
            ))}
            <mesh position={[0.75, 0.2, -0.2]}>
              <cylinderGeometry args={[0.25, 0.28, 0.4, 7]} />
              <meshStandardMaterial color={wood} {...matProps} />
            </mesh>
          </>
        );
      case "farm":
        return (
          <>
            <mesh position={[0, 0.05, 0]} receiveShadow>
              <boxGeometry args={[3.6, 0.12, 3.2]} />
              <meshStandardMaterial color="#5a3d26" roughness={1} {...matProps} />
            </mesh>
            {[-1.6, 1.6].flatMap((x) =>
              [-1.4, 1.4].map((z) => (
                <mesh key={`${x}${z}`} position={[x, 0.35, z]}>
                  <boxGeometry args={[0.12, 0.6, 0.12]} />
                  <meshStandardMaterial color={wood} {...matProps} />
                </mesh>
              )),
            )}
            <group ref={crops}>
              {Array.from({ length: 12 }).map((_, k) => (
                <mesh key={k} position={[-1.2 + (k % 4) * 0.8, 0.45, -1 + Math.floor(k / 4) * 1]} castShadow={shadows}>
                  <coneGeometry args={[0.18, 0.7, 5]} />
                  <meshStandardMaterial color="#6fbf5a" {...matProps} />
                </mesh>
              ))}
            </group>
          </>
        );
      case "house":
        return (
          <>
            <mesh position={[0, 0.3, 0]} castShadow={shadows} receiveShadow>
              <boxGeometry args={[1.8, 0.6, 1.6]} />
              <meshStandardMaterial color={stone} roughness={1} {...matProps} flatShading />
            </mesh>
            <mesh position={[0, 0.9, 0]} castShadow={shadows} receiveShadow>
              <boxGeometry args={[1.7, 0.8, 1.5]} />
              <meshStandardMaterial color={plaster} roughness={1} {...matProps} />
            </mesh>
            {[-0.85, 0.85].map((x) => (
              <mesh key={x} position={[x, 0.9, 0]}>
                <boxGeometry args={[0.08, 0.8, 1.52]} />
                <meshStandardMaterial color={wood} {...matProps} />
              </mesh>
            ))}
            <mesh position={[0, 1.7, 0]} rotation={[0, Math.PI / 4, 0]} castShadow={shadows}>
              <coneGeometry args={[1.5, 1.0, 4]} />
              <meshStandardMaterial color={roof} {...matProps} flatShading roughness={1} />
            </mesh>
            <mesh position={[0.5, 1.9, -0.3]}>
              <boxGeometry args={[0.25, 0.6, 0.25]} />
              <meshStandardMaterial color={stone} {...matProps} />
            </mesh>
            <mesh position={[0, 0.4, 0.76]}>
              <boxGeometry args={[0.45, 0.8, 0.05]} />
              <meshStandardMaterial color="#4a3222" {...matProps} />
            </mesh>
            <mesh position={[-0.5, 0.8, 0.76]}>
              <boxGeometry args={[0.35, 0.35, 0.05]} />
              <meshStandardMaterial ref={window1} color="#ffd98a" emissive="#ffb347" emissiveIntensity={0.1} {...matProps} />
            </mesh>
          </>
        );
      case "workshop":
        return (
          <>
            <mesh position={[0, 0.8, 0]} castShadow={shadows} receiveShadow>
              <boxGeometry args={[2.6, 1.6, 2.2]} />
              <meshStandardMaterial color={stone} roughness={1} {...matProps} flatShading />
            </mesh>
            <mesh position={[0, 1.2, 0]} castShadow={shadows}>
              <boxGeometry args={[2.62, 0.7, 2.22]} />
              <meshStandardMaterial color={plaster} roughness={1} {...matProps} />
            </mesh>
            <mesh position={[0, 2.0, 0]} rotation={[0, 0, 0]} castShadow={shadows}>
              <boxGeometry args={[2.9, 0.15, 2.5]} />
              <meshStandardMaterial color={roof} {...matProps} />
            </mesh>
            <mesh position={[0, 2.45, 0]} rotation={[0, Math.PI / 4, 0]} castShadow={shadows}>
              <coneGeometry args={[1.9, 0.9, 4]} />
              <meshStandardMaterial color={roof} {...matProps} flatShading />
            </mesh>
            <mesh position={[0.9, 2.6, -0.5]}>
              <cylinderGeometry args={[0.18, 0.22, 1.2, 8]} />
              <meshStandardMaterial color={stone} {...matProps} />
            </mesh>
            <mesh position={[-1.6, 0.35, 0.6]}>
              <boxGeometry args={[0.5, 0.5, 0.3]} />
              <meshStandardMaterial color="#3a3a40" metalness={0.5} roughness={0.5} {...matProps} />
            </mesh>
            <mesh position={[0, 0.5, 1.12]}>
              <boxGeometry args={[0.8, 1.0, 0.05]} />
              <meshStandardMaterial color="#4a3222" {...matProps} />
            </mesh>
          </>
        );
      case "monument":
        return (
          <>
            <mesh position={[0, 0.3, 0]} castShadow={shadows} receiveShadow>
              <cylinderGeometry args={[2.4, 2.7, 0.6, 8]} />
              <meshStandardMaterial color={stone} roughness={1} {...matProps} flatShading />
            </mesh>
            <mesh position={[0, 0.85, 0]} castShadow={shadows}>
              <cylinderGeometry args={[1.5, 1.8, 0.5, 8]} />
              <meshStandardMaterial color="#b9a78d" roughness={1} {...matProps} flatShading />
            </mesh>
            <mesh position={[0, 3.2, 0]} castShadow={shadows}>
              <cylinderGeometry args={[0.35, 0.8, 4.2, 6]} />
              <meshStandardMaterial color="#d8cbb0" roughness={0.9} {...matProps} flatShading />
            </mesh>
            <mesh ref={flame} position={[0, 5.9, 0]}>
              <octahedronGeometry args={[0.6, 0]} />
              <meshStandardMaterial color="#ffd166" emissive="#ffb347" emissiveIntensity={info.stage === 4 ? 2.4 : 0.2} {...matProps} />
            </mesh>
            {[0, 1, 2, 3].map((k) => (
              <mesh key={k} position={[Math.cos(k * 1.57) * 2.1, 1.3, Math.sin(k * 1.57) * 2.1]} castShadow={shadows}>
                <boxGeometry args={[0.35, 1.4, 0.35]} />
                <meshStandardMaterial color="#b9a78d" roughness={1} {...matProps} />
              </mesh>
            ))}
            {info.stage === 4 && <pointLight ref={light} position={[0, 6, 0]} color="#ffd166" intensity={3} distance={14} decay={2} />}
          </>
        );
      case "totem":
        return (
          <>
            {[0, 1, 2].map((k) => (
              <mesh key={k} position={[0, 0.4 + k * 0.75, 0]} castShadow={shadows}>
                <boxGeometry args={[0.7 - k * 0.08, 0.75, 0.7 - k * 0.08]} />
                <meshStandardMaterial color={["#c9553f", "#f2b84b", "#5fb3f0"][k]} {...matProps} />
              </mesh>
            ))}
            <mesh position={[0, 2.7, 0]} rotation={[0, 0, 0]}>
              <boxGeometry args={[1.6, 0.18, 0.3]} />
              <meshStandardMaterial color="#f2b84b" {...matProps} />
            </mesh>
          </>
        );
    }
  })();

  return (
    <group ref={g} position={[info.x, info.y, info.z]} rotation={[0, info.rot, 0]}>
      <group scale={[info.type === "campfire" ? 1 : 0.6 + grow * 0.4, info.type === "campfire" ? 1 : grow, info.type === "campfire" ? 1 : 0.6 + grow * 0.4]}>{body}</group>
      {building && (
        <group>
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) => (
              <mesh key={`${x}${z}`} position={[x * (info.type === "farm" || info.type === "workshop" ? 1.9 : 1.1), 0.9, z * (info.type === "farm" || info.type === "workshop" ? 1.7 : 1.0)]}>
                <cylinderGeometry args={[0.05, 0.05, 1.8, 5]} />
                <meshStandardMaterial color="#d9b36c" />
              </mesh>
            )),
          )}
          <mesh position={[0, 1.8, 0]}>
            <boxGeometry args={[info.type === "farm" || info.type === "workshop" ? 3.9 : 2.3, 0.06, info.type === "farm" || info.type === "workshop" ? 3.5 : 2.1]} />
            <meshStandardMaterial color="#d9b36c" transparent opacity={0.7} />
          </mesh>
        </group>
      )}
      {ghost && (
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.2, 1.5, 32]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
      {selected && (
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.6, 1.85, 40]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.8} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
});

export function Items() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colr = useMemo(() => new THREE.Color(), []);
  const colors: Record<string, string> = { wood: "#8a5a36", stone: "#9a9a9a", food: "#e0405a" };
  useFrame(() => {
    const w = getWorld();
    const m = ref.current;
    if (!w || !m) return;
    let i = 0;
    for (const id in w.items) {
      if (i >= 400) break;
      const it = w.items[id];
      dummy.position.set(it.x, it.y + 0.14, it.z);
      dummy.rotation.set(it.type === "wood" ? 0 : 0.3, it.id * 0.7, it.type === "wood" ? Math.PI / 2 : 0);
      const s = 0.5 + Math.min(1, it.amount * 0.1);
      dummy.scale.set(it.type === "wood" ? s * 1.6 : s * 0.7, s * 0.5, s * 0.5);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, colr.set(colors[it.type]));
      i++;
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 400]} frustumCulled={false}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial roughness={0.8} />
    </instancedMesh>
  );
}

export function Discoveries() {
  const [list, setList] = useState<{ id: number; kind: string; x: number; y: number; z: number; found: boolean }[]>([]);
  const timer = useRef(0);
  useFrame((_, dt) => {
    timer.current += dt;
    if (timer.current < 1) return;
    timer.current = 0;
    const w = getWorld();
    if (!w) return;
    const next = Object.values(w.discoveries).map((d) => {
      const isl = w.islands.find((i) => i.id === d.islandId)!;
      return { id: d.id, kind: d.kind, x: d.x, y: heightAt(isl, d.x, d.z), z: d.z, found: d.found };
    });
    if (next.length !== list.length || next.some((n, i) => n.found !== list[i].found || n.id !== list[i].id)) setList(next);
  });
  return (
    <group>
      {list.map((d) => (
        <DiscoveryMesh key={d.id} d={d} />
      ))}
    </group>
  );
}

function DiscoveryMesh({ d }: { d: { id: number; kind: string; x: number; y: number; z: number; found: boolean } }) {
  const glow = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (glow.current) {
      const t = state.clock.elapsedTime;
      glow.current.scale.setScalar(1 + Math.sin(t * 3 + d.id) * 0.15);
      (glow.current.material as THREE.MeshStandardMaterial).emissiveIntensity = (d.found ? 2.2 : 1.2) + Math.sin(t * 2) * 0.5;
    }
  });
  useEffect(() => {}, []);
  switch (d.kind) {
    case "cave":
      return (
        <group position={[d.x, d.y, d.z]}>
          <mesh position={[0, 0.2, 0]} castShadow>
            <dodecahedronGeometry args={[0.85, 0]} />
            <meshStandardMaterial color="#7a6f63" roughness={1} flatShading />
          </mesh>
          <mesh position={[0.4, 0.5, 0.5]} rotation={[0.3, 0.6, 0.2]} castShadow>
            <dodecahedronGeometry args={[0.45, 0]} />
            <meshStandardMaterial color="#8a7f73" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, 0.35, 0.78]} rotation={[0.25, 0, 0]}>
            <circleGeometry args={[0.38, 12]} />
            <meshBasicMaterial color="#0d0b10" />
          </mesh>
        </group>
      );
    case "glowplant":
      return (
        <group position={[d.x, d.y, d.z]}>
          <mesh position={[0, 0.35, 0]}>
            <cylinderGeometry args={[0.04, 0.07, 0.7, 5]} />
            <meshStandardMaterial color="#3f7d4f" />
          </mesh>
          <mesh ref={glow} position={[0, 0.72, 0]}>
            <sphereGeometry args={[0.14, 10, 8]} />
            <meshStandardMaterial color="#c9a6ff" emissive="#9d6bff" emissiveIntensity={1.2} />
          </mesh>
          <pointLight position={[0, 0.9, 0]} color="#b388ff" intensity={1.0} distance={4} decay={2} />
        </group>
      );
    case "ruins":
      return (
        <group position={[d.x, d.y, d.z]}>
          {[0, 1, 2].map((k) => (
            <mesh key={k} position={[Math.cos(k * 2.1) * 0.8, 0.4 + k * 0.15, Math.sin(k * 2.1) * 0.8]} rotation={[0.1 * k, 0, 0.15 * k]} castShadow>
              <boxGeometry args={[0.35, 0.8 + k * 0.3, 0.35]} />
              <meshStandardMaterial color="#9c968a" roughness={1} />
            </mesh>
          ))}
        </group>
      );
    case "shrine":
      return (
        <group position={[d.x, d.y, d.z]}>
          <mesh position={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.8, 0.6, 0.8]} />
            <meshStandardMaterial color="#8f8a80" roughness={1} />
          </mesh>
          <mesh ref={glow} position={[0, 0.85, 0]}>
            <octahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial color="#ffd166" emissive="#ffb347" emissiveIntensity={1.5} />
          </mesh>
        </group>
      );
    default:
      return (
        <group position={[d.x, d.y, d.z]}>
          {[0, 1, 2, 3].map((k) => (
            <mesh key={k} position={[Math.cos(k * 1.6) * 0.45, 0.35 + (k % 2) * 0.2, Math.sin(k * 1.6) * 0.45]} rotation={[0.2, k, 0.3]}>
              <octahedronGeometry args={[0.3, 0]} />
              <meshStandardMaterial color="#7ee8fa" emissive="#2fb5d6" emissiveIntensity={0.9} transparent opacity={0.9} />
            </mesh>
          ))}
          <mesh ref={glow} position={[0, 0.7, 0]}>
            <octahedronGeometry args={[0.35, 0]} />
            <meshStandardMaterial color="#b388ff" emissive="#8a5cff" emissiveIntensity={1.2} transparent opacity={0.9} />
          </mesh>
        </group>
      );
  }
}
