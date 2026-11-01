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

type PartKey = "body" | "head" | "eyeL" | "eyeR" | "pupilL" | "pupilR" | "earL" | "earR" | "cap" | "armL" | "armR" | "legL" | "legR" | "item" | "hat" | "ring" | "handL" | "handR" | "belly" | "noseL" | "noseR" | "browL" | "browR";

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
      // hunched, big head, huge ears, oversized hands, a scrap of loincloth
      return { bodyS: [0.4, 0.46, 0.36], bodyY: 0.4, bodyTilt: 0.28, headS: [0.6, 0.56, 0.56], headY: 0.92, headZ: 0.12, ear: 0.34, earY: 1.06, earAngle: 1.05, cap: 0, armL: 0.4, armW: 0.8, hand: 0.17, legL: 0.28, legW: 0.9, legY: 0.13, eyeS: 0.12, eyeSep: 0.17, eyeY: 0.96, eyeZ: 0.36, nose: 0.1,
        color: c.variant > 0.7 ? "#5c9440" : c.variant > 0.4 ? "#4c8536" : "#3f7a33", accent: c.variant > 0.5 ? "#b8402f" : "#7a4a2a", belly: "#8a5a36", bellyS: [0.42, 0.16, 0.4], bellyY: 0.24, skinHead: null as string | null };
    case "trollkin":
      // broad and heavy: wide body, sunken small head, thick arms, big fists, tusks, stony back
      return { bodyS: [0.82, 0.74, 0.64], bodyY: 0.62, bodyTilt: 0.1, headS: [0.5, 0.42, 0.48], headY: 1.22, headZ: 0.2, ear: 0.1, earY: 1.3, earAngle: 1.3, cap: 0, armL: 0.62, armW: 1.7, hand: 0.24, legL: 0.36, legW: 1.6, legY: 0.17, eyeS: 0.085, eyeSep: 0.15, eyeY: 1.26, eyeZ: 0.42, nose: 0,
        color: c.variant > 0.6 ? "#8ea3c4" : c.variant > 0.3 ? "#7a92b5" : "#9a9aa6", accent: "#f3ead8", belly: "#5f5a66", bellyS: [0.5, 0.28, 0.5], bellyY: 0.42, skinHead: null };
    default:
      // mushroom folk: tall cream stem, a big spotted cap, small arms, round face low on the stem
      return { bodyS: [0.3, 0.62, 0.3], bodyY: 0.45, bodyTilt: 0, headS: [0.3, 0.26, 0.3], headY: 1.0, headZ: 0, ear: 0, earY: 0, earAngle: 0, cap: 0.95, armL: 0.36, armW: 0.75, hand: 0.1, legL: 0.24, legW: 0.8, legY: 0.11, eyeS: 0.1, eyeSep: 0.12, eyeY: 0.78, eyeZ: 0.27, nose: 0,
        color: "#efe3cc", accent: c.variant > 0.66 ? "#c9412f" : c.variant > 0.33 ? "#d9823a" : "#b9875a", belly: "#f7efe0", bellyS: [0.001, 0.001, 0.001], bellyY: 0, skinHead: null };
  }
}

