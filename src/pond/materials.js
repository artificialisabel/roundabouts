// Pond materials — the garden's one-toon-material philosophy, underwater.
// Geometry still carries all colour in vertex colours (RGBA where things are
// glassy) plus the same two custom attributes:
//   aBend  — how much the water moves a vertex (for koi it is baked in body
//            lengths, so a big fish sweeps a big tail)
//   aPhase — per-part random phase so nothing sways in lockstep
// Three different motions are injected via onBeforeCompile: a travelling
// swim-wave for fish, a slow pulse for jellies, a gentle bob for lilies.

import * as THREE from 'three';
import { toonRamp } from '../materials.js';

export const waterUniforms = {
  uTime: { value: 0 },
  uCurrent: { value: 0.5 },
  uRain: { value: 0 }, // weather: rain pits and quickens the surface
};

const HEADER = `attribute float aBend;\nattribute float aPhase;\nuniform float uTime;\nuniform float uCurrent;\n`;

function patch(material, key, body) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.uniforms.uCurrent = waterUniforms.uCurrent;
    shader.vertexShader = HEADER + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n{\n${body}\n}`
    );
  };
  material.customProgramCacheKey = () => key;
  return material;
}

// koi: a travelling wave runs nose (+z) to tail (-z) in object space, so the
// fish flexes laterally no matter which way it is heading. amplitude lives in
// aBend (baked ∝ body length by the generator).
const SWIM = `
  float ph = aPhase * 6.2831 + (modelMatrix[3][0] + modelMatrix[3][2]) * 1.31;
  float wave = sin(uTime * 5.2 + transformed.z * 2.4 + ph)
             + 0.35 * sin(uTime * 8.1 + transformed.z * 3.7 + ph * 1.7);
  transformed.x += wave * aBend * (0.55 + 0.45 * uCurrent);
`;

// jelly: the bell breathes (rim in and out, a little lift), tentacles trail
// in the current. both ride the same aBend, which is ~0 at the apex, ~0.5 at
// the rim and →1 down the tentacles.
const PULSE = `
  float ph = aPhase * 6.2831 + (modelMatrix[3][0] + modelMatrix[3][2]) * 0.9;
  float pulse = sin(uTime * 1.5 + ph);
  float squeeze = 1.0 + 0.09 * pulse * min(aBend, 0.6);
  transformed.x *= squeeze;
  transformed.z *= squeeze;
  transformed.y += 0.05 * pulse * aBend;
  float amp = (0.1 + 0.3 * uCurrent) * aBend * aBend;
  transformed.x += sin(uTime * 0.8 + ph + transformed.y * 2.0) * amp;
  transformed.z += cos(uTime * 0.66 + ph * 1.3 + transformed.y * 1.7) * amp * 0.7;
`;

// lily: pads and petals bob on the water and lean with the current.
const BOB = `
  float ph = aPhase * 6.2831 + (modelMatrix[3][0] + modelMatrix[3][2]) * 0.53;
  transformed.y += sin(uTime * 0.9 + ph) * 0.02 * (0.3 + aBend);
  float sw = sin(uTime * 1.3 + ph * 1.7) * uCurrent * 0.05 * aBend * aBend;
  transformed.x += sw;
  transformed.z += sw * 0.6;
`;

function makeToon({ ghost = false, glassy = false } = {}) {
  const mat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonRamp,
    side: THREE.DoubleSide,
  });
  if (ghost) {
    mat.transparent = true;
    mat.opacity = 0.5;
    mat.depthWrite = false;
  }
  if (glassy) {
    mat.transparent = true; // per-vertex alpha rides in the RGBA colour attribute
    mat.depthWrite = false;
  }
  return mat;
}

export const fishMaterial = patch(makeToon(), 'pond-swim', SWIM);
export const fishGhostMaterial = patch(makeToon({ ghost: true }), 'pond-swim', SWIM);
export const jellyMaterial = patch(makeToon({ glassy: true }), 'pond-pulse', PULSE);
export const jellyGhostMaterial = patch(makeToon({ glassy: true, ghost: true }), 'pond-pulse', PULSE);
export const lilyMaterial = patch(makeToon(), 'pond-bob', BOB);
export const lilyGhostMaterial = patch(makeToon({ ghost: true }), 'pond-bob', BOB);

// the water surface — translucent, painted in RGBA vertex colours, with a
// slow criss-cross ripple so the glints and lily shadows wander a little.
export function makeWaterSurfaceMaterial() {
  const mat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonRamp,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.uniforms.uCurrent = waterUniforms.uCurrent;
    shader.uniforms.uRain = waterUniforms.uRain;
    shader.vertexShader = `uniform float uTime;\nuniform float uCurrent;\nuniform float uRain;\n` + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        float k = 0.5 + 0.8 * uCurrent;
        transformed.y += ( sin(position.x * 2.1 + uTime * 0.7)
                         + sin(position.z * 1.7 + uTime * 0.9)
                         + sin((position.x + position.z) * 1.2 + uTime * 0.5) ) * 0.013 * k;
        // rain pits the surface with quick little rings
        transformed.y += ( sin(position.x * 9.0 + uTime * 6.3)
                         * sin(position.z * 8.1 + uTime * 5.1)
                         + 0.6 * sin((position.x - position.z) * 11.0 + uTime * 7.7) )
                         * 0.011 * uRain;
      }`
    );
  };
  mat.customProgramCacheKey = () => 'pond-water';
  return mat;
}
