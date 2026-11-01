"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWorld, BIOME_PALETTE } from "./context";
import { heightAt } from "@/src/sim/terrain";
import { noise2 } from "@/src/sim/rng";
import type { Island, ResourceNode } from "@/src/sim/types";
import { useGame } from "@/src/store/game";

const MAX_TREES = 1400;
const MAX_ROCKS = 300;
const MAX_BUSH = 300;
const MAX_CRYSTAL = 120;
const MAX_GRASS = 2600;
const MAX_FLOWERS = 420;

const dummy = new THREE.Object3D();
const col = new THREE.Color();

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

/** All static-ish environment props as instanced meshes, rebuilt only when the node set changes. */
export function Vegetation() {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const canopy = useRef<THREE.InstancedMesh>(null);
  const canopy2 = useRef<THREE.InstancedMesh>(null);
  const rocks = useRef<THREE.InstancedMesh>(null);
  const bushes = useRef<THREE.InstancedMesh>(null);
  const berries = useRef<THREE.InstancedMesh>(null);
  const crystals = useRef<THREE.InstancedMesh>(null);
  const stumps = useRef<THREE.InstancedMesh>(null);
  const grass = useRef<THREE.InstancedMesh>(null);
  const flowers = useRef<THREE.InstancedMesh>(null);
  const lastSig = useRef("");
  const grassBuilt = useRef<string>("");
  const quality = useGame((s) => s.settings.quality);

  const geos = useMemo(
    () => ({
      trunk: new THREE.CylinderGeometry(0.09, 0.16, 1, 6),
      canopy: new THREE.IcosahedronGeometry(0.62, 1),
      canopy2: new THREE.ConeGeometry(0.55, 1.2, 7),
      rock: new THREE.DodecahedronGeometry(0.5, 0),
      bush: new THREE.IcosahedronGeometry(0.42, 1),
      berry: new THREE.SphereGeometry(0.07, 6, 5),
      crystal: new THREE.OctahedronGeometry(0.4, 0),
      stump: new THREE.CylinderGeometry(0.17, 0.2, 0.3, 7),
      grass: new THREE.ConeGeometry(0.09, 0.42, 3),
      flower: new THREE.SphereGeometry(0.08, 5, 4),
    }),
    [],
  );
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);

  const rebuild = (w: NonNullable<ReturnType<typeof getWorld>>) => {
    let ti = 0;
    let ri = 0;
    let bi = 0;
    let bei = 0;
    let ci = 0;
    let si = 0;
    const islands = new Map<number, Island>();
    for (const i of w.islands) islands.set(i.id, i);
    const T = trunks.current!;
    const C = canopy.current!;
    const C2 = canopy2.current!;
    const R = rocks.current!;
    const B = bushes.current!;
    const BE = berries.current!;
    const CR = crystals.current!;
    const ST = stumps.current!;
    const place = (n: ResourceNode, y: number) => {
      dummy.position.set(n.x, y, n.z);
      dummy.rotation.set(0, n.variant * Math.PI * 2, 0);
    };
    for (const id in w.nodes) {
      const n = w.nodes[id];
      const isl = islands.get(n.islandId);
      if (!isl) continue;
      const pal = BIOME_PALETTE[isl.biome];
      const y = heightAt(isl, n.x, n.z);
      if (n.kind === "tree" && ti < MAX_TREES) {
        const grown = 0.45 + 0.55 * Math.min(1, n.amount / n.maxAmount);
        const s = n.scale * grown;
        const conifer = n.variant > 0.62;
        const trunkH = (conifer ? 1.1 : 0.9) * s;
        place(n, y + trunkH / 2 - 0.05);
        dummy.scale.set(s, trunkH, s);
        dummy.updateMatrix();
        T.setMatrixAt(ti, dummy.matrix);
        T.setColorAt(ti, col.set(pal.trunk));
        const cc = col.set(pal.canopy[Math.floor(n.variant * pal.canopy.length) % pal.canopy.length]);
        if (n.burning) cc.set("#ff7a2a");
        if (conifer) {
          place(n, y + trunkH + 0.45 * s);
          dummy.scale.set(s * 1.15, s * 1.3, s * 1.15);
          dummy.updateMatrix();
          C2.setMatrixAt(ti, dummy.matrix);
          C2.setColorAt(ti, cc);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          C.setMatrixAt(ti, dummy.matrix);
        } else {
          place(n, y + trunkH + 0.35 * s);
          const sq = 0.9 + n.variant * 0.4;
          dummy.scale.set(s * sq, s * 0.95, s * sq);
          dummy.rotation.set(n.variant, n.variant * 6, n.variant * 2);
          dummy.updateMatrix();
          C.setMatrixAt(ti, dummy.matrix);
          C.setColorAt(ti, cc);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          C2.setMatrixAt(ti, dummy.matrix);
        }
        ti++;
      } else if (n.kind === "rock" && ri < MAX_ROCKS) {
        place(n, y + 0.15 * n.scale);
        dummy.rotation.set(n.variant * 2, n.variant * 6, n.variant);
        dummy.scale.set(n.scale, n.scale * 0.8, n.scale * 1.1);
        dummy.updateMatrix();
        R.setMatrixAt(ri, dummy.matrix);
        R.setColorAt(ri, col.set(pal.rock).offsetHSL(0, 0, (n.variant - 0.5) * 0.12));
        ri++;
      } else if (n.kind === "berry" && bi < MAX_BUSH) {
        place(n, y + 0.3 * n.scale);
        dummy.scale.set(n.scale * 1.1, n.scale * 0.8, n.scale);
        dummy.updateMatrix();
        B.setMatrixAt(bi, dummy.matrix);
        B.setColorAt(bi, col.set(pal.grassDark).offsetHSL(0, 0.05, -0.08));
        for (let k = 0; k < 4 && bei < MAX_BUSH * 4; k++) {
          const a = n.variant * 7 + k * 1.7;
          dummy.position.set(n.x + Math.cos(a) * 0.33 * n.scale, y + 0.35 * n.scale + Math.sin(a * 2) * 0.12, n.z + Math.sin(a) * 0.33 * n.scale);
          dummy.scale.setScalar(n.amount > k * 1.25 ? 1 : 0.001);
          dummy.updateMatrix();
          BE.setMatrixAt(bei, dummy.matrix);
          BE.setColorAt(bei, col.set(k % 2 ? "#e0405a" : "#f06a7a"));
          bei++;
        }
        bi++;
      } else if (n.kind === "crystal" && ci < MAX_CRYSTAL) {
        place(n, y + 0.3 * n.scale);
        dummy.rotation.set(0.3, n.variant * 6, 0.2);
        dummy.scale.set(n.scale * 0.6, n.scale * 1.3, n.scale * 0.6);
        dummy.updateMatrix();
        CR.setMatrixAt(ci, dummy.matrix);
        CR.setColorAt(ci, col.set(n.variant > 0.5 ? "#b388ff" : "#7ee8fa"));
        ci++;
      } else if (n.kind === "stump" && si < MAX_ROCKS) {
        place(n, y + 0.12);
        dummy.scale.setScalar(n.scale);
        dummy.updateMatrix();
        ST.setMatrixAt(si, dummy.matrix);
        ST.setColorAt(si, col.set(pal.trunk));
        si++;
      }
    }
    T.count = ti;
    C.count = ti;
    C2.count = ti;
    R.count = ri;
    B.count = bi;
    BE.count = bei;
    CR.count = ci;
    ST.count = si;
    for (const m of [T, C, C2, R, B, BE, CR, ST]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
  };

  const buildGrass = (w: NonNullable<ReturnType<typeof getWorld>>) => {
    const G = grass.current!;
    const F = flowers.current!;
    let gi = 0;
    let fi = 0;
    const budget = quality === "low" ? 700 : quality === "medium" ? 1600 : MAX_GRASS;
    for (const isl of w.islands) {
      const pal = BIOME_PALETTE[isl.biome];
      const n = isl.size;
      const per = isl.size > 50 ? budget * 0.7 : budget * 0.1;
      let seed = isl.seed % 1000;
      const rnd = () => ((seed = (seed * 16807 + 11) % 2147483647), seed / 2147483647);
      for (let k = 0; k < per && gi < MAX_GRASS; k++) {
        const x = isl.ox + rnd() * n;
        const z = isl.oz + rnd() * n;
        const h = heightAt(isl, x, z);
        if (h < isl.waterLevel + 0.3 || h > 4.2) continue;
        const cx = Math.floor(x - isl.ox);
        const cz = Math.floor(z - isl.oz);
        if (isl.blocked[cz * n + cx] !== 0) continue;
        if (noise2(x * 0.3, z * 0.3, isl.seed + 5) < 0.42) continue;
        dummy.position.set(x, h + 0.16, z);
        dummy.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6, (rnd() - 0.5) * 0.5);
        const s = 0.7 + rnd() * 0.8;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        G.setMatrixAt(gi, dummy.matrix);
        G.setColorAt(gi, col.set(pal.grass).lerp(new THREE.Color(pal.grassDark), rnd()).offsetHSL(0, 0.1, 0.05));
        gi++;
        if (fi < MAX_FLOWERS && rnd() < 0.14) {
          dummy.position.set(x + 0.2, h + 0.12, z + 0.1);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0.8 + rnd() * 0.6);
          dummy.updateMatrix();
          F.setMatrixAt(fi, dummy.matrix);
          F.setColorAt(fi, col.set(["#ffd166", "#ff8fab", "#ffffff", "#c77dff", "#ffb347"][Math.floor(rnd() * 5)]));
          fi++;
        }
      }
    }
    G.count = gi;
    F.count = fi;
    G.instanceMatrix.needsUpdate = true;
    F.instanceMatrix.needsUpdate = true;
    if (G.instanceColor) G.instanceColor.needsUpdate = true;
    if (F.instanceColor) F.instanceColor.needsUpdate = true;
    G.computeBoundingSphere();
    F.computeBoundingSphere();
  };

  const sigTimer = useRef(0);
  useFrame((state, dt) => {
    const w = getWorld();
    if (!w || !trunks.current || !grass.current) return;
    sigTimer.current += dt;
    if (sigTimer.current < 0.4 && lastSig.current) return;
    sigTimer.current = 0;
    const sig = signature(w);
    if (sig !== lastSig.current) {
      lastSig.current = sig;
      rebuild(w);
    }
    const gkey = `${w.meta.id}:${quality}:${w.islands.map((i) => i.navVersion).join(",")}`;
    if (grassBuilt.current !== gkey) {
      grassBuilt.current = gkey;
      buildGrass(w);
    }
    // gentle canopy sway
    if (canopy.current) {
      const t = state.clock.elapsedTime;
      canopy.current.rotation.set(Math.sin(t * 0.8) * 0.006, 0, Math.cos(t * 0.7) * 0.006);
    }
  });

  const shadows = quality !== "low";
  return (
    <group>
      <instancedMesh ref={trunks} args={[geos.trunk, undefined, MAX_TREES]} castShadow={shadows} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopy} args={[geos.canopy, undefined, MAX_TREES]} castShadow={shadows} receiveShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh ref={canopy2} args={[geos.canopy2, undefined, MAX_TREES]} castShadow={shadows} receiveShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.85} flatShading />
      </instancedMesh>
      <instancedMesh ref={rocks} args={[geos.rock, undefined, MAX_ROCKS]} castShadow={shadows} receiveShadow frustumCulled={false}>
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh ref={bushes} args={[geos.bush, undefined, MAX_BUSH]} castShadow={shadows} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={berries} args={[geos.berry, undefined, MAX_BUSH * 4]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={crystals} args={[geos.crystal, undefined, MAX_CRYSTAL]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.2} metalness={0.1} emissive="#5a3fbf" emissiveIntensity={0.6} transparent opacity={0.92} />
      </instancedMesh>
      <instancedMesh ref={stumps} args={[geos.stump, undefined, MAX_ROCKS]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={grass} args={[geos.grass, undefined, MAX_GRASS]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.9} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={flowers} args={[geos.flower, undefined, MAX_FLOWERS]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
    </group>
  );
}
