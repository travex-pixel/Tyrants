"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { getWorld, renderCreatures, type RenderCreature } from "./context";
import { SPECIES } from "@/src/sim/species";
import type { Creature } from "@/src/sim/types";
import { useGame } from "@/src/store/game";
import { audio } from "@/src/audio/audio";
import { cameraCtl } from "./cameraCtl";

const MAX = 220;
const dummy = new THREE.Object3D();
const col = new THREE.Color();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const m4 = new THREE.Matrix4();
const rootM = new THREE.Matrix4();

type PartKey = "body" | "head" | "eyeL" | "eyeR" | "pupilL" | "pupilR" | "earL" | "earR" | "cap" | "armL" | "armR" | "legL" | "legR" | "item" | "hat" | "ring";

function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Species body plan: local offsets & scales for every part (unit creature, before c.scale). */
function plan(c: Creature) {
  switch (c.species) {
    case "goblin":
      return { bodyS: [0.42, 0.5, 0.38], bodyY: 0.42, headS: [0.52, 0.5, 0.5], headY: 0.95, ear: 0.26, earY: 1.08, earAngle: 0.9, cap: 0, armL: 0.42, legL: 0.3, legY: 0.14, eyeS: 0.1, eyeSep: 0.17, eyeY: 0.98, eyeZ: 0.42, color: c.variant > 0.7 ? "#8ac45a" : c.variant > 0.4 ? "#6fb24a" : "#5a9d3f", accent: "#c9415a", skinHead: null as string | null };
    case "trollkin":
      return { bodyS: [0.72, 0.78, 0.6], bodyY: 0.62, headS: [0.52, 0.46, 0.5], headY: 1.3, ear: 0.12, earY: 1.4, earAngle: 1.2, cap: 0, armL: 0.6, legL: 0.42, legY: 0.2, eyeS: 0.085, eyeSep: 0.16, eyeY: 1.33, eyeZ: 0.42, color: c.variant > 0.6 ? "#8a9bb3" : c.variant > 0.3 ? "#7d8fa6" : "#6f7f95", accent: "#d9b36c", skinHead: null };
    default:
      return { bodyS: [0.32, 0.62, 0.32], bodyY: 0.45, headS: [0.3, 0.26, 0.3], headY: 1.0, ear: 0, earY: 0, earAngle: 0, cap: 0.75, armL: 0.38, legL: 0.26, legY: 0.12, eyeS: 0.09, eyeSep: 0.13, eyeY: 0.95, eyeZ: 0.26, color: "#eadcc0", accent: c.variant > 0.66 ? "#d9643a" : c.variant > 0.33 ? "#c9415a" : "#f0b35a", skinHead: null };
  }
}

