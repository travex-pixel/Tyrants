"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWorld, BIOME_PALETTE } from "./context";
import { heightAt } from "@/src/sim/terrain";
import { noise2 } from "@/src/sim/rng";
import type { Island, ResourceNode } from "@/src/sim/types";
import { useGame } from "@/src/store/game";

/**
 * All environment props as instanced meshes, rebuilt only when the node set / buildings change.
 *
 * Tree library (chosen per node by its stable `variant`):
 *   oak        – tapered trunk, three overlapping lobes with a lighter crown lobe
 *   pine       – tall trunk, three stacked tiers, darker blue-green
 *   broadleaf  – two wide flattened tiers, yellow-green
 *   blossom    – short ornamental tree with a pastel crown
 */
const MAX_TREES = 1400;
const MAX_LOBES = MAX_TREES * 3;
const MAX_CONES = 700 * 3;
const MAX_ROCKS = 320;
const MAX_BUSH = 320;
const MAX_CRYSTAL = 120;
const MAX_GRASS = 3200;
const MAX_FLOWERS = 700;
const MAX_SHROOMS = 260;
const MAX_PEBBLES = 500;
const MAX_LOGS = 40;
const MAX_ROOTS = 260;
const MAX_SHARDS = 60;

const dummy = new THREE.Object3D();
const col = new THREE.Color();
const col2 = new THREE.Color();

function signature(w: ReturnType<typeof getWorld>): string {
  if (!w) return "";
  let s = 0;
  let n = 0;
  for (const id in w.nodes) {
    const nd = w.nodes[id];
    s += nd.id * 7 + (nd.kind === "tree" ? 3 : nd.kind === "stump" ? 5 : 1) * 1000 + Math.ceil(nd.amount) + (nd.burning ? 50000 : 0);
    n++;
  }
  return `${n}:${s}:${w.islands.map((i) => i.navVersion).join(",")}`;
}

type Ref = React.RefObject<THREE.InstancedMesh | null>;

function finish(m: THREE.InstancedMesh | null, count: number) {
  if (!m) return;
  m.count = count;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.computeBoundingSphere();
}

