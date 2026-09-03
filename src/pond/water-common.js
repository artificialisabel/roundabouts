// Pond additions to the garden's geometry kitchen (../generators/common.js):
// RGBA vertex painting for glassy things, and a merge that takes whichever
// pond material fits. Everything still ends up non-indexed with one shared
// attribute set per specimen so a whole creature merges into ONE mesh.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { srgbLinear } from '../materials.js';
import { clamp01, setBend, setPhase } from '../generators/common.js';

// flat RGBA
export function paintFlatA(geom, hex, alpha, { rng = null, jitter = 0.06 } = {}) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  const c = srgbLinear(hex);
  for (let i = 0; i < pos.count; i++) {
    const k = rng ? 1 + rng.spread(jitter) : 1;
    colors[i * 4] = c.r * k;
    colors[i * 4 + 1] = c.g * k;
    colors[i * 4 + 2] = c.b * k;
    colors[i * 4 + 3] = clamp01(alpha);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return geom;
}

// RGBA gradient along an axis between two coordinates (handles descending
// ranges, e.g. tentacles hanging from y=0 down to y=-len)
export function paintGradientA(geom, cA, cB, aA, aB, { axis = 'y', from = 0, to = 1, rng = null, jitter = 0.05, curve = 1 } = {}) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  const ca = srgbLinear(cA), cb = srgbLinear(cB);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const coord = axis === 'x' ? pos.getX(i) : axis === 'y' ? pos.getY(i) : pos.getZ(i);
    const t = Math.pow(clamp01((coord - from) / (to - from || 1e-6)), curve);
    tmp.copy(ca).lerp(cb, t);
    const k = rng ? 1 + rng.spread(jitter) : 1;
    colors[i * 4] = tmp.r * k;
    colors[i * 4 + 1] = tmp.g * k;
    colors[i * 4 + 2] = tmp.b * k;
    colors[i * 4 + 3] = clamp01(aA + (aB - aA) * t);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return geom;
}

// paint each vertex via fn(colorOut, x, y, z) -> alpha
export function paintByPositionA(geom, fn) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 4);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const a = fn(tmp, pos.getX(i), pos.getY(i), pos.getZ(i));
    colors[i * 4] = tmp.r;
    colors[i * 4 + 1] = tmp.g;
    colors[i * 4 + 2] = tmp.b;
    colors[i * 4 + 3] = clamp01(a ?? 1);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  return geom;
}

// like common.js finalize but expects the part to be painted already
// (RGB or RGBA — just keep it consistent within one specimen)
export function finalizePond(geom, { bend = 0, phase = 0 } = {}) {
  if (!geom.attributes.aBend) setBend(geom, bend);
  if (!geom.attributes.aPhase) setPhase(geom, phase);
  let g = geom;
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

export function mergeToPondMesh(parts, material, { shadow = true } = {}) {
  const merged = mergeGeometries(parts, false);
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = false;
  return mesh;
}