export function Creatures() {
  const refs = useRef<Record<PartKey, THREE.InstancedMesh | null>>({ body: null, head: null, eyeL: null, eyeR: null, pupilL: null, pupilR: null, earL: null, earR: null, cap: null, armL: null, armR: null, legL: null, legR: null, item: null, hat: null, ring: null });
  const quality = useGame((s) => s.settings.quality);
  const geos = useMemo(
    () => ({
      body: new THREE.SphereGeometry(0.5, 12, 10),
      head: new THREE.SphereGeometry(0.5, 12, 10),
      eye: new THREE.SphereGeometry(0.5, 8, 6),
      ear: new THREE.ConeGeometry(0.5, 1, 5),
      cap: new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      limb: new THREE.CapsuleGeometry(0.1, 0.6, 3, 6),
      item: new THREE.BoxGeometry(0.5, 0.5, 0.5),
      ring: new THREE.RingGeometry(0.45, 0.6, 24),
    }),
    [],
  );
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  const prevStates = useRef(new Map<number, string>());

  useFrame((state, dt) => {
    const w = getWorld();
    const R = refs.current;
    if (!w || !R.body) return;
    const t = state.clock.elapsedTime;
    const selected = useGame.getState().selectedCreature;
    const hovered = useGame.getState().hoverCreature;
    const cam = state.camera;
    let i = 0;
    const smooth = 1 - Math.pow(0.0005, dt);
    const seenIds = new Set<number>();
    for (const id in w.creatures) {
      if (i >= MAX) break;
      const c = w.creatures[id];
      seenIds.add(c.id);
      let rc = renderCreatures.get(c.id);
      if (!rc) {
        rc = { x: c.x, y: c.y, z: c.z, heading: c.heading, phase: Math.random() * 6, lastX: c.x, lastZ: c.z, speed: 0, squash: 1, seen: t };
        renderCreatures.set(c.id, rc);
      }
      // smoothing (host sims at 10Hz, clients get 5Hz deltas)
      const jump = Math.hypot(c.x - rc.x, c.z - rc.z) > 6;
      if (jump) {
        rc.x = c.x;
        rc.z = c.z;
        rc.y = c.y;
      } else {
        rc.x += (c.x - rc.x) * smooth;
        rc.z += (c.z - rc.z) * smooth;
        rc.y += (c.y - rc.y) * (c.state === "thrown" ? 1 : smooth);
      }
      rc.heading = lerpAngle(rc.heading, c.heading, c.state === "thrown" ? 1 : smooth);
      const moved = Math.hypot(rc.x - rc.lastX, rc.z - rc.lastZ);
      rc.lastX = rc.x;
      rc.lastZ = rc.z;
      const spd = dt > 0 ? moved / dt : 0;
      rc.speed += (spd - rc.speed) * 0.3;
      rc.phase += spd * dt * 4.2;
      // state transitions → sounds + squash
      const prev = prevStates.current.get(c.id);
      if (prev !== c.state) {
        prevStates.current.set(c.id, c.state);
        if (prev !== undefined) {
          if (c.state === "swim") {
            audio.splash();
            rc.squash = 0.6;
          } else if (c.state === "recover" && prev === "thrown") {
            audio.thud();
            rc.squash = 0.55;
          } else if (c.state === "celebrate") audio.creatureVoice(c.species === "goblin" ? 1 : c.species === "trollkin" ? 2 : 3, "happy");
          else if (c.state === "flee") audio.creatureVoice(c.species === "goblin" ? 1 : c.species === "trollkin" ? 2 : 3, "surprised");
          else if (c.state === "fight") audio.creatureVoice(c.species === "goblin" ? 1 : c.species === "trollkin" ? 2 : 3, "grumpy");
        }
      }
      rc.squash += (1 - rc.squash) * Math.min(1, dt * 6);
      // nearby work sounds (throttled inside the audio engine)
      if ((c.state === "gather" || c.state === "build") && !c.path && cameraCtl.dist < 30) {
        const dcam = Math.hypot(rc.x - cameraCtl.target.x, rc.z - cameraCtl.target.z);
        if (dcam < 14 && Math.random() < dt * 0.9) (c.state === "gather" ? audio.chop() : audio.build());
      }

      writeCreature(c, rc, i, t, R, selected === c.id, hovered === c.id, cam);
      i++;
    }
    for (const id of Array.from(renderCreatures.keys())) if (!seenIds.has(id)) renderCreatures.delete(id);
    for (const key in R) {
      const m = R[key as PartKey];
      if (!m) continue;
      m.count = i;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  });

  const shadows = quality !== "low";
  const mk = (key: PartKey, geo: THREE.BufferGeometry, mat: React.ReactNode, cast = true) => (
    <instancedMesh key={key} ref={(el) => { refs.current[key] = el; }} args={[geo, undefined, MAX]} castShadow={shadows && cast} receiveShadow={false} frustumCulled={false}>
      {mat}
    </instancedMesh>
  );
  return (
    <group>
      {mk("body", geos.body, <meshStandardMaterial roughness={0.7} />)}
      {mk("head", geos.head, <meshStandardMaterial roughness={0.7} />)}
      {mk("eyeL", geos.eye, <meshStandardMaterial roughness={0.3} color="#ffffff" />, false)}
      {mk("eyeR", geos.eye, <meshStandardMaterial roughness={0.3} color="#ffffff" />, false)}
      {mk("pupilL", geos.eye, <meshStandardMaterial roughness={0.3} color="#1a1a22" />, false)}
      {mk("pupilR", geos.eye, <meshStandardMaterial roughness={0.3} color="#1a1a22" />, false)}
      {mk("earL", geos.ear, <meshStandardMaterial roughness={0.7} />, false)}
      {mk("earR", geos.ear, <meshStandardMaterial roughness={0.7} />, false)}
      {mk("cap", geos.cap, <meshStandardMaterial roughness={0.6} />)}
      {mk("armL", geos.limb, <meshStandardMaterial roughness={0.7} />, false)}
      {mk("armR", geos.limb, <meshStandardMaterial roughness={0.7} />, false)}
      {mk("legL", geos.limb, <meshStandardMaterial roughness={0.7} />, false)}
      {mk("legR", geos.limb, <meshStandardMaterial roughness={0.7} />, false)}
      {mk("item", geos.item, <meshStandardMaterial roughness={0.8} />, false)}
      {mk("hat", geos.ear, <meshStandardMaterial roughness={0.6} />, false)}
      {mk("ring", geos.ring, <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />, false)}
    </group>
  );
}

function setPart(R: Record<PartKey, THREE.InstancedMesh | null>, key: PartKey, i: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number, color?: THREE.Color) {
  const mesh = R[key];
  if (!mesh) return;
  e.set(rx, ry, rz);
  q.setFromEuler(e);
  v.set(x, y, z);
  m4.compose(v, q, new THREE.Vector3(sx, sy, sz));
  m4.premultiply(rootM);
  mesh.setMatrixAt(i, m4);
  if (color) mesh.setColorAt(i, color);
}

const hide = (R: Record<PartKey, THREE.InstancedMesh | null>, key: PartKey, i: number) => setPart(R, key, i, 0, -100, 0, 0, 0, 0, 0.0001, 0.0001, 0.0001);
const ITEM_COLORS: Record<string, string> = { wood: "#8a5a36", stone: "#9a9a9a", food: "#e0405a" };

function writeCreature(c: Creature, rc: RenderCreature, i: number, t: number, R: Record<PartKey, THREE.InstancedMesh | null>, selected: boolean, hovered: boolean, cam: THREE.Camera) {
  const P = plan(c);
  const S = c.scale * (c.species === "trollkin" ? 1.05 : c.species === "goblin" ? 0.85 : 0.95);
  const st = c.state;
  const walking = rc.speed > 0.15 && st !== "held" && st !== "thrown" && st !== "swim" && st !== "recover";
  const ph = rc.phase;
  // ── Root transform ──
  let rootY = rc.y;
  let rootRX = 0;
  let rootRZ = 0;
  let sy = rc.squash;
  let sxz = 1 / Math.sqrt(Math.max(0.3, rc.squash));
  const bob = walking ? Math.abs(Math.sin(ph)) * 0.07 * Math.min(1, rc.speed) : Math.sin(t * 2 + i) * 0.015;
  rootY += bob;
  const headingY = rc.heading;
  if (st === "held") {
    sy *= 1.12;
    sxz *= 0.92;
    rootRZ = Math.sin(t * 3) * 0.12;
  } else if (st === "thrown") {
    rootRX = (t * 9 + i) % (Math.PI * 2);
    sxz *= 1.05;
  } else if (st === "recover") {
    rootRZ = Math.PI / 2 - Math.sin(t * 1.5) * 0.08;
    rootY += 0.3 * S;
  } else if (st === "swim") {
    rootY -= 0.35 * S;
    rootRX = 0.4;
  } else if (st === "rest") {
    rootRZ = 1.25;
    rootY += 0.15 * S;
  } else if (st === "celebrate") {
    rootY += Math.abs(Math.sin(t * 8)) * 0.45 * S;
  } else if (st === "fight") {
    rootRZ = Math.sin(t * 25) * 0.15;
  } else if (st === "eat") {
    sy *= 1 + Math.sin(t * 10) * 0.05;
  } else if (st === "gather" || st === "build") {
    rootRX = 0.15 + Math.sin(t * 9) * 0.08;
  } else if (st === "flee" || st === "raid") {
    rootRX = 0.3;
  }
  e.set(rootRX, headingY, rootRZ);
  q.setFromEuler(e);
  v.set(rc.x, rootY, rc.z);
  rootM.compose(v, q, new THREE.Vector3(S * sxz, S * sy, S * sxz));

  const skin = col.set(P.color);
  if (c.blessedUntil > 0 && (getWorld()?.time ?? 0) < c.blessedUntil) skin.lerp(new THREE.Color("#ffe39a"), 0.3);
  if (c.mood === "scared") skin.lerp(new THREE.Color("#dfe6f0"), 0.2);
  if (c.health < 30) skin.lerp(new THREE.Color("#b8c0b0"), 0.3);
  const skinC = skin.clone();
  const accent = new THREE.Color(P.accent);

  // body
  setPart(R, "body", i, 0, P.bodyY, 0, 0, 0, 0, P.bodyS[0] * 2 * 0.5, P.bodyS[1] * 2 * 0.5 * (1 + (walking ? 0 : Math.sin(t * 2.5 + i) * 0.02)), P.bodyS[2] * 2 * 0.5, skinC);
  // head
  const headNod = st === "socialise" ? Math.sin(t * 6) * 0.12 : st === "eat" ? Math.sin(t * 10) * 0.2 + 0.2 : st === "idle" ? Math.sin(t * 0.7 + i) * 0.15 : 0;
  const headYaw = st === "idle" ? Math.sin(t * 0.5 + i * 2) * 0.35 : 0;
  setPart(R, "head", i, 0, P.headY, 0, headNod, headYaw, 0, P.headS[0], P.headS[1], P.headS[2], skinC);
  // eyes
  const scared = c.mood === "scared" || st === "held" || st === "thrown" || st === "flee";
  const sleepy = st === "rest";
  const eyeScale = P.eyeS * (scared ? 1.35 : 1);
  const eyeH = sleepy ? eyeScale * 0.15 : c.mood === "grumpy" ? eyeScale * 0.55 : eyeScale;
  const ex = Math.sin(headYaw) * P.eyeZ;
  const ez = Math.cos(headYaw) * P.eyeZ;
  const eyeY = P.eyeY + Math.sin(headNod) * 0.05;
  setPart(R, "eyeL", i, ex - Math.cos(headYaw) * P.eyeSep, eyeY, ez + Math.sin(headYaw) * P.eyeSep, 0, headYaw, 0, eyeScale, eyeH, eyeScale * 0.7);
  setPart(R, "eyeR", i, ex + Math.cos(headYaw) * P.eyeSep, eyeY, ez - Math.sin(headYaw) * P.eyeSep, 0, headYaw, 0, eyeScale, eyeH, eyeScale * 0.7);
  const pupil = eyeScale * (scared ? 0.3 : 0.5);
  const pz = eyeScale * 0.3;
  if (sleepy) {
    hide(R, "pupilL", i);
    hide(R, "pupilR", i);
  } else {
    setPart(R, "pupilL", i, ex - Math.cos(headYaw) * P.eyeSep + Math.sin(headYaw) * pz, eyeY, ez + Math.sin(headYaw) * P.eyeSep + Math.cos(headYaw) * pz, 0, headYaw, 0, pupil, pupil * (c.mood === "grumpy" ? 0.6 : 1), pupil * 0.6);
    setPart(R, "pupilR", i, ex + Math.cos(headYaw) * P.eyeSep + Math.sin(headYaw) * pz, eyeY, ez - Math.sin(headYaw) * P.eyeSep + Math.cos(headYaw) * pz, 0, headYaw, 0, pupil, pupil * (c.mood === "grumpy" ? 0.6 : 1), pupil * 0.6);
  }
  // ears / cap
  if (P.ear > 0) {
    const flop = scared ? -0.3 : Math.sin(t * 3 + i) * 0.08;
    setPart(R, "earL", i, -P.headS[0] * 0.5, P.earY, 0, 0, 0, P.earAngle + flop, P.ear * 0.5, P.ear * 1.6, P.ear * 0.3, skinC);
    setPart(R, "earR", i, P.headS[0] * 0.5, P.earY, 0, 0, 0, -P.earAngle - flop, P.ear * 0.5, P.ear * 1.6, P.ear * 0.3, skinC);
  } else {
    hide(R, "earL", i);
    hide(R, "earR", i);
  }
  if (P.cap > 0) {
    setPart(R, "cap", i, 0, P.headY + 0.02, 0, headNod, headYaw, 0, P.cap * 1.3, P.cap * 0.9, P.cap * 1.3, accent);
    // spots on cap as "hat" cone misuse → small lighter dome
    setPart(R, "hat", i, 0.18, P.headY + 0.3, 0.1, 0, 0, 0, 0.13, 0.05, 0.13, new THREE.Color("#fff3d6"));
  } else {
    hide(R, "cap", i);
    if (c.species === "goblin" && c.variant > 0.5) setPart(R, "hat", i, 0, P.headY + 0.28, 0, 0.1, 0, 0.1, 0.42, 0.45, 0.42, accent);
    else if (c.species === "trollkin" && c.variant > 0.5) setPart(R, "hat", i, 0, P.headY + 0.3, 0, 0, 0, 0, 0.3, 0.2, 0.3, new THREE.Color("#3a2f28"));
    else hide(R, "hat", i);
  }
  // arms & legs
  const swing = walking ? Math.sin(ph) * 0.7 * Math.min(1, rc.speed) : 0;
  let armLx = swing;
  let armRx = -swing;
  let armLz = 0.25;
  let armRz = -0.25;
  if (st === "gather") {
    armRx = -1.2 + Math.sin(t * 9) * 0.9;
    armLx = -0.6 + Math.sin(t * 9) * 0.4;
  } else if (st === "build") {
    armRx = -1.6 + Math.sin(t * 7) * 0.8;
  } else if (st === "carry" || c.carrying) {
    armLx = -2.6;
    armRx = -2.6;
    armLz = 0.35;
    armRz = -0.35;
  } else if (st === "celebrate" || st === "flee") {
    armLx = -2.8 + Math.sin(t * 10) * 0.3;
    armRx = -2.8 - Math.sin(t * 10) * 0.3;
    armLz = 0.6;
    armRz = -0.6;
  } else if (st === "held") {
    armLx = -0.6;
    armRx = -0.6;
    armLz = 0.9;
    armRz = -0.9;
  } else if (st === "swim") {
    armLx = Math.sin(t * 6) * 1.2;
    armRx = -Math.sin(t * 6) * 1.2;
  } else if (st === "socialise") {
    armRx = -0.8 + Math.sin(t * 4) * 0.4;
  }
  const shoulderY = P.bodyY + P.bodyS[1] * 0.55;
  const armS = P.armL / 0.8;
  setPart(R, "armL", i, -P.bodyS[0] * 0.95, shoulderY, 0, armLx, 0, armLz, armS * 0.9, armS, armS * 0.9, skinC);
  setPart(R, "armR", i, P.bodyS[0] * 0.95, shoulderY, 0, armRx, 0, armRz, armS * 0.9, armS, armS * 0.9, skinC);
  const legSwing = walking ? Math.sin(ph) * 0.8 * Math.min(1, rc.speed) : st === "held" ? Math.sin(t * 6) * 0.5 : 0;
  const legS = P.legL / 0.8;
  setPart(R, "legL", i, -P.bodyS[0] * 0.45, P.legY + P.legL * 0.3, 0, legSwing, 0, 0, legS, legS, legS, skinC.clone().offsetHSL(0, 0, -0.1));
  setPart(R, "legR", i, P.bodyS[0] * 0.45, P.legY + P.legL * 0.3, 0, -legSwing, 0, 0, legS, legS, legS, skinC.clone().offsetHSL(0, 0, -0.1));
  // carried item
  if (c.carrying) {
    const ic = col.set(ITEM_COLORS[c.carrying.type] ?? "#ffffff");
    const amt = Math.min(1.6, 0.6 + c.carrying.amount * 0.15);
    setPart(R, "item", i, 0, P.headY + P.headS[1] * 0.5 + 0.28 * amt, 0, c.carrying.type === "wood" ? 0 : 0.4, 0.3, c.carrying.type === "wood" ? 1.57 : 0, c.carrying.type === "wood" ? amt * 1.3 : amt * 0.8, amt * 0.5, amt * 0.5, ic);
  } else hide(R, "item", i);
  // selection ring (drawn flat on the ground, billboard-free)
  if (selected || hovered) {
    const ring = R.ring;
    if (ring) {
      e.set(-Math.PI / 2, 0, 0);
      q.setFromEuler(e);
      v.set(rc.x, rc.y + 0.04, rc.z);
      const rs = (selected ? 1.3 : 1.0) * S * (1 + Math.sin(t * 5) * 0.05);
      m4.compose(v, q, new THREE.Vector3(rs, rs, rs));
      ring.setMatrixAt(i, m4);
      ring.setColorAt(i, col.set(selected ? "#ffd166" : "#ffffff"));
    }
  } else hide(R, "ring", i);
  void cam;
}
