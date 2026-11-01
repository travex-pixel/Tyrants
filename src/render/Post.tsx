"use client";
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { useGame } from "@/src/store/game";

/** Final grade: gentle warm lift, soft contrast, vignette. Runs before the output (tone-mapping) pass. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, warmth: { value: 0.03 }, vignette: { value: 0.3 }, contrast: { value: 1.12 }, saturation: { value: 1.0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float warmth; uniform float vignette; uniform float contrast; uniform float saturation; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      // warm lift in the shadows, cool nothing: a golden-hour film look
      col += vec3(warmth, warmth * 0.55, -warmth * 0.35) * (1.0 - clamp(dot(col, vec3(0.333)), 0.0, 1.0)) * 0.6;
      col = (col - 0.5) * contrast + 0.5;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation);
      vec2 d = vUv - 0.5;
      float v = 1.0 - smoothstep(0.35, 0.95, dot(d, d) * 2.2) * vignette;
      gl_FragColor = vec4(col * v, c.a);
    }`,
};

export function Post() {
  const { gl, scene, camera, size } = useThree();
  const quality = useGame((s) => s.settings.quality);
  const enabled = quality === "high";
  const composer = useMemo(() => {
    if (!enabled) return null;
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.16, 0.5, 0.9);
    c.addPass(bloom);
    c.addPass(new ShaderPass(GradeShader));
    c.addPass(new OutputPass());
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, gl, scene, camera]);
  useEffect(() => {
    if (!composer) return;
    composer.setSize(size.width, size.height);
    composer.setPixelRatio(gl.getPixelRatio());
  }, [composer, size, gl]);
  useEffect(() => () => composer?.dispose(), [composer]);
  useFrame(() => {
    if (composer) composer.render();
    else gl.render(scene, camera);
  }, 1);
  return null;
}
