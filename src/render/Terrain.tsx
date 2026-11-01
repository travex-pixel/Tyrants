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
  boundary: [number, number, number, number, number, number][]; // x1,y1,z1,x2,y2,z2 (land on the left)
}

interface Dressing {
  paths: { ax: number; az: number; bx: number; bz: number }[]; // worn dirt between buildings
  worn: { x: number; z: number; r: number }[]; // trampled discs (campfires, work yards)
  trees: { x: number; z: number; s: number }[]; // for baked contact shadow
}

function segDist2(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  const qx = ax + dx * t;
  const qz = az + dz * t;
  return (px - qx) ** 2 + (pz - qz) ** 2;
}

/**
 * Top surface with painted vertex colours: moss/meadow variation, dirt on slopes and shores,
 * worn paths between buildings, and a baked contact shadow under trees. Cells with 3 land
 * vertices get a single triangle so the coast reads as diagonal, not stair-stepped.
 */
function buildSurface(isl: Island, dress: Dressing): SurfaceBuild {
  const n = isl.size;
  const pal = BIOME_PALETTE[isl.biome];
  const cGrass = new THREE.Color(pal.grass);
  const cMeadow = new THREE.Color(pal.meadow);
  const cGrassD = new THREE.Color(pal.grassDark);
  const cDirt = new THREE.Color(pal.dirt);
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
    const wx = isl.ox + vx;
    const wz = isl.oz + vz;
    positions.push(wx, h, wz);
    const hx = vertexHeight(isl, Math.min(n, vx + 1), vz) - vertexHeight(isl, Math.max(0, vx - 1), vz);
    const hz = vertexHeight(isl, vx, Math.min(n, vz + 1)) - vertexHeight(isl, vx, Math.max(0, vz - 1));
    const slope = Math.min(1, Math.hypot(hx, hz) * 0.55);
    const big = noise2(vx * 0.09, vz * 0.09, isl.seed + 3); // meadow vs moss patches
    const fine = noise2(vx * 0.42, vz * 0.42, isl.seed) - 0.5;
    const rel = h - isl.waterLevel;
    // base grass: moss ↔ meadow patches, with fine mottling
    tmp.copy(cGrass).lerp(cMeadow, THREE.MathUtils.smoothstep(big, 0.42, 0.7)).lerp(cGrassD, THREE.MathUtils.smoothstep(1 - big, 0.6, 0.85) * 0.8);
    tmp.offsetHSL(fine * 0.015, fine * 0.08, fine * 0.05);
    // shoreline: damp dirt and a little sand right at the water
    if (rel < 0.3) tmp.lerp(cDirt, THREE.MathUtils.smoothstep(0.3 - rel, 0, 0.25) * 0.5);
    if (rel < 0.18) tmp.lerp(cSand, THREE.MathUtils.smoothstep(0.18 - rel, 0, 0.15) * 0.7);
    // slopes: dirt then rock
    if (slope > 0.3) tmp.lerp(cDirt, THREE.MathUtils.smoothstep(slope, 0.3, 0.55));
    if (slope > 0.5) tmp.lerp(cRock, THREE.MathUtils.smoothstep(slope, 0.5, 0.85));
    if (h > 3.8) tmp.lerp(cPeak, THREE.MathUtils.clamp((h - 3.8) / 1.5, 0, 1) * 0.7);
    // worn paths and yards
    let wear = 0;
    for (const p of dress.paths) {
      const d2 = segDist2(wx, wz, p.ax, p.az, p.bx, p.bz);
      if (d2 < 2.2) wear = Math.max(wear, 1 - Math.sqrt(d2) / 1.48);
    }
    for (const w of dress.worn) {
      const d = Math.hypot(wx - w.x, wz - w.z);
      if (d < w.r) wear = Math.max(wear, 1 - d / w.r);
    }
    if (wear > 0) tmp.lerp(cDirt, THREE.MathUtils.smoothstep(wear + fine * 0.5, 0.15, 0.75) * 0.9);
    // baked contact shadow under trees
    let shade = 0;
    for (const t of dress.trees) {
      const d = Math.hypot(wx - t.x, wz - t.z);
      const r = 1.15 * t.s;
      if (d < r) shade += (1 - d / r) * 0.35;
    }
    if (shade > 0) tmp.multiplyScalar(1 - Math.min(0.32, shade));
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

/**
 * Cliffs: a mossy overhanging lip, then stratified terracotta/sandstone ledges that step inward
 * with noise so the silhouette is irregular, converging into a dark root-like base.
 */
function buildUnderside(isl: Island, boundary: SurfaceBuild["boundary"]): THREE.BufferGeometry {
  const n = isl.size;
  const pal = BIOME_PALETTE[isl.biome];
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const cx0 = isl.ox + n / 2;
  const cz0 = isl.oz + n / 2;
  const depth = n * 0.48;
  const cLip = new THREE.Color(pal.grassDark);
  const cA = new THREE.Color(pal.cliffA);
  const cB = new THREE.Color(pal.cliffB);
  const cC = new THREE.Color(pal.cliffC);
  const tmp = new THREE.Color();
  // levels: [depth fraction, inward pull, band colour weight]
  const levels: [number, number][] = [
    [0, -0.03], // lip pushes slightly outward
    [0.035, 0.0],
    [0.12, 0.05],
    [0.22, 0.03],
    [0.36, 0.14],
    [0.5, 0.12],
    [0.68, 0.3],
    [0.86, 0.55],
    [1, 0.82],
  ];
  const ring = (x: number, z: number, li: number) => {
    const [lf, pull] = levels[li];
    const dx = x - cx0;
    const dz = z - cz0;
    const d = Math.hypot(dx, dz) || 1;
    const nz = noise2(x * 0.22 + li * 3.1, z * 0.22 + li * 1.7, isl.seed + 11) - 0.5;
    const nz2 = noise2(x * 0.6, z * 0.6, isl.seed + 23) - 0.5;
    const p = pull + nz * 0.12 * (li > 0 ? 1 : 0.4);
    const y = -lf * depth * (0.55 + 0.45 * (1 - lf)) - nz2 * 1.2 * lf - (li === 0 ? 0.02 : 0.3);
    return [x - (dx / d) * d * p, y, z - (dz / d) * d * p] as const;
  };
  for (const [x1, h1, z1, x2, h2, z2] of boundary) {
    const base = positions.length / 3;
    for (let li = 0; li < levels.length; li++) {
      const p1 = li === 0 ? [x1, h1 - 0.02, z1] : ring(x1, z1, li);
      const p2 = li === 0 ? [x2, h2 - 0.02, z2] : ring(x2, z2, li);
      if (li === 1) {
        // lip: drop straight down a touch with the same xz as level 0 pushed out
        const q1 = ring(x1, z1, 0);
        const q2 = ring(x2, z2, 0);
        positions.push(q1[0], Math.min(h1, h2) - 0.55, q1[2], q2[0], Math.min(h1, h2) - 0.55, q2[2]);
      } else positions.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
      const lf = levels[li][0];
      const band = Math.sin(lf * 19 + noise2(x1 * 0.3, z1 * 0.3, isl.seed) * 4);
      if (li <= 1) tmp.copy(cLip).offsetHSL(0, 0, li === 0 ? 0.02 : -0.08);
      else tmp.copy(cA).lerp(cB, band * 0.5 + 0.5).lerp(cC, THREE.MathUtils.smoothstep(lf, 0.55, 1));
      const nz = noise2(x1 * 0.5 + lf * 7, z1 * 0.5, isl.seed + 9) - 0.5;
      tmp.offsetHSL(0, 0, nz * 0.1 - (li > 1 ? 0.02 : 0));
      colors.push(tmp.r, tmp.g, tmp.b, tmp.r, tmp.g, tmp.b);
    }
    for (let li = 0; li < levels.length - 1; li++) {
      const a = base + li * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
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

/** Water surface for lake cells only, with a per-vertex depth attribute for shading and shoreline foam. */
function buildWater(isl: Island): THREE.BufferGeometry | null {
  const n = isl.size;
  const positions: number[] = [];
  const depths: number[] = [];
  const indices: number[] = [];
  const y = isl.waterLevel;
  const dAt = (vx: number, vz: number) => Math.max(0, y - vertexHeight(isl, vx, vz));
  for (let cz = 0; cz < n; cz++) {
    for (let cx = 0; cx < n; cx++) {
      if (!landCell(isl, cx, cz)) continue;
      const min = Math.min(vertexHeight(isl, cx, cz), vertexHeight(isl, cx + 1, cz), vertexHeight(isl, cx, cz + 1), vertexHeight(isl, cx + 1, cz + 1));
      if (min >= y) continue;
      const b = positions.length / 3;
      const x0 = isl.ox + cx;
      const z0 = isl.oz + cz;
      positions.push(x0, y, z0, x0 + 1, y, z0, x0, y, z0 + 1, x0 + 1, y, z0 + 1);
      depths.push(dAt(cx, cz), dAt(cx + 1, cz), dAt(cx, cz + 1), dAt(cx + 1, cz + 1));
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  if (!positions.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("depth", new THREE.Float32BufferAttribute(depths, 1));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

const waterVert = `
uniform float time; attribute float depth; varying vec3 vPos; varying float vDepth; varying vec3 vN;
void main(){
  vec3 p = position;
  float w1 = sin(p.x*1.9 + time*1.1) * cos(p.z*1.4 - time*0.8);
  float w2 = sin((p.x+p.z)*0.8 + time*0.6);
  p.y += (w1*0.5 + w2*0.5) * 0.03;
  // analytic-ish normal from the wave derivatives
  float dx = 1.9*cos(p.x*1.9 + time*1.1)*cos(p.z*1.4 - time*0.8)*0.5 + 0.8*cos((p.x+p.z)*0.8 + time*0.6)*0.5;
  float dz = -1.4*sin(p.x*1.9 + time*1.1)*sin(p.z*1.4 - time*0.8)*0.5 + 0.8*cos((p.x+p.z)*0.8 + time*0.6)*0.5;
  vN = normalize(vec3(-dx*0.12, 1.0, -dz*0.12));
  vDepth = depth;
  vPos = (modelMatrix * vec4(p,1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
}`;
const waterFrag = `
uniform vec3 shallow; uniform vec3 deep; uniform vec3 sunDir; uniform float time; varying vec3 vPos; varying float vDepth; varying vec3 vN;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  float d = clamp(vDepth / 0.9, 0.0, 1.0);
  vec3 c = mix(shallow, deep, smoothstep(0.05, 1.0, d));
  // soft caustic-ish shimmer in the shallows
  float sh = noise(vPos.xz * 2.6 + vec2(time*0.25, -time*0.2)) * noise(vPos.xz * 3.1 - vec2(time*0.18, time*0.22));
  c += vec3(0.18, 0.22, 0.2) * sh * (1.0 - d) * 0.9;
  // shoreline foam
  float foamN = noise(vPos.xz * 4.0 + vec2(time*0.5, time*0.35));
  float foam = smoothstep(0.26, 0.0, vDepth) * smoothstep(0.35, 0.75, foamN);
  c = mix(c, vec3(0.95, 0.98, 0.96), foam * 0.85);
  // stylised sun glint
  vec3 v = normalize(cameraPosition - vPos);
  vec3 h = normalize(v + sunDir);
  float spec = pow(max(dot(vN, h), 0.0), 90.0);
  c += vec3(1.0, 0.95, 0.85) * spec * 0.6;
  float alpha = mix(0.55, 0.88, d);
  gl_FragColor = vec4(c, alpha);
}`;

const fallVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const fallFrag = `
uniform float time; varying vec2 vUv;
void main(){
  float stripes = sin(vUv.x*22.0 + sin(vUv.y*9.0)*2.0) * 0.5 + 0.5;
  float flow = fract(vUv.y*3.0 + time*1.4 + stripes*0.3);
  float a = (0.35 + 0.45*smoothstep(0.3, 0.9, flow)) * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
  a *= smoothstep(0.0, 0.15, vUv.y) * (1.0 - smoothstep(0.75, 1.0, 1.0 - vUv.y) * 0.6);
  vec3 c = mix(vec3(0.3,0.72,0.74), vec3(0.95,0.99,1.0), stripes*0.5 + flow*0.35 + (1.0 - vUv.y)*0.3);
  gl_FragColor = vec4(c, a*0.7);
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

function computeDressing(island: Island): Dressing {
  const w = getWorld();
  const dress: Dressing = { paths: [], worn: [], trees: [] };
  if (!w) return dress;
  const byFaction = new Map<string, { x: number; z: number; type: string }[]>();
  for (const id in w.buildings) {
    const b = w.buildings[id];
    if (b.islandId !== island.id) continue;
    if (!byFaction.has(b.faction)) byFaction.set(b.faction, []);
    byFaction.get(b.faction)!.push({ x: b.x, z: b.z, type: b.type });
    if (b.type === "campfire") dress.worn.push({ x: b.x, z: b.z, r: 2.6 });
    else if (b.complete) dress.worn.push({ x: b.x, z: b.z, r: b.type === "farm" || b.type === "workshop" ? 3.2 : 2.2 });
  }
  for (const list of byFaction.values()) {
    const anchors = list.filter((b) => b.type === "campfire" || b.type === "storage");
    for (const b of list) {
      if (anchors.length === 0) break;
      let best = anchors[0];
      let bd = Infinity;
      for (const a of anchors) {
        const d = (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
        if (d > 0.01 && d < bd) {
          bd = d;
          best = a;
        }
      }
      if (bd < 30 * 30 && bd > 0.01) dress.paths.push({ ax: best.x, az: best.z, bx: b.x, bz: b.z });
    }
  }
  for (const id in w.nodes) {
    const nd = w.nodes[id];
    if (nd.islandId === island.id && nd.kind === "tree" && nd.amount > 0) dress.trees.push({ x: nd.x, z: nd.z, s: nd.scale });
  }
  return dress;
}

function dressingKey(island: Island): string {
  const w = getWorld();
  if (!w) return "";
  let b = 0;
  let t = 0;
  for (const id in w.buildings) if (w.buildings[id].islandId === island.id) b += w.buildings[id].id * (w.buildings[id].complete ? 3 : 1);
  for (const id in w.nodes) if (w.nodes[id].islandId === island.id && w.nodes[id].kind === "tree" && w.nodes[id].amount > 0) t += w.nodes[id].id;
  return `${b}:${t}`;
}

export function IslandMesh({ island }: { island: Island }) {
  const [version, setVersion] = useState(0);
  const dressKey = useRef("");
  const built = useMemo(() => buildSurface(island, computeDressing(island)), [island, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const surface = built.geometry;
  const under = useMemo(() => buildUnderside(island, built.boundary), [island, built]);
  const water = useMemo(() => buildWater(island), [island, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const falls = useMemo(() => findWaterfalls(island, island.size > 50 ? 2 : 1), [island]);
  const meshRef = useRef<THREE.Mesh>(null);
  const waterUniforms = useMemo(() => ({ time: { value: 0 }, shallow: { value: new THREE.Color(BIOME_PALETTE[island.biome].water) }, deep: { value: new THREE.Color(BIOME_PALETTE[island.biome].waterDeep) }, sunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() } }), [island.biome]);
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

  const dressTimer = useRef(0);
  useFrame((state, dt) => {
    waterUniforms.time.value = state.clock.elapsedTime;
    fallUniforms.time.value = state.clock.elapsedTime;
    // terrain changed (terraform)? rebuild geometry at most ~5 times/second
    const w = getWorld();
    const live = w?.islands.find((i) => i.id === island.id);
    if (live && live.dirty) {
      live.dirty = false;
      setVersion((v) => v + 1);
      return;
    }
    // buildings / trees changed → repaint paths and contact shadows (checked every 2s)
    dressTimer.current += dt;
    if (dressTimer.current > 2) {
      dressTimer.current = 0;
      const k = dressingKey(island);
      if (k !== dressKey.current) {
        dressKey.current = k;
        setVersion((v) => v + 1);
      }
    }
  });

  return (
    <group>
      <mesh ref={meshRef} geometry={surface} receiveShadow castShadow userData={{ islandId: island.id }}>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} />
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
          <mesh position={[0, -5.3, 0.35]} renderOrder={3}>
            <planeGeometry args={[1.0, 10.4, 1, 8]} />
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
