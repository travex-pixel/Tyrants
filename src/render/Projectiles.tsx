"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWorld, BIOME_PALETTE } from "./context";

const MAX = 12;

/** Uprooted trees and lifted rocks in flight. A tiny fixed pool of meshes updated every frame. */
export function Projectiles() {
  const group = useRef<THREE.Group>(null);
  const pool = useMemo(() => {
    const items: { root: THREE.Group; trunk: THREE.Mesh; lobe: THREE.Mesh; rock: THREE.Mesh }[] = [];
    for (let i = 0; i < MAX; i++) {
      const root = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.17, 1, 7), new THREE.MeshStandardMaterial({ color: "#6e4a2e", roughness: 1 }));
      trunk.position.y = 0.5;
      trunk.castShadow = true;
      const lobe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 2), new THREE.MeshStandardMaterial({ color: "#5fae4b", roughness: 0.95 }));
      lobe.position.y = 1.5;
      lobe.scale.set(1.25, 1.05, 1.25);
      lobe.castShadow = true;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: "#9d9a93", roughness: 0.95 }));
      rock.castShadow = true;
      root.add(trunk, lobe, rock);
      root.visible = false;
      items.push({ root, trunk, lobe, rock });
    }
    return items;
  }, []);
  useFrame(() => {
    const g = group.current;
    const w = getWorld();
    if (!g || !w) return;
    if (g.children.length === 0) pool.forEach((p) => g.add(p.root));
    let i = 0;
    for (const id in w.projectiles) {
      if (i >= MAX) break;
      const p = w.projectiles[id];
      const slot = pool[i++];
      slot.root.visible = true;
      slot.root.position.set(p.x, p.y, p.z);
      slot.root.rotation.set(p.held ? p.spin : p.spin * 1.3, p.variant * 6, p.held ? 0 : p.spin * 0.7);
      const tree = p.kind === "tree";
      slot.trunk.visible = tree;
      slot.lobe.visible = tree;
      slot.rock.visible = !tree;
      const isl = w.islands.find((x) => x.id === p.islandId) ?? w.islands[0];
      const pal = BIOME_PALETTE[isl.biome];
      if (tree) {
        (slot.lobe.material as THREE.MeshStandardMaterial).color.set(pal.canopy[Math.floor(p.variant * 97) % pal.canopy.length]);
        slot.root.scale.setScalar(p.scale);
      } else {
        (slot.rock.material as THREE.MeshStandardMaterial).color.set(p.kind === "crystal" ? "#b388ff" : pal.rock);
        slot.root.scale.set(p.scale * 1.05, p.scale * 0.75, p.scale * 1.15);
      }
    }
    for (; i < MAX; i++) pool[i].root.visible = false;
  });
  return <group ref={group} />;
}
