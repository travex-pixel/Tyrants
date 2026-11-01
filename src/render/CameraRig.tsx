"use client";
import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cameraCtl } from "./cameraCtl";
import { getWorld } from "./context";
import { heightAt } from "@/src/sim/terrain";
import { useGame } from "@/src/store/game";
import { renderCreatures } from "./context";

export function CameraRig() {
  const { camera } = useThree();
  useEffect(() => {
    cameraCtl.camera = camera as THREE.PerspectiveCamera;
    const w = getWorld();
    if (w) {
      // bounds that cover all islands
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const i of w.islands) {
        minX = Math.min(minX, i.ox);
        maxX = Math.max(maxX, i.ox + i.size);
        minZ = Math.min(minZ, i.oz);
        maxZ = Math.max(maxZ, i.oz + i.size);
      }
      cameraCtl.bounds = { minX: minX - 10, maxX: maxX + 10, minZ: minZ - 10, maxZ: maxZ + 10 };
    }
  }, [camera]);

  useFrame((state, dt) => {
    const w = getWorld();
    const cam = camera as THREE.PerspectiveCamera;
    const store = useGame.getState();
    // focus requests from UI
    if (store.cameraFocus && store.cameraFocus.t > cameraCtl.lastFocus) {
      cameraCtl.lastFocus = store.cameraFocus.t;
      cameraCtl.focus(store.cameraFocus.x, store.cameraFocus.z, store.cameraFocus.zoom);
    }
    // follow selected creature
    if (store.followCreature && store.selectedCreature !== null) {
      const rc = renderCreatures.get(store.selectedCreature);
      if (rc) {
        cameraCtl.desired.x = rc.x;
        cameraCtl.desired.z = rc.z;
      }
    }
    let gy = 1;
    if (w) {
      for (const isl of w.islands) {
        const h = heightAt(isl, cameraCtl.target.x, cameraCtl.target.z);
        if (h > -0.5) {
          gy = Math.max(h, isl.waterLevel);
          break;
        }
      }
    }
    if (cameraCtl.intro) {
      const it = cameraCtl.intro;
      it.t += dt;
      const p = Math.min(1, it.t / it.duration);
      const ease = 1 - Math.pow(1 - p, 3);
      // descend from the clouds, slowly orbiting in
      cameraCtl.dist = THREE.MathUtils.lerp(150, cameraCtl.desiredDist, ease);
      cameraCtl.yaw = THREE.MathUtils.lerp(cameraCtl.desiredYaw - 1.2, cameraCtl.desiredYaw, ease);
      cameraCtl.target.x += (cameraCtl.desired.x - cameraCtl.target.x) * Math.min(1, dt * 2);
      cameraCtl.target.z += (cameraCtl.desired.z - cameraCtl.target.z) * Math.min(1, dt * 2);
      cameraCtl.target.y += (gy - cameraCtl.target.y) * Math.min(1, dt * 2);
      const fog = state.scene.fog as THREE.Fog | null;
      if (fog) {
        fog.near = THREE.MathUtils.lerp(2, 120, ease);
        fog.far = THREE.MathUtils.lerp(40, 480, ease);
      }
      if (p >= 1) cameraCtl.intro = null;
    } else {
      cameraCtl.update(dt, gy);
      const fog = state.scene.fog as THREE.Fog | null;
      if (fog) {
        fog.near += (120 - fog.near) * Math.min(1, dt);
        fog.far += (480 - fog.far) * Math.min(1, dt);
      }
    }
    cameraCtl.apply(cam, state.clock.elapsedTime);
  });
  return null;
}
