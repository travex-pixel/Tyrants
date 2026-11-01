"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cameraCtl } from "./cameraCtl";
import { getSession, getWorld, renderCreatures } from "./context";
import { terrainMeshes } from "./Terrain";
import { useGame } from "@/src/store/game";
import { BUILDINGS } from "@/src/sim/species";
import { isBuildable, heightAt, isWaterAt } from "@/src/sim/terrain";
import { islandAt } from "@/src/sim/query";
import { audio } from "@/src/audio/audio";
import { POWER_COOLDOWNS } from "@/src/sim/powers";
import { labelLayer } from "./labels";
import { SPECIES } from "@/src/sim/species";

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tmpV = new THREE.Vector3();

interface PointerInfo { id: number; x: number; y: number; sx: number; sy: number; t: number; button: number; moved: boolean }

export function Interaction() {
  const { gl, camera, size } = useThree();
  const pointers = useRef(new Map<number, PointerInfo>());
  const dragging = useRef<{ creatureId: number; lastX: number; lastZ: number; vx: number; vz: number; lastT: number } | null>(null);
  const painting = useRef<{ dir: 1 | -1; last: number } | null>(null);
  const pinch = useRef<{ dist: number; angle: number } | null>(null);
  const hoverTimer = useRef(0);
  const ghost = useRef<THREE.Group>(null);
  const ghostMat = useRef<THREE.MeshStandardMaterial>(null);
  const cursorRing = useRef<THREE.Mesh>(null);
  const lastCursorSend = useRef(0);
  const keys = useRef(new Set<string>());
  const isTouch = useRef(false);

  const worldPoint = (sx: number, sy: number): { x: number; z: number; y: number; islandId: number } | null => {
    ndc.set((sx / size.width) * 2 - 1, -(sy / size.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const meshes = Array.from(terrainMeshes.values());
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length) {
      const h = hits[0];
      return { x: h.point.x, z: h.point.z, y: h.point.y, islandId: (h.object.userData.islandId as number) ?? 1 };
    }
    // fall back to the y=0 plane so dragging off the island still works
    const t = -raycaster.ray.origin.y / raycaster.ray.direction.y;
    if (t > 0) {
      const p = raycaster.ray.at(t, tmpV);
      return { x: p.x, z: p.z, y: 0, islandId: 0 };
    }
    return null;
  };

  const pickCreature = (sx: number, sy: number, radiusPx: number): number | null => {
    const w = getWorld();
    if (!w) return null;
    let best: number | null = null;
    let bd = radiusPx * radiusPx;
    for (const id in w.creatures) {
      const c = w.creatures[id];
      const rc = renderCreatures.get(c.id);
      tmpV.set(rc ? rc.x : c.x, (rc ? rc.y : c.y) + 0.5 * c.scale, rc ? rc.z : c.z);
      tmpV.project(camera);
      if (tmpV.z > 1) continue;
      const px = (tmpV.x + 1) * 0.5 * size.width;
      const py = (1 - tmpV.y) * 0.5 * size.height;
      const d = (px - sx) ** 2 + (py - sy) ** 2;
      if (d < bd) {
        bd = d;
        best = c.id;
      }
    }
    return best;
  };

  const pickBuilding = (x: number, z: number): number | null => {
    const w = getWorld();
    if (!w) return null;
    let best: number | null = null;
    let bd = 2.4 * 2.4;
    for (const id in w.buildings) {
      const b = w.buildings[id];
      const d = (b.x - x) ** 2 + (b.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = b.id;
      }
    }
    return best;
  };

  const cooldownOk = (p: string): boolean => {
    const cd = POWER_COOLDOWNS[p];
    if (!cd) return true;
    const until = useGame.getState().cooldowns[p] ?? 0;
    if (performance.now() < until) return false;
    useGame.getState().setCooldown(p, performance.now() + cd * 1000);
    return true;
  };

  const tap = (sx: number, sy: number, button: number) => {
    const s = getSession();
    const st = useGame.getState();
    if (!s) return;
    const wp = worldPoint(sx, sy);
    if (!wp) return;
    const me = s.me.id;
    const w = s.world;
    if (st.intro >= 0 && st.intro < 2) return; // the intro's first prompt handles the first grab itself
    // right click (or Send mode): command selected creature
    if (button === 2 || (st.commandMode && st.selectedCreature !== null)) {
      st.setCommandMode(false);
      if (st.selectedCreature !== null) {
        const r = s.dispatch({ type: "command", creatureId: st.selectedCreature, x: wp.x, z: wp.z, player: me });
        if (!r.ok) st.toast(r.reason, "bad");
        else audio.click();
      }
      return;
    }
    if (st.buildType) {
      const r = s.dispatch({ type: "place", building: st.buildType, x: wp.x, z: wp.z, player: me, instant: w.meta.mode === "sandbox" && !!w.flags.instantBuild });
      if (!r.ok) {
        st.toast(r.reason, "bad");
        audio.bad();
      } else {
        audio.build();
        st.toast(`${BUILDINGS[st.buildType].name} placed`, "good");
        if (!(keys.current.has("Shift"))) st.setBuildType(null);
      }
      return;
    }
    const hit = pickCreature(sx, sy, isTouch.current ? 42 : 30);
    switch (st.power) {
      case "spawn": {
        if (!cooldownOk("spawn")) return;
        const r = s.dispatch({ type: "spawn", species: st.spawnSpecies, x: wp.x, z: wp.z, player: me });
        if (!r.ok) {
          st.toast(r.reason, "bad");
          audio.bad();
        } else audio.spawn();
        return;
      }
      case "lightning": {
        if (w.flags.peaceful) {
          st.toast("Peaceful Kingdom: no lightning allowed", "bad");
          return;
        }
        if (!cooldownOk("lightning")) return;
        const r = s.dispatch({ type: "lightning", x: wp.x, z: wp.z, player: me });
        if (!r.ok) st.toast(r.reason, "bad");
        return;
      }
      case "bless": {
        if (!cooldownOk("bless")) return;
        const r = s.dispatch({ type: "bless", x: wp.x, z: wp.z, player: me });
        if (!r.ok) {
          st.toast(r.reason, "bad");
          audio.bad();
        }
        return;
      }
      case "storm": {
        if (!cooldownOk("storm")) return;
        const r = s.dispatch({ type: "storm", x: wp.x, z: wp.z, player: me });
        if (!r.ok) st.toast(r.reason, "bad");
        return;
      }
      case "giant":
      case "clone": {
        if (hit === null) {
          st.toast(`Tap a creature to ${st.power === "giant" ? "make it enormous" : "clone it"}`, "info");
          return;
        }
        if (!cooldownOk(st.power)) return;
        const r = s.dispatch({ type: st.power, creatureId: hit, player: me });
        if (!r.ok) st.toast(r.reason, "bad");
        else audio.spawn();
        return;
      }
      case "terraform":
        return; // handled by painting
      default: {
        if (hit !== null) {
          st.select(hit);
          audio.select();
          const c = w.creatures[hit];
          if (c) audio.creatureVoice(c.species === "goblin" ? 1 : c.species === "trollkin" ? 2 : 3, c.mood === "grumpy" ? "grumpy" : "happy");
        } else {
          const b = pickBuilding(wp.x, wp.z);
          if (b !== null) {
            st.selectBuilding(b);
            audio.select();
          } else {
            const isl = islandAt(w, wp.x, wp.z);
            if (isl && isl.ownerFaction && isl.ownerFaction !== s.myFaction && w.factions[isl.ownerFaction]?.isAI) st.selectIsland(isl.id);
            else if (st.selectedCreature !== null || st.selectedBuilding !== null || st.selectedIsland !== null) st.select(null);
          }
        }
      }
    }
  };

  useEffect(() => {
    const el = gl.domElement;
    el.style.touchAction = "none";
    const onDown = (e: PointerEvent) => {
      audio.unlock();
      isTouch.current = e.pointerType === "touch";
      el.setPointerCapture(e.pointerId);
      pointers.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, moved: false });
      if (pointers.current.size === 2) {
        const [a, b] = Array.from(pointers.current.values());
        pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
        dragging.current = null;
        painting.current = null;
        return;
      }
      const st = useGame.getState();
      const s = getSession();
      if (!s) return;
      if (e.button === 0 && st.power === "terraform" && !st.buildType) {
        painting.current = { dir: keys.current.has("Shift") || st.cursorWorld.valid === false ? -1 : 1, last: 0 };
        if (keys.current.has("Shift") || (useGame.getState().cooldowns.terraLower ?? 0) > 0) painting.current.dir = -1;
        return;
      }
      if (e.button === 2 && st.power === "terraform") {
        painting.current = { dir: -1, last: 0 };
        return;
      }
      if (e.button === 0 && (st.power === "grab" || st.intro >= 0) && !st.buildType) {
        const hit = pickCreature(e.clientX, e.clientY, isTouch.current ? 44 : 30);
        if (hit !== null) {
          const wp = worldPoint(e.clientX, e.clientY);
          const r = s.dispatch({ type: "grab", creatureId: hit, player: s.me.id });
          if (r.ok) {
            dragging.current = { creatureId: hit, lastX: wp?.x ?? 0, lastZ: wp?.z ?? 0, vx: 0, vz: 0, lastT: performance.now() };
            st.select(hit);
            audio.grab();
            if (st.intro === 2) st.setIntro(3);
          }
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.current.get(e.pointerId);
      const st = useGame.getState();
      // hover (throttled)
      const now = performance.now();
      if (now - hoverTimer.current > 50) {
        hoverTimer.current = now;
        const wp = worldPoint(e.clientX, e.clientY);
        if (wp) st.setCursorWorld({ x: wp.x, z: wp.z, valid: wp.islandId > 0 });
        if (!dragging.current && !p) {
          const h = pickCreature(e.clientX, e.clientY, 26);
          st.setHover(h);
        }
        const s = getSession();
        if (s && s.role !== "solo" && wp && now - lastCursorSend.current > 120) {
          lastCursorSend.current = now;
          s.dispatch({ type: "cursor", x: wp.x, z: wp.z, player: s.me.id, power: st.power });
        }
      }
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 7) p.moved = true;
      if (pointers.current.size === 2 && pinch.current) {
        const [a, b] = Array.from(pointers.current.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (pinch.current.dist > 0) cameraCtl.zoom(pinch.current.dist / d);
        let da = ang - pinch.current.angle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        cameraCtl.rotate(-da);
        pinch.current = { dist: d, angle: ang };
        return;
      }
      if (dragging.current) {
        const wp = worldPoint(e.clientX, e.clientY);
        const s = getSession();
        if (wp && s) {
          const d = dragging.current;
          const dt = Math.max(0.008, (now - d.lastT) / 1000);
          const vx = (wp.x - d.lastX) / dt;
          const vz = (wp.z - d.lastZ) / dt;
          d.vx += (vx - d.vx) * 0.35;
          d.vz += (vz - d.vz) * 0.35;
          d.lastX = wp.x;
          d.lastZ = wp.z;
          d.lastT = now;
          s.dispatch({ type: "move", creatureId: d.creatureId, x: wp.x, z: wp.z, player: s.me.id });
          // edge-pan while dragging near the screen border
          const m = 40;
          const px = e.clientX < m ? -1 : e.clientX > size.width - m ? 1 : 0;
          const py = e.clientY < m ? -1 : e.clientY > size.height - m ? 1 : 0;
          if (px || py) cameraCtl.pan(px * 6, py * 6, size.height);
        }
        return;
      }
      if (painting.current) return;
      if (p.button === 2 || (p.button === 1)) {
        cameraCtl.rotate(-dx * 0.005);
        return;
      }
      if (p.moved) cameraCtl.pan(-dx * (st.settings.invertDrag ? -1 : 1), -dy * (st.settings.invertDrag ? -1 : 1), size.height);
    };
    const onUp = (e: PointerEvent) => {
      const p = pointers.current.get(e.pointerId);
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      const s = getSession();
      const st = useGame.getState();
      if (dragging.current && s) {
        const d = dragging.current;
        dragging.current = null;
        const speed = Math.hypot(d.vx, d.vz);
        const stale = performance.now() - d.lastT > 500; // held still before release
        if (speed > 2 && !stale) {
          const k = Math.min(1, speed / 16);
          s.dispatch({ type: "throw", creatureId: d.creatureId, vx: d.vx * 0.85, vz: d.vz * 0.85, vy: 2.5 + k * 7, player: s.me.id });
          audio.throwWhoosh(0.5 + k);
          if (st.intro === 3) st.setIntro(4);
        } else {
          s.dispatch({ type: "drop", creatureId: d.creatureId, player: s.me.id });
        }
        return;
      }
      if (painting.current) {
        painting.current = null;
        return;
      }
      if (!p) return;
      const dur = performance.now() - p.t;
      if (!p.moved && dur < 600) tap(e.clientX, e.clientY, p.button);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraCtl.zoom(Math.exp(e.deltaY * 0.0012));
    };
    const onCtx = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      keys.current.add(e.key);
      const st = useGame.getState();
      const s = getSession();
      const powers: Record<string, string> = { "1": "grab", "2": "spawn", "3": "lightning", "4": "bless", "5": "terraform", "6": "giant", "7": "clone", "8": "storm" };
      if (powers[e.key] && s) {
        const pw = powers[e.key] as typeof st.power;
        if (s.world.unlockedPowers.includes(pw)) st.setPower(pw);
      }
      if (e.key === "b" || e.key === "B") st.setPanel("build");
      if (e.key === "c" || e.key === "C") st.setPanel("chronicle");
      if (e.key === "Escape") {
        if (st.buildType) st.setBuildType(null);
        else if (st.panel !== "none") st.setPanel("none");
        else if (st.selectedCreature !== null || st.selectedBuilding !== null) st.select(null);
        else st.setPanel("pause");
      }
      if ((e.key === "f" || e.key === "F") && st.selectedCreature !== null) st.setFollow(!st.followCreature);
      if (e.key === "h" || e.key === "H") {
        const w = getWorld();
        if (w) st.focusCamera(w.islands[0].spawnPoint.x, w.islands[0].spawnPoint.z, 34);
      }
      if (e.key === " " && s && s.engine) {
        e.preventDefault();
        s.engine.paused = !s.engine.paused;
        st.toast(s.engine.paused ? "Paused" : "Resumed", "info");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.current.delete(e.key);
    const onBlur = () => keys.current.clear();
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("contextmenu", onCtx);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, size.width, size.height]);

  // keyboard panning + terraform painting + ghost + cursor ring, every frame
  useFrame((state, dt) => {
    const k = keys.current;
    const sp = 420 * dt;
    let dx = 0;
    let dy = 0;
    if (k.has("ArrowLeft") || k.has("a") || k.has("A")) dx -= sp;
    if (k.has("ArrowRight") || k.has("d") || k.has("D")) dx += sp;
    if (k.has("ArrowUp") || k.has("w") || k.has("W")) dy -= sp;
    if (k.has("ArrowDown") || k.has("s") || k.has("S")) dy += sp;
    if (dx || dy) cameraCtl.pan(dx, dy, size.height);
    if (k.has("q") || k.has("Q")) cameraCtl.rotate(-1.4 * dt);
    if (k.has("e") || k.has("E")) cameraCtl.rotate(1.4 * dt);
    if (k.has("-") || k.has("_")) cameraCtl.zoom(1 + dt * 1.5);
    if (k.has("=") || k.has("+")) cameraCtl.zoom(1 - dt * 1.5);

    const st = useGame.getState();
    const s = getSession();
    const now = performance.now();
    if (painting.current && s && now - painting.current.last > 140) {
      painting.current.last = now;
      const cw = st.cursorWorld;
      if (cw.valid) {
        const dir = (st.cooldowns.terraLower ?? 0) > now ? -1 : painting.current.dir;
        const r = s.dispatch({ type: "terraform", x: cw.x, z: cw.z, dir, radius: 2.6, player: s.me.id });
        if (r.ok) audio.terraform();
        else if (now - (st.cooldowns.terraWarn ?? 0) > 1500) {
          st.setCooldown("terraWarn", now);
          st.toast(r.reason, "bad");
        }
      }
    }
    // ghost building preview
    if (ghost.current) {
      const w = getWorld();
      if (st.buildType && w && st.cursorWorld.valid) {
        ghost.current.visible = true;
        const def = BUILDINGS[st.buildType];
        const isl = islandAt(w, st.cursorWorld.x, st.cursorWorld.z);
        let ok = !!isl && isBuildable(isl, st.cursorWorld.x, st.cursorWorld.z, def.footprint);
        if (ok && isl) {
          for (const id in w.buildings) {
            const b = w.buildings[id];
            if (b.islandId === isl.id && (b.x - st.cursorWorld.x) ** 2 + (b.z - st.cursorWorld.z) ** 2 < (def.footprint + 1.6) ** 2) ok = false;
          }
          for (const id in w.nodes) {
            const n = w.nodes[id];
            if (n.islandId === isl.id && n.kind !== "berry" && n.kind !== "stump" && n.amount > 0 && (n.x - st.cursorWorld.x) ** 2 + (n.z - st.cursorWorld.z) ** 2 < (def.footprint + 0.6) ** 2) ok = false;
          }
        }
        const y = isl ? Math.max(heightAt(isl, st.cursorWorld.x, st.cursorWorld.z), isl.waterLevel) : 0;
        ghost.current.position.set(st.cursorWorld.x, y, st.cursorWorld.z);
        const r = def.footprint + 0.6;
        ghost.current.scale.set(r, 1, r);
        if (ghostMat.current) ghostMat.current.color.set(ok ? "#7ee787" : "#ff6b6b");
      } else ghost.current.visible = false;
    }
    if (cursorRing.current) {
      const w = getWorld();
      const show = st.cursorWorld.valid && !st.buildType && (st.power === "lightning" || st.power === "bless" || st.power === "terraform" || st.power === "storm" || st.power === "spawn");
      cursorRing.current.visible = show;
      if (show && w) {
        const isl = islandAt(w, st.cursorWorld.x, st.cursorWorld.z);
        const y = isl ? Math.max(heightAt(isl, st.cursorWorld.x, st.cursorWorld.z), isl.waterLevel) : 0;
        cursorRing.current.position.set(st.cursorWorld.x, y + 0.05, st.cursorWorld.z);
        const r = st.power === "bless" ? 3.5 : st.power === "lightning" ? 2.2 : st.power === "terraform" ? 2.6 : st.power === "storm" ? 10 : 0.8;
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.04;
        cursorRing.current.scale.set(r * pulse, r * pulse, 1);
        const mat = cursorRing.current.material as THREE.MeshBasicMaterial;
        mat.color.set(st.power === "lightning" ? "#9ecbff" : st.power === "bless" ? "#ffd166" : st.power === "terraform" ? "#c9a06a" : st.power === "storm" ? "#8aa0c0" : SPECIES[st.spawnSpecies].color);
        if (isl && isWaterAt(isl, st.cursorWorld.x, st.cursorWorld.z) && st.power === "spawn") mat.color.set("#ff6b6b");
      }
    }
  });

  const ghostGeo = useMemo(() => new THREE.CylinderGeometry(1, 1, 0.6, 24, 1, true), []);
  return (
    <group>
      <group ref={ghost} visible={false}>
        <mesh geometry={ghostGeo} position={[0, 0.3, 0]}>
          <meshStandardMaterial ref={ghostMat} color="#7ee787" transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.85, 1, 32]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={cursorRing} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.86, 1, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <RemoteCursors />
      <LabelSync />
    </group>
  );
}

/** Other players' cursors as small glowing markers. */
function RemoteCursors() {
  const group = useRef<THREE.Group>(null);
  const pool = useMemo(() => Array.from({ length: 4 }, () => new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 6), new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#fff", emissiveIntensity: 0.6 }))), []);
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    pool.forEach((m) => {
      m.visible = false;
      m.rotation.x = Math.PI;
      g.add(m);
    });
    return () => pool.forEach((m) => g.remove(m));
  }, [pool]);
  useFrame((state) => {
    const w = getWorld();
    const s = getSession();
    if (!w || !s) return;
    let i = 0;
    for (const id in w.players) {
      if (id === s.me.id || i >= pool.length) continue;
      const p = w.players[id];
      const m = pool[i++];
      m.visible = true;
      const isl = islandAt(w, p.cursorX, p.cursorZ);
      const y = isl ? Math.max(heightAt(isl, p.cursorX, p.cursorZ), isl.waterLevel) : 0;
      m.position.set(p.cursorX, y + 1.2 + Math.sin(state.clock.elapsedTime * 3) * 0.1, p.cursorZ);
      (m.material as THREE.MeshStandardMaterial).color.set(p.color);
      (m.material as THREE.MeshStandardMaterial).emissive.set(p.color);
    }
    for (; i < pool.length; i++) pool[i].visible = false;
  });
  return <group ref={group} />;
}

