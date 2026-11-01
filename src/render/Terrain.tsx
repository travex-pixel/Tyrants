"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Island } from "@/src/sim/types";
import { vertexHeight, VOID_HEIGHT } from "@/src/sim/terrain";
import { noise2 } from "@/src/sim/rng";
import { BIOME_PALETTE } from "./context";
import { getWorld } from "./context";

export const terrainMeshes = new Map<number, THREE.Mesh>();

function landVertex(isl: Island, vx: number, vz: number) {
  return vertexHeight(isl, vx, vz) > -0.5;
}
function landCell(isl: Island, cx: number, cz: number) {
  return landVertex(isl, cx, cz) && landVertex(isl, cx + 1, cz) && landVertex(isl, cx, cz + 1) && landVertex(isl, cx + 1, cz + 1);
}

interface SurfaceBuild {
  geometry: THREE.BufferGeometry;
  boundary: [number, number, number, number, number, number][]; // x1,y1,z1,x2,y2,z2 (ordered so land is on the left)
}

/** Build the top surface geometry with vertex colours. Cells with 3 land vertices get a single triangle so the coast reads as diagonal, not stair-stepped. */
function buildSurface(isl: Island): SurfaceBuild {
  const n = isl.size;
  const pal = BIOME_PALETTE[isl.biome];
  const cGrass = new THREE.Color(pal.grass);
  const cGrassD = new THREE.Color(pal.grassDark);
  const cSand = new THREE.Color(pal.sand);
  const cRock = new THREE.Color(pal.rock);
  const cPeak = new THREE.Color(pal.peak);
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const vIndex = new Int32Array((n + 1) * (n + 1)).fill(-1);
  const tmp = new THREE.Color();
  const getIdx = (vx: number, vz: number) => {
    const i = vz * (n + 1) + vx;
    if (vIndex[i] >= 0) return vIndex[i];
    const h = vertexHeight(isl, vx, vz);
    positions.push(isl.ox + vx, h, isl.oz + vz);
    const hx = vertexHeight(isl, Math.min(n, vx + 1), vz) - vertexHeight(isl, Math.max(0, vx - 1), vz);
    const hz = vertexHeight(isl, vx, Math.min(n, vz + 1)) - vertexHeight(isl, vx, Math.max(0, vz - 1));
    const slope = Math.min(1, Math.hypot(hx, hz) * 0.55);
    const nz = noise2(vx * 0.35, vz * 0.35, isl.seed) - 0.5;
    const rel = h - isl.waterLevel;
    if (rel < 0.2) tmp.copy(cSand);
    else if (rel < 0.45) tmp.copy(cSand).lerp(cGrass, (rel - 0.2) / 0.25);
    else tmp.copy(cGrass).lerp(cGrassD, THREE.MathUtils.clamp(nz * 1.6 + 0.5, 0, 1) * 0.7);
    if (h > 3.6) tmp.lerp(cPeak, THREE.MathUtils.clamp((h - 3.6) / 1.6, 0, 1) * 0.8);
    if (slope > 0.45) tmp.lerp(cRock, THREE.MathUtils.clamp((slope - 0.45) / 0.35, 0, 1));
    tmp.offsetHSL(0, 0, nz * 0.04);
    colors.push(tmp.r, tmp.g, tmp.b);
    vIndex[i] = positions.length / 3 - 1;
    return vIndex[i];
  };
  const edgeCount = new Map<string, number>();
  const edgeDir = new Map<string, [number, number]>();
  const tri = (a: number, b: number, c: number) => {
    indices.push(a, b, c);
    for (const [p, q] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      edgeDir.set(key, [p, q]);
    }
  };
  for (let cz = 0; cz < n; cz++) {
    for (let cx = 0; cx < n; cx++) {
      const l00 = landVertex(isl, cx, cz);
      const l10 = landVertex(isl, cx + 1, cz);
      const l01 = landVertex(isl, cx, cz + 1);
      const l11 = landVertex(isl, cx + 1, cz + 1);
      const count = (l00 ? 1 : 0) + (l10 ? 1 : 0) + (l01 ? 1 : 0) + (l11 ? 1 : 0);
      if (count < 3) continue;
      if (count === 4) {
        const a = getIdx(cx, cz);
        const b = getIdx(cx + 1, cz);
        const c = getIdx(cx, cz + 1);
        const d = getIdx(cx + 1, cz + 1);
        if ((cx + cz) % 2 === 0) {
          tri(a, c, b);
          tri(b, c, d);
        } else {
          tri(a, d, b);
          tri(a, c, d);
        }
      } else {
        // one triangle through the three land vertices (counter-clockwise seen from above → a,c,b ordering style)
        if (!l00) tri(getIdx(cx + 1, cz), getIdx(cx, cz + 1), getIdx(cx + 1, cz + 1));
        else if (!l10) tri(getIdx(cx, cz), getIdx(cx, cz + 1), getIdx(cx + 1, cz + 1));
        else if (!l01) tri(getIdx(cx, cz), getIdx(cx + 1, cz + 1), getIdx(cx + 1, cz));
        else tri(getIdx(cx, cz), getIdx(cx, cz + 1), getIdx(cx + 1, cz));
      }
    }
  }
  const boundary: SurfaceBuild["boundary"] = [];
  for (const [key, cnt] of edgeCount) {
    if (cnt !== 1) continue;
    const [p, q] = edgeDir.get(key)!;
    boundary.push([positions[p * 3], positions[p * 3 + 1], positions[p * 3 + 2], positions[q * 3], positions[q * 3 + 1], positions[q * 3 + 2]]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return { geometry: g, boundary };
}

/** Rock underside: skirt strips from every boundary edge down to a jagged inverted cone. */
function buildUnderside(isl: Island, boundary: SurfaceBuild["boundary"]): THREE.BufferGeometry {
  const n = isl.size;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const cx0 = isl.ox + n / 2;
  const cz0 = isl.oz + n / 2;
  const depth = n * 0.42;
  const cDark = new THREE.Color("#3a3230");
  const cMid = new THREE.Color(isl.biome === "ember" ? "#5a3a32" : isl.biome === "crystal" ? "#4a4468" : "#6b5a4e");
  const cTop = new THREE.Color(isl.biome === "frost" ? "#8da0b3" : "#8a7a6b");
  const tmp = new THREE.Color();
  const bottom = (x: number, z: number, level: number) => {
    const dx = x - cx0;
    const dz = z - cz0;
    const d = Math.hypot(dx, dz) || 1;
    const nz = noise2(x * 0.3 + 100, z * 0.3 + 100, isl.seed) - 0.5;
    const pull = level * (0.72 + nz * 0.25);
    const y = -level * depth * (0.5 + 0.5 * (1 - level)) - level * nz * 6 - 0.4;
    return [x - (dx / d) * d * pull, y, z - (dz / d) * d * pull] as const;
  };
  const levels = [0, 0.35, 0.7, 1];
  for (const [x1, h1, z1, x2, h2, z2] of boundary) {
    const base = positions.length / 3;
    for (let li = 0; li < levels.length; li++) {
      const l = levels[li];
      const p1 = li === 0 ? [x1, h1 - 0.12, z1] : bottom(x1, z1, l);
      const p2 = li === 0 ? [x2, h2 - 0.12, z2] : bottom(x2, z2, l);
      positions.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      tmp.copy(cTop).lerp(cMid, Math.min(1, l * 1.6)).lerp(cDark, Math.max(0, l - 0.5) * 2);
      const nz = noise2(x1 * 0.5 + l * 7, z1 * 0.5, isl.seed + 9) - 0.5;
      tmp.offsetHSL(0, 0, nz * 0.08);
      colors.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
    }
    for (let li = 0; li < levels.length - 1; li++) {
      const a = base + li * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      // boundary edges run with land on the left (CCW triangles seen from above), so this winding faces outward
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Water surface for lake cells only. */
function buildWater(isl: Island): THREE.BufferGeometry | null {
  const n = isl.size;
  const positions: number[] = [];
  const indices: number[] = [];
  const y = isl.waterLevel;
  for (let cz = 0; cz < n; cz++) {
    for (let cx = 0; cx < n; cx++) {
      if (!landCell(isl, cx, cz)) continue;
      const min = Math.min(vertexHeight(isl, cx, cz), vertexHeight(isl, cx + 1, cz), vertexHeight(isl, cx, cz + 1), vertexHeight(isl, cx + 1, cz + 1));
      if (min >= y) continue;
      const b = positions.length / 3;
      const x0 = isl.ox + cx;
      const z0 = isl.oz + cz;
      positions.push(x0 - 0.02, y, z0 - 0.02, x0 + 1.02, y, z0 - 0.02, x0 - 0.02, y, z0 + 1.02, x0 + 1.02, y, z0 + 1.02);
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  if (!positions.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

const waterVert = `
uniform float time; varying vec3 vPos; varying float vWave;
void main(){
  vec3 p = position;
  float w = sin(p.x*1.7 + time*1.3) * 0.5 + sin(p.z*2.1 - time*1.1) * 0.5 + sin((p.x+p.z)*0.9 + time*0.7)*0.4;
  p.y += w * 0.035;
  vWave = w;
  vPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
}`;
const waterFrag = `
uniform vec3 color; uniform vec3 deep; uniform float time; varying vec3 vPos; varying float vWave;
void main(){
  float s = sin(vPos.x*5.3 + time*1.6 + sin(vPos.z*3.1+time*0.7)*2.0) * sin(vPos.z*4.7 - time*1.3 + sin(vPos.x*2.3)*1.5);
  float sparkle = smoothstep(0.93, 1.0, s) * 0.8;
  vec3 c = mix(deep, color, 0.55 + 0.25*vWave) + sparkle * 0.55;
  gl_FragColor = vec4(c, 0.78);
}`;

const fallVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const fallFrag = `
uniform float time; varying vec2 vUv;
void main(){
  float stripes = sin(vUv.x*22.0 + sin(vUv.y*9.0)*2.0) * 0.5 + 0.5;
  float flow = fract(vUv.y*3.0 + time*1.4 + stripes*0.3);
  float a = (0.35 + 0.45*smoothstep(0.3, 0.9, flow)) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  a *= smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.75, 1.0, 1.0 - vUv.y) * 0.6);
  vec3 c = mix(vec3(0.55,0.8,0.98), vec3(0.95,0.98,1.0), stripes*0.6 + flow*0.3);
  gl_FragColor = vec4(c, a*0.55);
}`;

function findWaterfalls(isl: Island, count: number): { x: number; z: number; y: number; angle: number }[] {
  // choose coastal cells with the lowest rim height, spaced apart
  const n = isl.size;
  const cands: { x: number; z: number; y: number; angle: number }[] = [];
  for (let cz = 1; cz < n - 1; cz++) {
    for (let cx = 1; cx < n - 1; cx++) {
      if (!landCell(isl, cx, cz)) continue;
      const dirs = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ];
      for (const [dx, dz] of dirs) {
        if (landCell(isl, cx + dx, cz + dz)) continue;
        const y = Math.min(vertexHeight(isl, cx, cz), vertexHeight(isl, cx + 1, cz), vertexHeight(isl, cx, cz + 1), vertexHeight(isl, cx + 1, cz + 1));
        cands.push({ x: isl.ox + cx + 0.5 + dx * 0.55, z: isl.oz + cz + 0.5 + dz * 0.55, y, angle: Math.atan2(dx, dz) });
      }
    }
  }
  cands.sort((a, b) => a.y - b.y);
  const out: typeof cands = [];
  for (const c of cands) {
    if (out.length >= count) break;
    if (out.every((o) => Math.hypot(o.x - c.x, o.z - c.z) > n * 0.35)) out.push(c);
  }
  return out;
}

export function IslandMesh({ island }: { island: Island }) {
  const [version, setVersion] = useState(0);
  const built = useMemo(() => buildSurface(island), [island, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const surface = built.geometry;
  const under = useMemo(() => buildUnderside(island, built.boundary), [island, built]);
  const water = useMemo(() => buildWater(island), [island, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const falls = useMemo(() => findWaterfalls(island, island.size > 50 ? 2 : 1), [island]);
  const meshRef = useRef<THREE.Mesh>(null);
  const waterUniforms = useMemo(() => ({ time: { value: 0 }, color: { value: new THREE.Color(BIOME_PALETTE[island.biome].water) }, deep: { value: new THREE.Color("#1f5f9a") } }), [island.biome]);
  const fallUniforms = useMemo(() => ({ time: { value: 0 } }), []);

  useEffect(() => {
    if (meshRef.current) terrainMeshes.set(island.id, meshRef.current);
    return () => {
      terrainMeshes.delete(island.id);
    };
  }, [island.id, surface]);

  useEffect(() => () => {
    surface.dispose();
    under.dispose();
    water?.dispose();
  }, [surface, under, water]);

  useFrame((state) => {
    waterUniforms.time.value = state.clock.elapsedTime;
    fallUniforms.time.value = state.clock.elapsedTime;
    // terrain changed (terraform)? rebuild geometry at most ~5 times/second
    const w = getWorld();
    const live = w?.islands.find((i) => i.id === island.id);
    if (live && live.dirty) {
      live.dirty = false;
      setVersion((v) => v + 1);
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={surface} receiveShadow castShadow userData={{ islandId: island.id }}>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0} />
      </mesh>
      <mesh geometry={under} castShadow>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} flatShading side={THREE.DoubleSide} />
      </mesh>
      {water && (
        <mesh geometry={water} renderOrder={2}>
          <shaderMaterial vertexShader={waterVert} fragmentShader={waterFrag} uniforms={waterUniforms} transparent depthWrite={false} />
        </mesh>
      )}
      {falls.map((f, i) => (
        <group key={i} position={[f.x, f.y - 0.1, f.z]} rotation={[0, f.angle, 0]}>
          <mesh position={[0, -5, 0.2]} renderOrder={3}>
            <planeGeometry args={[1.1, 11, 1, 8]} />
            <shaderMaterial vertexShader={fallVert} fragmentShader={fallFrag} uniforms={fallUniforms} transparent depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Terrain() {
  const [islands, setIslands] = useState<Island[]>([]);
  useFrame(() => {
    const w = getWorld();
    if (!w) return;
    if (w.islands.length !== islands.length || w.islands.some((i, k) => islands[k] !== i)) setIslands([...w.islands]);
  });
  return (
    <>
      {islands.map((isl) => (
        <IslandMesh key={isl.id} island={isl} />
      ))}
    </>
  );
}

export { VOID_HEIGHT };