export function Creatures() {
  const refs = useRef<Record<PartKey, THREE.InstancedMesh | null>>({ body: null, head: null, eyeL: null, eyeR: null, pupilL: null, pupilR: null, earL: null, earR: null, cap: null, armL: null, armR: null, legL: null, legR: null, item: null, hat: null, ring: null, handL: null, handR: null, belly: null, noseL: null, noseR: null, browL: null, browR: null });
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
      ring: new THREE.PlaneGeometry(1.4, 1.4),
      hand: new THREE.SphereGeometry(0.5, 8, 7),
      nose: new THREE.ConeGeometry(0.5, 1, 6),
      brow: new THREE.BoxGeometry(1, 0.22, 0.3),
    }),
    [],
  );
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  const prevStates = useRef(new Map<number, string>());
  // runic selection ring texture
  const ringTex = useMemo(() => {
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 256, 256);
    g.strokeStyle = "#ffffff";
    g.lineWidth = 7;
    g.beginPath();
    g.arc(128, 128, 104, 0, Math.PI * 2);
    g.stroke();
    g.lineWidth = 3;
    g.setLineDash([10, 9]);
    g.beginPath();
    g.arc(128, 128, 86, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(128 + Math.cos(a) * 98, 128 + Math.sin(a) * 98);
      g.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118);
      g.lineWidth = 5;
      g.stroke();
      g.beginPath();
      g.arc(128 + Math.cos(a + 0.39) * 86, 128 + Math.sin(a + 0.39) * 86, 4, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

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
      {mk("body", geos.body, <meshStandardMaterial roughness={0.88} />)}
      {mk("head", geos.head, <meshStandardMaterial roughness={0.88} />)}
      {mk("eyeL", geos.eye, <meshStandardMaterial roughness={0.35} color="#fffaf0" />, false)}
      {mk("eyeR", geos.eye, <meshStandardMaterial roughness={0.35} color="#fffaf0" />, false)}
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
      {mk("ring", geos.ring, <meshBasicMaterial map={ringTex ?? undefined} color="#ffffff" transparent opacity={0.95} side={THREE.DoubleSide} depthWrite={false} />, false)}
      {mk("handL", geos.hand, <meshStandardMaterial roughness={0.85} />, false)}
      {mk("handR", geos.hand, <meshStandardMaterial roughness={0.85} />, false)}
      {mk("belly", geos.head, <meshStandardMaterial roughness={0.9} />, false)}
      {mk("noseL", geos.nose, <meshStandardMaterial roughness={0.85} />, false)}
      {mk("noseR", geos.nose, <meshStandardMaterial roughness={0.85} />, false)}
      {mk("browL", geos.brow, <meshStandardMaterial roughness={0.9} color="#2b2118" />, false)}
      {mk("browR", geos.brow, <meshStandardMaterial roughness={0.9} color="#2b2118" />, false)}
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
  const S = c.scale * (c.species === "trollkin" ? 1.18 : c.species === "goblin" ? 0.98 : 1.06);
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
  if (c.blessedUntil > 0 && (getWorld()?.time ?? 0) < c.blessedUntil) skin.lerp(new THREE.Color("#ffe39a"), 0.18);
  if (c.mood === "scared") skin.lerp(new THREE.Color("#dfe6f0"), 0.12);
  if (c.health < 30) skin.lerp(new THREE.Color("#b8c0b0"), 0.3);
  const skinC = skin.clone();
  const accent = new THREE.Color(P.accent);

  // body (goblins hunch forward; everyone breathes)
  const breathe = walking ? 0 : Math.sin(t * 2.5 + i) * 0.025;
  setPart(R, "body", i, 0, P.bodyY, 0, P.bodyTilt, 0, 0, P.bodyS[0] * (1 + breathe * 0.5), P.bodyS[1] * (1 + breathe), P.bodyS[2], skinC);
  if (P.bellyS[0] > 0.01) setPart(R, "belly", i, 0, P.bellyY, P.bodyS[2] * 0.55, 0, 0, 0, P.bellyS[0], P.bellyS[1], P.bellyS[2], col.set(P.belly));
  else hide(R, "belly", i);
  // head
  const headNod = st === "socialise" ? Math.sin(t * 6) * 0.12 : st === "eat" ? Math.sin(t * 10) * 0.2 + 0.2 : st === "idle" ? Math.sin(t * 0.7 + i) * 0.15 : 0;
  const headYaw = st === "idle" ? Math.sin(t * 0.5 + i * 2) * 0.35 : 0;
  const hz = P.headZ;
  setPart(R, "head", i, 0, P.headY, hz, headNod, headYaw, 0, P.headS[0], P.headS[1], P.headS[2], skinC);
  // nose / tusks
  if (c.species === "goblin") {
    setPart(R, "noseL", i, Math.sin(headYaw) * (P.eyeZ + 0.1), P.eyeY - 0.1, hz + Math.cos(headYaw) * (P.eyeZ + 0.1), Math.PI / 2 + 0.2, headYaw, 0, P.nose, 0.22, P.nose, skinC.clone().offsetHSL(0, 0.05, -0.05));
    hide(R, "noseR", i);
  } else if (c.species === "trollkin") {
    const tz = hz + Math.cos(headYaw) * (P.eyeZ - 0.02);
    setPart(R, "noseL", i, -0.13 + Math.sin(headYaw) * P.eyeZ, P.eyeY - 0.2, tz, 0.3, headYaw, 0.15, 0.09, 0.22, 0.09, col.set(P.accent));
    setPart(R, "noseR", i, 0.13 + Math.sin(headYaw) * P.eyeZ, P.eyeY - 0.2, tz, 0.3, headYaw, -0.15, 0.09, 0.22, 0.09, col.set(P.accent));
  } else {
    hide(R, "noseL", i);
    hide(R, "noseR", i);
  }
  // eyes
  const scared = c.mood === "scared" || st === "held" || st === "thrown" || st === "flee";
  const sleepy = st === "rest";
  const eyeScale = P.eyeS * (scared ? 1.35 : 1);
  const eyeH = sleepy ? eyeScale * 0.15 : c.mood === "grumpy" ? eyeScale * 0.55 : eyeScale;
  const ex = Math.sin(headYaw) * P.eyeZ;
  const ez = hz + Math.cos(headYaw) * P.eyeZ;
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
  // brows: angry when grumpy/fighting, raised when scared
  const browTilt = st === "fight" || c.mood === "grumpy" ? 0.45 : scared ? -0.25 : 0.05;
  const browY = eyeY + eyeScale * 0.95 + (scared ? 0.03 : 0);
  if (c.species !== "mushroom" && !sleepy) {
    setPart(R, "browL", i, ex - Math.cos(headYaw) * P.eyeSep, browY, ez + Math.sin(headYaw) * P.eyeSep + 0.01, 0, headYaw, browTilt, eyeScale * 1.4, eyeScale * 0.5, eyeScale * 0.5);
    setPart(R, "browR", i, ex + Math.cos(headYaw) * P.eyeSep, browY, ez - Math.sin(headYaw) * P.eyeSep + 0.01, 0, headYaw, -browTilt, eyeScale * 1.4, eyeScale * 0.5, eyeScale * 0.5);
  } else {
    hide(R, "browL", i);
    hide(R, "browR", i);
  }
  // ears / cap
  if (P.ear > 0) {
    const flop = scared ? -0.3 : Math.sin(t * 3 + i) * 0.08;
    setPart(R, "earL", i, -P.headS[0] * 0.5, P.earY, hz, 0, 0, P.earAngle + flop, P.ear * 0.5, P.ear * 1.6, P.ear * 0.3, skinC);
    setPart(R, "earR", i, P.headS[0] * 0.5, P.earY, hz, 0, 0, -P.earAngle - flop, P.ear * 0.5, P.ear * 1.6, P.ear * 0.3, skinC);
  } else {
    hide(R, "earL", i);
    hide(R, "earR", i);
  }
  if (P.cap > 0) {
    setPart(R, "cap", i, 0, P.headY + 0.05, 0, headNod, headYaw, 0, P.cap * 1.45, P.cap * 0.95, P.cap * 1.45, accent);
    // cream spots on the cap
    setPart(R, "hat", i, 0.2 + Math.sin(c.variant * 9) * 0.05, P.headY + 0.36, 0.12, 0.2, 0, 0, 0.12, 0.05, 0.12, new THREE.Color("#fff3d6"));
  } else {
    hide(R, "cap", i);
    if (c.species === "goblin" && c.variant > 0.5) setPart(R, "hat", i, 0, P.headY + 0.3, hz, 0.1, 0, 0.1, 0.42, 0.5, 0.42, accent);
    else if (c.species === "trollkin") setPart(R, "hat", i, 0, P.bodyY + P.bodyS[1] * 0.75, -P.bodyS[2] * 0.6, -0.9, 0, 0, 0.42, 0.28, 0.42, new THREE.Color("#6a7688"));
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
  const ax = P.bodyS[0] * 0.95;
  // limbs pivot at the shoulder/hip: offset the capsule centre half a length down the rotated axis
  const pivot = (rx: number, rz: number, len: number) => ({ x: len * Math.sin(rz), y: -len * Math.cos(rz) * Math.cos(rx), z: -len * Math.cos(rz) * Math.sin(rx) });
  const halfArm = 0.8 * armS * 0.5;
  const pl = pivot(armLx, armLz, halfArm);
  const pr = pivot(armRx, armRz, halfArm);
  setPart(R, "armL", i, -ax + pl.x, shoulderY + pl.y, pl.z, armLx, 0, armLz, armS * P.armW, armS, armS * P.armW, skinC);
  setPart(R, "armR", i, ax + pr.x, shoulderY + pr.y, pr.z, armRx, 0, armRz, armS * P.armW, armS, armS * P.armW, skinC);
  // hands sit at the arm ends: capsule of length ~0.8*armS rotated by Euler(rx, 0, rz) about the shoulder
  const handAt = (sign: number, rx: number, rz: number) => {
    const L = 0.8 * armS * 0.5 + P.hand * 0.6;
    const ox = L * Math.sin(rz);
    const oy = -L * Math.cos(rz) * Math.cos(rx);
    const oz = -L * Math.cos(rz) * Math.sin(rx);
    setPart(R, sign > 0 ? "handR" : "handL", i, sign * ax + ox, shoulderY + oy, oz, rx * 0.5, 0, 0, P.hand, P.hand * 0.85, P.hand * 1.1, skinC.clone().offsetHSL(0, 0.03, 0.02));
  };
  handAt(-1, armLx, armLz);
  handAt(1, armRx, armRz);
  const legSwing = walking ? Math.sin(ph) * (c.species === "trollkin" ? 0.55 : 0.85) * Math.min(1, rc.speed) : st === "held" ? Math.sin(t * 6) * 0.5 : 0;
  const legS = P.legL / 0.8;
  const hipY = P.bodyY - P.bodyS[1] * 0.35;
  const halfLeg = 0.8 * legS * 0.5;
  const ll = pivot(legSwing, 0, halfLeg);
  const lr = pivot(-legSwing, 0, halfLeg);
  setPart(R, "legL", i, -P.bodyS[0] * 0.45, hipY + ll.y, ll.z, legSwing, 0, 0, legS * P.legW, legS, legS * P.legW, skinC.clone().offsetHSL(0, 0, -0.1));
  setPart(R, "legR", i, P.bodyS[0] * 0.45, hipY + lr.y, lr.z, -legSwing, 0, 0, legS * P.legW, legS, legS * P.legW, skinC.clone().offsetHSL(0, 0, -0.1));
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
      const rs = (selected ? 1.35 : 1.05) * S * (1 + Math.sin(t * 4) * 0.04);
      e.set(-Math.PI / 2, 0, selected ? t * 0.6 : 0);
      q.setFromEuler(e);
      m4.compose(v, q, new THREE.Vector3(rs, rs, rs));
      ring.setMatrixAt(i, m4);
      ring.setColorAt(i, col.set(selected ? "#ffcf6b" : "#fff2d0"));
    }
  } else hide(R, "ring", i);
  void cam;
}