/** Drives DOM labels (creature names, remote player names) from the render loop. */
function LabelSync() {
  const { camera, size } = useThree();
  const nodes = useRef<HTMLDivElement[]>([]);
  useEffect(() => {
    const c = labelLayer.container;
    if (!c) return;
    for (let i = 0; i < 28; i++) {
      const d = document.createElement("div");
      d.className = "wlabel";
      d.style.display = "none";
      c.appendChild(d);
      nodes.current.push(d);
    }
    return () => {
      nodes.current.forEach((n) => n.remove());
      nodes.current = [];
    };
  }, []);
  const timer = useRef(0);
  useFrame((_, dt) => {
    timer.current += dt;
    if (timer.current < 0.033) return;
    timer.current = 0;
    const w = getWorld();
    const s = getSession();
    const st = useGame.getState();
    if (!w || !s) return;
    let i = 0;
    const put = (x: number, y: number, z: number, text: string, cls: string, color?: string) => {
      if (i >= nodes.current.length) return;
      tmpV.set(x, y, z).project(camera);
      if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) return;
      const n = nodes.current[i++];
      n.style.display = "block";
      n.className = `wlabel ${cls}`;
      n.textContent = text;
      n.style.transform = `translate(-50%, -100%) translate(${((tmpV.x + 1) * 0.5 * size.width).toFixed(1)}px, ${((1 - tmpV.y) * 0.5 * size.height).toFixed(1)}px)`;
      if (color) n.style.setProperty("--c", color);
    };
    const close = cameraCtl.dist < 22;
    for (const id in w.creatures) {
      const c = w.creatures[id];
      const rc = renderCreatures.get(c.id);
      const sel = st.selectedCreature === c.id;
      const hov = st.hoverCreature === c.id;
      if (!(sel || hov || (close && st.settings.showNames && c.faction === s.myFaction))) continue;
      const top = (rc ? rc.y : c.y) + (c.species === "trollkin" ? 1.75 : 1.4) * c.scale + 0.2;
      put(rc ? rc.x : c.x, top, rc ? rc.z : c.z, c.name, sel ? "sel" : hov ? "hov" : "", w.factions[c.faction]?.color);
    }
    for (const id in w.players) {
      if (id === s.me.id) continue;
      const p = w.players[id];
      const isl = islandAt(w, p.cursorX, p.cursorZ);
      const y = isl ? Math.max(heightAt(isl, p.cursorX, p.cursorZ), isl.waterLevel) : 0;
      put(p.cursorX, y + 2.2, p.cursorZ, p.name, "player", p.color);
    }
    for (; i < nodes.current.length; i++) nodes.current[i].style.display = "none";
  });
  return null;
}
