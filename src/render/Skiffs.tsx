"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWorld } from "./context";
import { skiffPosition } from "@/src/sim/skiffs";

const MAX = 6;

/** Sky-skiffs: a wooden hull hanging from a patched balloon, flying an arc between islands. */
export function Skiffs() {
  const group = useRef<THREE.Group>(null);
  const pool = useMemo(() => {
    const items: { root: THREE.Group; balloon: THREE.Mesh; flag: THREE.Mesh }[] = [];
    for (let i = 0; i < MAX; i++) {
      const root = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 1.9, 8), new THREE.MeshStandardMaterial({ color: "#7d5234", roughness: 1 }));
      hull.rotation.z = Math.PI / 2;
      hull.scale.set(1, 1, 0.7);
      hull.castShadow = true;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.07, 6, 10), new THREE.MeshStandardMaterial({ color: "#a9784b", roughness: 1 }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.3;
      rim.scale.set(1.6, 0.75, 1);
      const balloon = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), new THREE.MeshStandardMaterial({ color: "#d9b36c", roughness: 0.9 }));
      balloon.position.y = 2.6;
      balloon.scale.set(1, 1.2, 1);
      balloon.castShadow = true;
      const ropes = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4), new THREE.MeshStandardMaterial({ color: "#3b2a1a" }));
      ropes.position.y = 1.4;
      const ropes2 = ropes.clone();
      ropes.position.x = -0.5;
      ropes2.position.x = 0.5;
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), new THREE.MeshStandardMaterial({ color: "#c9553f", side: THREE.DoubleSide }));
      flag.position.set(0.3, 3.9, 0);
      root.add(hull, rim, balloon, ropes, ropes2, flag);
      root.visible = false;
      items.push({ root, balloon, flag });
    }
    return items;
  }, []);
  useFrame((state) => {
    const g = group.current;
    const w = getWorld();
    if (!g || !w) return;
    if (g.children.length === 0) pool.forEach((p) => g.add(p.root));
    const t = state.clock.elapsedTime;
    let i = 0;
    for (const id in w.skiffs) {
      if (i >= MAX) break;
      const sk = w.skiffs[id];
      const slot = pool[i++];
      const pos = skiffPosition(sk, w);
      slot.root.visible = true;
      slot.root.position.set(pos.x, pos.y + Math.sin(t * 2 + i) * 0.15, pos.z);
      slot.root.rotation.set(0, pos.heading, Math.sin(t * 1.5 + i) * 0.06);
      const f = w.factions[sk.faction];
      (slot.flag.material as THREE.MeshStandardMaterial).color.set(f?.color ?? "#c9553f");
      (slot.balloon.material as THREE.MeshStandardMaterial).color.set(f?.isAI ? "#b58a4c" : "#e3c27e");
      slot.flag.rotation.y = Math.sin(t * 6) * 0.3;
    }
    for (; i < MAX; i++) pool[i].root.visible = false;
  });
  return <group ref={group} />;
}
