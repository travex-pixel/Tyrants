import * as THREE from "three";

/** Imperative camera controller shared by the input layer and the CameraRig component. */
class CameraController {
  target = new THREE.Vector3(32, 1.5, 32);
  desired = new THREE.Vector3(32, 1.5, 32);
  dist = 52;
  desiredDist = 52;
  yaw = 0.6;
  desiredYaw = 0.6;
  minDist = 12;
  maxDist = 115;
  bounds = { minX: -40, maxX: 110, minZ: -40, maxZ: 110 };
  intro: { t: number; duration: number } | null = null;
  camera: THREE.PerspectiveCamera | null = null;
  followId: number | null = null;
  shake = 0;
  lastFocus = 0;

  pitchFor(d: number) {
    const t = THREE.MathUtils.clamp((d - this.minDist) / (this.maxDist - this.minDist), 0, 1);
    return THREE.MathUtils.lerp(0.72, 0.98, Math.pow(t, 0.8));
  }

  pan(dxPixels: number, dyPixels: number, viewportH: number) {
    const k = (this.dist * 1.1) / viewportH;
    const dx = dxPixels * k;
    const dz = dyPixels * k;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    // move in camera-relative ground directions
    this.desired.x += -dx * cos - dz * sin;
    this.desired.z += dx * sin - dz * cos;
    this.clampTarget();
    this.followId = null;
  }
  clampTarget() {
    this.desired.x = THREE.MathUtils.clamp(this.desired.x, this.bounds.minX, this.bounds.maxX);
    this.desired.z = THREE.MathUtils.clamp(this.desired.z, this.bounds.minZ, this.bounds.maxZ);
  }
  rotate(dYaw: number) {
    this.desiredYaw += dYaw;
  }
  zoom(factor: number) {
    this.desiredDist = THREE.MathUtils.clamp(this.desiredDist * factor, this.minDist, this.maxDist);
  }
  focus(x: number, z: number, dist?: number) {
    this.desired.x = x;
    this.desired.z = z;
    if (dist) this.desiredDist = THREE.MathUtils.clamp(dist, this.minDist, this.maxDist);
    this.clampTarget();
  }
  snap() {
    this.target.copy(this.desired);
    this.dist = this.desiredDist;
    this.yaw = this.desiredYaw;
  }
  /** Smoothly settle toward desired values. */
  update(dt: number, groundY: number) {
    const k = 1 - Math.pow(0.0008, dt);
    this.target.x += (this.desired.x - this.target.x) * k;
    this.target.z += (this.desired.z - this.target.z) * k;
    this.target.y += (groundY - this.target.y) * Math.min(1, dt * 5);
    this.dist += (this.desiredDist - this.dist) * k;
    this.yaw += (this.desiredYaw - this.yaw) * k;
    this.shake = Math.max(0, this.shake - dt * 2.5);
  }
  apply(cam: THREE.PerspectiveCamera, time: number) {
    const pitch = this.pitchFor(this.dist);
    const cp = Math.cos(pitch);
    const sx = Math.sin(this.yaw) * cp * this.dist;
    const sz = Math.cos(this.yaw) * cp * this.dist;
    const sy = Math.sin(pitch) * this.dist;
    const shakeX = this.shake > 0 ? Math.sin(time * 60) * this.shake * 0.4 : 0;
    const shakeY = this.shake > 0 ? Math.cos(time * 53) * this.shake * 0.3 : 0;
    cam.position.set(this.target.x + sx + shakeX, this.target.y + sy + shakeY, this.target.z + sz);
    cam.lookAt(this.target.x, this.target.y + 0.5, this.target.z);
  }
}

export const cameraCtl = new CameraController();
