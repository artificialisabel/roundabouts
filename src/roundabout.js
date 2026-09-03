// A roundabout — the domed bed, pebble curb, ring road and signpost that sit
// at every intersection. Parameterized by centre so the neighborhood can hold
// many of them. (Extracted from the old single-garden environment.js.)

import * as THREE from 'three';
import { Rng, fbm3 } from './rng.js';
import { groundMaterial, srgbLinear } from './materials.js';
import { discGeometry, xform, finalize, paintByPosition, clamp01, TAU } from './generators/common.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BED_R = 5.5;
export const RING_OUTER = 8;
export const ROAD_W = 6.4; // straight streets, matches the ring's mouth
const BED_DOME = 0.38;

export function bedLocalHeight(r) {
  const t = clamp01(1 - (r / BED_R) ** 2);
  return BED_DOME * Math.pow(t, 1.35);
}

export function buildRoundabout({ cx, cz, key, vacant = false, seed = 1 }) {
  const rng = new Rng((seed ^ 0x50ad) >>> 0 || 7);
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);

  // the bed
  const bed = discGeometry(BED_R, { rings: 12, segs: 44, yFn: (r) => bedLocalHeight(r) });
  const gA = srgbLinear(vacant ? '#c2a887' : '#9db07c');
  const gB = srgbLinear(vacant ? '#b39a79' : '#8aa06d');
  const gC = srgbLinear(vacant ? '#cdb593' : '#b2bd8a');
  const soil = srgbLinear('#a68e6e');
  paintByPosition(bed, (c, x, y, z) => {
    const n = fbm3(x * 0.7 + cx, 0, z * 0.7 + cz, 3, 11);
    const n2 = fbm3(x * 2.4 + 9, 0, z * 2.4 + 9, 2, 23);
    c.copy(gA).lerp(gB, clamp01(n * 1.6 - 0.3)).lerp(gC, clamp01(n2 * 1.4 - 0.55) * 0.6);
    const rim = clamp01((Math.hypot(x, z) - BED_R * 0.8) / (BED_R * 0.2));
    c.lerp(soil, rim * 0.4);
  });
  const bedMesh = new THREE.Mesh(finalize(bed), groundMaterial);
  bedMesh.receiveShadow = true;
  bedMesh.userData.roundaboutKey = key;
  group.add(bedMesh);

  // pebble curb
  const pebbles = [];
  const count = 30;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.spread(0.02);
    const r = BED_R + 0.24 + rng.spread(0.04);
    const s = rng.float(0.24, 0.34);
    const peb = new THREE.SphereGeometry(s, 6, 5);
    xform(peb, {
      pos: [Math.cos(a) * r, s * 0.32, Math.sin(a) * r],
      rotY: rng.float(0, TAU),
      scale: [1.25 + rng.spread(0.2), 0.55, 0.8 + rng.spread(0.15)],
    });
    const stone = new THREE.Color().setHSL(0.08 + rng.spread(0.03), 0.14 + rng.spread(0.05), 0.62 + rng.spread(0.08), THREE.SRGBColorSpace);
    paintByPosition(peb, (c) => c.copy(stone).multiplyScalar(1 + rng.spread(0.04)));
    pebbles.push(finalize(peb));
  }
  const curb = new THREE.Mesh(mergeGeometries(pebbles, false), groundMaterial);
  curb.castShadow = true;
  curb.receiveShadow = true;
  group.add(curb);

  // (no ring road — the bed floats in the mist; the appearing path circles it)

  // signpost at the bed's edge — a small garden marker
  const signAngle = Math.PI * 0.78;
  const signPos = new THREE.Vector3(Math.cos(signAngle) * (BED_R + 0.85), 0, Math.sin(signAngle) * (BED_R + 0.85));
  const parts = [];
  const post = new THREE.CylinderGeometry(0.045, 0.06, 1.5, 6);
  xform(post, { pos: [signPos.x, 0.75, signPos.z], rotY: rng.float(0, TAU) });
  paintByPosition(post, (c) => c.copy(srgbLinear('#8a6f5c')).multiplyScalar(1 + rng.spread(0.05)));
  parts.push(finalize(post));
  const board = new THREE.BoxGeometry(0.72, 0.4, 0.05);
  xform(board, { pos: [signPos.x, 1.42, signPos.z], rotY: -signAngle + Math.PI / 2 + rng.spread(0.06), rotZ: rng.spread(0.04) });
  paintByPosition(board, (c) => c.copy(srgbLinear(vacant ? '#d9c4a5' : '#efe2c8')).multiplyScalar(1 + rng.spread(0.04)));
  parts.push(finalize(board));
  const sign = new THREE.Mesh(mergeGeometries(parts, false), groundMaterial);
  sign.castShadow = true;
  group.add(sign);

  return {
    key,
    group,
    bedMesh,
    center: { x: cx, z: cz },
    vacant,
    signAnchor: new THREE.Vector3(cx + signPos.x, 1.15, cz + signPos.z),
    signBoardCenter: new THREE.Vector3(cx + signPos.x, 1.42, cz + signPos.z),
    signBoardYaw: -signAngle + Math.PI / 2,
    heightAt: (x, z) => bedLocalHeight(Math.hypot(x - cx, z - cz)),
    dispose() {
      group.traverse((o) => o.geometry?.dispose?.());
      group.removeFromParent();
    },
  };
}