export function Vegetation() {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const lobes = useRef<THREE.InstancedMesh>(null);
  const cones = useRef<THREE.InstancedMesh>(null);
  const rocks = useRef<THREE.InstancedMesh>(null);
  const bushes = useRef<THREE.InstancedMesh>(null);
  const berries = useRef<THREE.InstancedMesh>(null);
  const crystals = useRef<THREE.InstancedMesh>(null);
  const stumps = useRef<THREE.InstancedMesh>(null);
  const grass = useRef<THREE.InstancedMesh>(null);
  const flowers = useRef<THREE.InstancedMesh>(null);
  const stems = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  const shroomStems = useRef<THREE.InstancedMesh>(null);
  const pebbles = useRef<THREE.InstancedMesh>(null);
  const logs = useRef<THREE.InstancedMesh>(null);
  const roots = useRef<THREE.InstancedMesh>(null);
  const shards = useRef<THREE.InstancedMesh>(null);
  const lastSig = useRef("");
  const grassBuilt = useRef("");
  const quality = useGame((s) => s.settings.quality);

  const geos = useMemo(
    () => ({
      trunk: new THREE.CylinderGeometry(0.075, 0.17, 1, 7),
      lobe: new THREE.IcosahedronGeometry(0.6, 2),
      cone: new THREE.ConeGeometry(0.55, 1.0, 8),
      rock: new THREE.DodecahedronGeometry(0.5, 0),
      berry: new THREE.SphereGeometry(0.09, 6, 5),
      crystal: new THREE.OctahedronGeometry(0.4, 0),
      stump: new THREE.CylinderGeometry(0.17, 0.2, 0.3, 7),
      grass: new THREE.ConeGeometry(0.14, 0.4, 4),
      flower: new THREE.SphereGeometry(0.085, 6, 5),
      stem: new THREE.CylinderGeometry(0.012, 0.016, 0.3, 4),
      cap: new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
      shroomStem: new THREE.CylinderGeometry(0.05, 0.07, 0.2, 6),
      pebble: new THREE.DodecahedronGeometry(0.12, 0),
      log: new THREE.CylinderGeometry(0.17, 0.2, 1.4, 7),
      root: new THREE.ConeGeometry(0.09, 1, 5),
      shard: new THREE.DodecahedronGeometry(1, 0),
    }),
    [],
  );
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);

  const rebuild = (w: NonNullable<ReturnType<typeof getWorld>>) => {
    let ti = 0, li = 0, ci = 0, ri = 0, bi = 0, bei = 0, cri = 0, si = 0;
    const islands = new Map<number, Island>();
    for (const i of w.islands) islands.set(i.id, i);
    const T = trunks.current!, L = lobes.current!, C = cones.current!, R = rocks.current!, B = bushes.current!, BE = berries.current!, CR = crystals.current!, ST = stumps.current!;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const lobe = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, c: THREE.Color) => {
      if (li >= MAX_LOBES) return;
      dummy.position.set(x, y, z);
      dummy.rotation.set(rot * 0.3, rot, rot * 0.2);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      L.setMatrixAt(li, dummy.matrix);
      L.setColorAt(li, c);
      li++;
    };
    const cone = (x: number, y: number, z: number, s: number, h: number, rot: number, c: THREE.Color) => {
      if (ci >= MAX_CONES) return;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.set(s, h, s);
      dummy.updateMatrix();
      C.setMatrixAt(ci, dummy.matrix);
      C.setColorAt(ci, c);
      ci++;
    };
    for (const id in w.nodes) {
      const n = w.nodes[id];
      const isl = islands.get(n.islandId);
      if (!isl) continue;
      const pal = BIOME_PALETTE[isl.biome];
      const y = heightAt(isl, n.x, n.z);
      const rot = n.variant * Math.PI * 2;
      if (n.kind === "tree" && ti < MAX_TREES) {
        const grown = 0.5 + 0.5 * Math.min(1, n.amount / n.maxAmount);
        const s = n.scale * grown;
        const v = n.variant;
        const type = v < 0.44 ? "oak" : v < 0.7 ? "pine" : v < 0.93 ? "broad" : "blossom";
        const base = col.set(pal.canopy[Math.floor(v * 97) % pal.canopy.length]);
        const tone = noise2(n.x * 0.15, n.z * 0.15, isl.seed + 77) - 0.5; // groves share a tint
        base.offsetHSL(tone * 0.05, 0, tone * 0.08);
        if (n.burning) base.set("#d9612e");
        const trunkH = (type === "pine" ? 1.5 : type === "blossom" ? 0.75 : 1.05) * s;
        dummy.position.set(n.x, y + trunkH / 2 - 0.05, n.z);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.set(s * (type === "pine" ? 0.9 : 1.1), trunkH, s * (type === "pine" ? 0.9 : 1.1));
        dummy.updateMatrix();
        T.setMatrixAt(ti, dummy.matrix);
        T.setColorAt(ti, col2.set(pal.trunk).offsetHSL(0, 0, (v - 0.5) * 0.1));
        if (type === "oak") {
          const crown = base.clone().offsetHSL(0.01, 0.02, 0.09);
          lobe(n.x, y + trunkH + 0.55 * s, n.z, s * 1.25, s * 1.05, s * 1.25, rot, base);
          lobe(n.x + Math.cos(rot) * 0.5 * s, y + trunkH + 0.35 * s, n.z + Math.sin(rot) * 0.5 * s, s * 0.9, s * 0.8, s * 0.9, rot + 1, base.clone().offsetHSL(0, 0, -0.04));
          lobe(n.x - Math.cos(rot + 0.6) * 0.4 * s, y + trunkH + 0.95 * s, n.z - Math.sin(rot + 0.6) * 0.4 * s, s * 0.8, s * 0.7, s * 0.8, rot + 2, crown);
        } else if (type === "pine") {
          const dark = base.clone().offsetHSL(0.03, -0.05, -0.08);
          cone(n.x, y + trunkH * 0.55 + 0.1, n.z, s * 1.45, s * 1.25, rot, dark);
          cone(n.x, y + trunkH * 0.55 + 0.75 * s, n.z, s * 1.1, s * 1.05, rot + 0.5, dark.clone().offsetHSL(0, 0, 0.05));
          cone(n.x, y + trunkH * 0.55 + 1.35 * s, n.z, s * 0.7, s * 0.9, rot + 1, dark.clone().offsetHSL(0, 0, 0.1));
        } else if (type === "broad") {
          const light = base.clone().offsetHSL(0.03, 0.05, 0.08);
          lobe(n.x, y + trunkH + 0.25 * s, n.z, s * 1.55, s * 0.55, s * 1.55, rot, base);
          lobe(n.x + 0.15 * s, y + trunkH + 0.8 * s, n.z, s * 1.05, s * 0.5, s * 1.05, rot + 1, light);
        } else {
          const bl = col2.set(pal.blossom[Math.floor(v * 31) % pal.blossom.length]);
          lobe(n.x, y + trunkH + 0.35 * s, n.z, s * 0.95, s * 0.8, s * 0.95, rot, bl);
          lobe(n.x + 0.3 * s, y + trunkH + 0.55 * s, n.z - 0.1 * s, s * 0.55, s * 0.5, s * 0.55, rot + 2, bl.clone().offsetHSL(0, 0, 0.06));
        }
        ti++;
      } else if (n.kind === "rock" && ri < MAX_ROCKS) {
        dummy.position.set(n.x, y + 0.12 * n.scale, n.z);
        dummy.rotation.set(n.variant * 2, n.variant * 6, n.variant);
        dummy.scale.set(n.scale * 1.05, n.scale * 0.75, n.scale * 1.15);
        dummy.updateMatrix();
        R.setMatrixAt(ri, dummy.matrix);
        R.setColorAt(ri, col.set(pal.rock).offsetHSL(0, 0, (n.variant - 0.5) * 0.14));
        ri++;
      } else if (n.kind === "berry" && bi < MAX_BUSH) {
        dummy.position.set(n.x, y + 0.28 * n.scale, n.z);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.set(n.scale * 1.0, n.scale * 0.85, n.scale * 0.95);
        dummy.updateMatrix();
        B.setMatrixAt(bi, dummy.matrix);
        B.setColorAt(bi, col.set(pal.grass).offsetHSL(0.02, 0.08, 0.02 + (n.variant - 0.5) * 0.08));
        for (let k = 0; k < 4 && bei < MAX_BUSH * 4; k++) {
          const a = n.variant * 7 + k * 1.7;
          dummy.position.set(n.x + Math.cos(a) * 0.33 * n.scale, y + 0.32 * n.scale + Math.sin(a * 2) * 0.1, n.z + Math.sin(a) * 0.3 * n.scale);
          dummy.scale.setScalar(n.amount > k * 1.25 ? 1 : 0.001);
          dummy.updateMatrix();
          BE.setMatrixAt(bei, dummy.matrix);
          BE.setColorAt(bei, col.set(k % 2 ? "#d8405a" : "#ee6f80"));
          bei++;
        }
        bi++;
      } else if (n.kind === "crystal" && cri < MAX_CRYSTAL) {
        dummy.position.set(n.x, y + 0.3 * n.scale, n.z);
        dummy.rotation.set(0.3, rot, 0.2);
        dummy.scale.set(n.scale * 0.6, n.scale * 1.3, n.scale * 0.6);
        dummy.updateMatrix();
        CR.setMatrixAt(cri, dummy.matrix);
        CR.setColorAt(cri, col.set(n.variant > 0.5 ? "#b388ff" : "#7ee8fa"));
        cri++;
      } else if (n.kind === "stump" && si < MAX_ROCKS) {
        dummy.position.set(n.x, y + 0.12, n.z);
        dummy.rotation.set(0, rot, 0);
        dummy.scale.setScalar(n.scale);
        dummy.updateMatrix();
        ST.setMatrixAt(si, dummy.matrix);
        ST.setColorAt(si, col.set(pal.trunk));
        si++;
      }
    }
    for (let k = ti; k < T.count; k++) T.setMatrixAt(k, hidden);
    finish(T, ti); finish(L, li); finish(C, ci); finish(R, ri); finish(B, bi); finish(BE, bei); finish(CR, cri); finish(ST, si);
  };

  /** Ground cover + island dressing: grass tufts, flower patches, mushrooms by trees, pebbles, logs, roots and floating shards. */
  const buildGround = (w: NonNullable<ReturnType<typeof getWorld>>) => {
    const G = grass.current!, F = flowers.current!, S = stems.current!, CP = caps.current!, SS = shroomStems.current!, P = pebbles.current!, LG = logs.current!, RT = roots.current!, SH = shards.current!;
    let gi = 0, fi = 0, mi = 0, pi = 0, lgi = 0, rti = 0, shi = 0;
    const budget = quality === "low" ? 900 : quality === "medium" ? 1900 : MAX_GRASS;
    const trees: { x: number; z: number }[] = [];
    for (const id in w.nodes) if (w.nodes[id].kind === "tree") trees.push({ x: w.nodes[id].x, z: w.nodes[id].z });
    const houses: { x: number; z: number }[] = [];
    for (const id in w.buildings) if (w.buildings[id].type === "house" && w.buildings[id].complete) houses.push({ x: w.buildings[id].x, z: w.buildings[id].z });
    const nearTree = (x: number, z: number, r: number) => trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < r * r);
    for (const isl of w.islands) {
      const pal = BIOME_PALETTE[isl.biome];
      const n = isl.size;
      const per = isl.size > 50 ? budget * 0.72 : budget * 0.09;
      let seed = isl.seed % 1000 || 7;
      const rnd = () => ((seed = (seed * 16807 + 11) % 2147483647), seed / 2147483647);
      const walkable = (x: number, z: number) => {
        const cx = Math.floor(x - isl.ox);
        const cz = Math.floor(z - isl.oz);
        return cx >= 0 && cz >= 0 && cx < n && cz < n && isl.blocked[cz * n + cx] === 0;
      };
      // tufts & flowers in meadow patches
      for (let k = 0; k < per; k++) {
        const x = isl.ox + rnd() * n;
        const z = isl.oz + rnd() * n;
        const h = heightAt(isl, x, z);
        if (h < isl.waterLevel + 0.3 || h > 4.2 || !walkable(x, z)) continue;
        const meadow = noise2((x - isl.ox) * 0.09, (z - isl.oz) * 0.09, isl.seed + 3);
        const patch = noise2(x * 0.33, z * 0.33, isl.seed + 5);
        if (patch < 0.48) continue;
        if (gi < MAX_GRASS) {
          dummy.position.set(x, h + 0.2, z);
          dummy.rotation.set((rnd() - 0.5) * 0.6, rnd() * 6, (rnd() - 0.5) * 0.6);
          const s = 0.5 + rnd() * 0.7;
          dummy.scale.set(s * 1.1, s * (meadow > 0.55 ? 1.3 : 0.9), s * 1.1);
          dummy.updateMatrix();
          G.setMatrixAt(gi, dummy.matrix);
          G.setColorAt(gi, col.set(pal.grass).lerp(col2.set(pal.meadow), meadow).offsetHSL(0.01, 0.06, 0.04 + rnd() * 0.08));
          gi++;
        }
        // flowers cluster in meadows and in a ring around houses
        const flowerChance = meadow > 0.6 ? 0.22 : 0.04;
        if (fi < MAX_FLOWERS && rnd() < flowerChance) {
          const kind = rnd();
          const c = kind < 0.4 ? "#d93a3a" : kind < 0.7 ? "#6b7fe0" : kind < 0.85 ? "#fff1c9" : "#f2b84b";
          dummy.position.set(x + 0.15, h + 0.28, z + 0.1);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0.8 + rnd() * 0.5);
          dummy.updateMatrix();
          F.setMatrixAt(fi, dummy.matrix);
          F.setColorAt(fi, col.set(c));
          dummy.position.set(x + 0.15, h + 0.13, z + 0.1);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          S.setMatrixAt(fi, dummy.matrix);
          S.setColorAt(fi, col.set("#4f7a35"));
          fi++;
        }
        // mushrooms huddle at the feet of trees
        if (mi < MAX_SHROOMS && rnd() < 0.12 && nearTree(x, z, 1.8)) {
          const red = rnd() < 0.5;
          const s = 0.6 + rnd() * 0.8;
          dummy.position.set(x, h + 0.16 * s, z);
          dummy.rotation.set(0, rnd() * 6, 0);
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          CP.setMatrixAt(mi, dummy.matrix);
          CP.setColorAt(mi, col.set(red ? "#c9412f" : "#d9b68a"));
          dummy.position.set(x, h + 0.08 * s, z);
          dummy.updateMatrix();
          SS.setMatrixAt(mi, dummy.matrix);
          SS.setColorAt(mi, col.set("#efe3cc"));
          mi++;
        }
        // pebbles on shores and slopes
        const rel = h - isl.waterLevel;
        if (pi < MAX_PEBBLES && (rel < 0.6 || patch > 0.78) && rnd() < 0.08) {
          dummy.position.set(x, h + 0.05, z);
          dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
          const s = 0.5 + rnd() * 0.9;
          dummy.scale.set(s, s * 0.6, s);
          dummy.updateMatrix();
          P.setMatrixAt(pi, dummy.matrix);
          P.setColorAt(pi, col.set(pal.rock).offsetHSL(0, 0, (rnd() - 0.5) * 0.2));
          pi++;
        }
      }
      // fallen logs in groves
      for (let k = 0; k < 40 && lgi < MAX_LOGS; k++) {
        const x = isl.ox + rnd() * n;
        const z = isl.oz + rnd() * n;
        const h = heightAt(isl, x, z);
        if (h < isl.waterLevel + 0.4 || !walkable(x, z) || !nearTree(x, z, 2.5) || nearTree(x, z, 0.9)) continue;
        dummy.position.set(x, h + 0.17, z);
        dummy.rotation.set(0, rnd() * 6, Math.PI / 2 + (rnd() - 0.5) * 0.2);
        dummy.scale.setScalar(0.7 + rnd() * 0.5);
        dummy.updateMatrix();
        LG.setMatrixAt(lgi, dummy.matrix);
        LG.setColorAt(lgi, col.set(pal.trunk).offsetHSL(0, -0.05, -0.05));
        lgi++;
      }
      // house gardens
      for (const hs of houses) {
        for (let k = 0; k < 10 && fi < MAX_FLOWERS; k++) {
          const a = rnd() * Math.PI * 2;
          const r = 1.9 + rnd() * 0.9;
          const x = hs.x + Math.cos(a) * r;
          const z = hs.z + Math.sin(a) * r;
          const h = heightAt(isl, x, z);
          if (h < -0.5) continue;
          dummy.position.set(x, h + 0.28, z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0.9 + rnd() * 0.4);
          dummy.updateMatrix();
          F.setMatrixAt(fi, dummy.matrix);
          F.setColorAt(fi, col.set(["#d93a3a", "#f2b84b", "#fff1c9", "#e07aa0"][Math.floor(rnd() * 4)]));
          dummy.position.set(x, h + 0.13, z);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          S.setMatrixAt(fi, dummy.matrix);
          S.setColorAt(fi, col.set("#4f7a35"));
          fi++;
        }
      }
      // hanging roots along the rim + floating shards beneath
      const rim: { x: number; z: number; h: number }[] = [];
      for (let cz = 1; cz < n - 1; cz += 2)
        for (let cx = 1; cx < n - 1; cx += 2) {
          const x = isl.ox + cx + 0.5;
          const z = isl.oz + cz + 0.5;
          const h = heightAt(isl, x, z);
          if (h < -0.5) continue;
          let coast = false;
          for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) if (heightAt(isl, x + dx, z + dz) < -0.5) coast = true;
          if (coast) rim.push({ x, z, h });
        }
      for (const r of rim) {
        if (rti < MAX_ROOTS && rnd() < 0.5) {
          const dx = r.x - (isl.ox + n / 2);
          const dz = r.z - (isl.oz + n / 2);
          const d = Math.hypot(dx, dz) || 1;
          const ox = (dx / d) * 0.9;
          const oz = (dz / d) * 0.9;
          const len = 1.2 + rnd() * 2.2;
          dummy.position.set(r.x + ox, r.h - 0.3 - len / 2, r.z + oz);
          dummy.rotation.set((rnd() - 0.5) * 0.5 + Math.PI, rnd() * 6, (rnd() - 0.5) * 0.5);
          dummy.scale.set(0.9, len, 0.9);
          dummy.updateMatrix();
          RT.setMatrixAt(rti, dummy.matrix);
          RT.setColorAt(rti, col.set("#5a3d28").offsetHSL(0, 0, (rnd() - 0.5) * 0.1));
          rti++;
        }
        if (shi < MAX_SHARDS && rnd() < 0.06) {
          const dx = r.x - (isl.ox + n / 2);
          const dz = r.z - (isl.oz + n / 2);
          const d = Math.hypot(dx, dz) || 1;
          const out = 2 + rnd() * 5;
          dummy.position.set(r.x + (dx / d) * out, r.h - 4 - rnd() * 9, r.z + (dz / d) * out);
          dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
          const s = 0.5 + rnd() * 1.4;
          dummy.scale.set(s, s * 0.8, s * 1.2);
          dummy.updateMatrix();
          SH.setMatrixAt(shi, dummy.matrix);
          SH.setColorAt(shi, col.set(pal.cliffB).offsetHSL(0, -0.1, -0.1 + (rnd() - 0.5) * 0.1));
          shi++;
        }
      }
    }
    finish(G, gi); finish(F, fi); finish(S, fi); finish(CP, mi); finish(SS, mi); finish(P, pi); finish(LG, lgi); finish(RT, rti); finish(SH, shi);
  };

  const sigTimer = useRef(0);
  const shardBase = useRef<THREE.Matrix4[] | null>(null);
  useFrame((state, dt) => {
    const w = getWorld();
    if (!w || !trunks.current || !grass.current) return;
    sigTimer.current += dt;
    if (sigTimer.current >= 0.4 || !lastSig.current) {
      sigTimer.current = 0;
      const sig = signature(w);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        rebuild(w);
      }
      let houses = 0;
      for (const id in w.buildings) if (w.buildings[id].type === "house" && w.buildings[id].complete) houses++;
      const gkey = `${w.meta.id}:${quality}:${houses}:${w.islands.map((i) => i.navVersion).join(",")}`;
      if (grassBuilt.current !== gkey) {
        grassBuilt.current = gkey;
        buildGround(w);
        shardBase.current = null;
      }
    }
    const t = state.clock.elapsedTime;
    // wind: whole-canopy sway (cheap) and tuft shimmer
    if (lobes.current) lobes.current.rotation.set(Math.sin(t * 0.7) * 0.008, 0, Math.cos(t * 0.6) * 0.008);
    if (cones.current) cones.current.rotation.set(Math.sin(t * 0.8 + 1) * 0.006, 0, Math.cos(t * 0.5) * 0.006);
    if (grass.current) grass.current.rotation.set(Math.sin(t * 1.3) * 0.02, 0, Math.cos(t * 1.1) * 0.02);
    // floating shards bob gently
    const SH = shards.current;
    if (SH && SH.count > 0) {
      if (!shardBase.current) {
        shardBase.current = [];
        for (let i = 0; i < SH.count; i++) {
          const m = new THREE.Matrix4();
          SH.getMatrixAt(i, m);
          shardBase.current.push(m);
        }
      }
      const m = new THREE.Matrix4();
      for (let i = 0; i < SH.count; i++) {
        m.copy(shardBase.current[i]);
        m.elements[13] += Math.sin(t * 0.5 + i * 1.7) * 0.35;
        SH.setMatrixAt(i, m);
      }
      SH.instanceMatrix.needsUpdate = true;
    }
  });

  const shadows = quality !== "low";
  const mk = (ref: Ref, geo: THREE.BufferGeometry, max: number, mat: React.ReactNode, cast = true, receive = false) => (
    <instancedMesh ref={ref} args={[geo, undefined, max]} castShadow={shadows && cast} receiveShadow={receive} frustumCulled={false}>
      {mat}
    </instancedMesh>
  );
  return (
    <group>
      {mk(trunks, geos.trunk, MAX_TREES, <meshStandardMaterial roughness={1} />)}
      {mk(lobes, geos.lobe, MAX_LOBES, <meshStandardMaterial roughness={0.95} />, true, true)}
      {mk(cones, geos.cone, MAX_CONES, <meshStandardMaterial roughness={0.95} />, true, true)}
      {mk(rocks, geos.rock, MAX_ROCKS, <meshStandardMaterial roughness={1} flatShading />, true, true)}
      {mk(bushes, geos.lobe, MAX_BUSH, <meshStandardMaterial roughness={0.95} />)}
      {mk(berries, geos.berry, MAX_BUSH * 4, <meshStandardMaterial roughness={0.6} />, false)}
      {mk(crystals, geos.crystal, MAX_CRYSTAL, <meshStandardMaterial roughness={0.25} emissive="#5a3fbf" emissiveIntensity={0.6} transparent opacity={0.92} />, false)}
      {mk(stumps, geos.stump, MAX_ROCKS, <meshStandardMaterial roughness={1} />, false)}
      {mk(grass, geos.grass, MAX_GRASS, <meshStandardMaterial roughness={1} side={THREE.DoubleSide} />, false)}
      {mk(flowers, geos.flower, MAX_FLOWERS, <meshStandardMaterial roughness={0.7} />, false)}
      {mk(stems, geos.stem, MAX_FLOWERS, <meshStandardMaterial roughness={1} />, false)}
      {mk(caps, geos.cap, MAX_SHROOMS, <meshStandardMaterial roughness={0.8} />, false)}
      {mk(shroomStems, geos.shroomStem, MAX_SHROOMS, <meshStandardMaterial roughness={1} />, false)}
      {mk(pebbles, geos.pebble, MAX_PEBBLES, <meshStandardMaterial roughness={1} flatShading />, false)}
      {mk(logs, geos.log, MAX_LOGS, <meshStandardMaterial roughness={1} />, true)}
      {mk(roots, geos.root, MAX_ROOTS, <meshStandardMaterial roughness={1} />, false)}
      {mk(shards, geos.shard, MAX_SHARDS, <meshStandardMaterial roughness={1} flatShading />, true)}
    </group>
  );
}
