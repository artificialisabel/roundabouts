// Garden pond — a raised stone-rimmed basin that sits ON the bed (the bed
// mesh stays untouched; depth is painted, not dug). The basin merges into the
// one raycastable parent mesh; the water surface and any koi / jellies /
// lilies ride along as children, animated purely by the pond shader patches.
// Creature looks are rolled from the pond's growth seed — "re-pot" restocks.

import * as THREE from 'three';
import { Rng } from '../rng.js';
import {
  discGeometry, xform, finalize, paintByPosition, setBend, setPhase,
  clamp01, lerp, TAU, GOLDEN,
} from './common.js';
import { plantMaterial, ghostMaterial, srgbLinear } from '../materials.js';
import { generateFish } from '../pond/generators/fish.js';
import { generateJelly } from '../pond/generators/jelly.js';
import { generateLily } from '../pond/generators/lily.js';
import { defaultParams as pondDefaults } from '../pond/params.js';

// the garden pond schema carries the creature params with koi_/jel_/lil_
// prefixes; strip them back into a full param set for the pond generators
function creatureParams(p, prefix, type) {
  const out = pondDefaults(type);
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith(prefix)) out[k.slice(prefix.length)] = v;
  }
  return out;
}
import { makeWaterSurfaceMaterial } from '../pond/materials.js';
import { paintByPositionA } from '../pond/water-common.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const waterMaterial = makeWaterSurfaceMaterial();

const WALL_H = 0.2;
const WATER_H = 0.16;

function buildBasin(p, rng) {
  const R = p.radius;
  const parts = [];

  // bowl floor — geometrically shallow, painted deep
  const floor = discGeometry(R * 0.98, { rings: 5, segs: 36 });
  const deep = srgbLinear(p.waterColor).multiplyScalar(lerp(0.55, 0.22, p.depth));
  const shore = srgbLinear(p.waterColor).lerp(srgbLinear('#c9b489'), 0.55);
  paintByPosition(floor, (c, x, y, z) => {
    const t = clamp01(Math.hypot(x, z) / R);
    c.copy(deep).lerp(shore, Math.pow(t, lerp(3.2, 1.6, p.depth)));
    c.multiplyScalar(1 + rng.spread(0.04));
  });
  xform(floor, { pos: [0, 0.055, 0] });
  parts.push(finalize(floor));

  // outer wall ring
  const wall = new THREE.CylinderGeometry(R + 0.06, R + 0.12, WALL_H, 30, 1, true);
  const stoneC = new THREE.Color().setHSL(0.09 + rng.spread(0.02), 0.16, 0.58 + rng.spread(0.05), THREE.SRGBColorSpace);
  paintByPosition(wall, (c) => c.copy(stoneC).multiplyScalar(1 + rng.spread(0.05)));
  xform(wall, { pos: [0, WALL_H / 2, 0] });
  parts.push(finalize(wall));

  // pebble rim
  const count = Math.max(10, Math.round(R * 14));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.spread(0.04);
    const s = (0.1 + R * 0.045) * rng.float(0.8, 1.25);
    const peb = new THREE.SphereGeometry(s, 6, 5);
    xform(peb, {
      pos: [Math.cos(a) * (R + 0.06), WALL_H + s * 0.25, Math.sin(a) * (R + 0.06)],
      rotY: rng.float(0, TAU),
      scale: [1.25 + rng.spread(0.2), 0.6, 0.85 + rng.spread(0.15)],
    });
    const tint = stoneC.clone().offsetHSL(rng.spread(0.02), rng.spread(0.04), rng.spread(0.07));
    paintByPosition(peb, (c) => c.copy(tint).multiplyScalar(1 + rng.spread(0.04)));
    parts.push(finalize(peb));
  }

  return mergeGeometries(parts, false);
}

function buildWater(p, rng) {
  const R = p.radius;
  const water = discGeometry(R * 0.985, { rings: 6, segs: 36 });
  const centre = srgbLinear(p.waterColor).multiplyScalar(lerp(0.9, 0.6, p.depth));
  const edge = srgbLinear(p.waterColor).lerp(srgbLinear('#cfe0d6'), 0.35);
  paintByPositionA(water, (c, x, y, z) => {
    const t = clamp01(Math.hypot(x, z) / R);
    c.copy(centre).lerp(edge, Math.pow(t, 2.2));
    return lerp(0.86, 0.55, Math.pow(t, 1.6)) * lerp(1, 0.9, 1 - p.depth);
  });
  setBend(water, 0);
  setPhase(water, rng.float(0, 1));
  const mesh = new THREE.Mesh(water.index ? water.toNonIndexed() : water, waterMaterial);
  mesh.position.y = WATER_H;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  return mesh;
}

export function generatePond(p, seed, { ghost = false } = {}) {
  const rng = new Rng(seed);
  const R = p.radius;

  const basin = buildBasin(p, rng);
  const parent = new THREE.Mesh(basin, ghost ? ghostMaterial : plantMaterial);
  parent.castShadow = true;
  parent.receiveShadow = true;
  parent.userData.footprint = R + 0.3;

  parent.add(buildWater(p, rng));
  if (ghost) return parent;

  // ---- koi, circling in place on the swim-wave — your design, seed-jittered
  const koiParams = creatureParams(p, 'koi_', 'fish');
  for (let i = 0; i < p.koiCount; i++) {
    const fish = generateFish(koiParams, rng.int(1, 0xfffffff), {});
    const want = Math.min(R * 0.52, koiParams.bodyLen * rng.float(0.85, 1.12));
    fish.scale.setScalar(want / (fish.userData.bodyLen || 1));
    const a = i * GOLDEN + rng.spread(0.5);
    const rr = R * rng.float(0.3, 0.62);
    fish.position.set(Math.cos(a) * rr, 0.1, Math.sin(a) * rr);
    fish.rotation.y = -a + (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) + rng.spread(0.3);
    parent.add(fish);
  }

  // ---- moon jellies drifting just under the surface
  const jellyParams = creatureParams(p, 'jel_', 'jelly');
  for (let i = 0; i < p.jellyCount; i++) {
    const jelly = generateJelly(jellyParams, rng.int(1, 0xfffffff), {});
    const want = Math.min(R * 0.24, jellyParams.bellSize * rng.float(0.85, 1.15));
    jelly.scale.setScalar(want / (jelly.userData.bellR || 1));
    const a = rng.float(0, TAU);
    const rr = R * rng.float(0.15, 0.5);
    jelly.position.set(Math.cos(a) * rr, 0.105, Math.sin(a) * rr);
    jelly.rotation.y = rng.float(0, TAU);
    parent.add(jelly);
  }

  // ---- lily rafts on the surface
  const lilyParams = creatureParams(p, 'lil_', 'lily');
  for (let i = 0; i < p.lilyCount; i++) {
    const lily = generateLily(lilyParams, rng.int(1, 0xfffffff), {});
    const native = lily.userData.footprint || 1;
    const want = Math.min(R * 0.42, native * rng.float(0.8, 1.05));
    lily.scale.setScalar(want / native);
    const a = i * GOLDEN + 1.3 + rng.spread(0.6);
    const rr = R * rng.float(0.3, 0.68);
    lily.position.set(Math.cos(a) * rr, WATER_H + 0.005, Math.sin(a) * rr);
    lily.rotation.y = rng.float(0, TAU);
    parent.add(lily);
  }

  return parent;
}
