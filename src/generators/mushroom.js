// Mushroom generator — a hand-thrown wobbly cap on a leaning stem, with
// freckles and gills, grown in cosy clusters of mixed sizes.

import * as THREE from 'three';
import { Rng, fbm3 } from '../rng.js';
import {
  taperedTube, latheWobbled, xform, paintGradient, paintFlat, setBend, setPhase,
  finalize, mergeToMesh, shiftHex, lerp, clamp01, TAU, GOLDEN,
} from './common.js';

const UP = new THREE.Vector3(0, 1, 0);

function buildShroom(parts, p, rng, noiseSeed) {
  const sh = Math.max(0.05, rng.jitter(p.stemHeight, 0.2));
  const thick = rng.jitter(p.stemThick, 0.15);
  const leanA = rng.float(0, TAU);
  const leanAmt = p.stemLean * sh * 0.55 * rng.float(0.5, 1.2);
  const lx = Math.cos(leanA) * leanAmt, lz = Math.sin(leanA) * leanAmt;
  const pts = [
    [0, -0.03, 0],
    [lx * 0.25, sh * 0.5, lz * 0.25],
    [lx, sh, lz],
  ];
  const curve = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(...v)));

  const stem = taperedTube(pts, (t) => thick * (1 + p.stemBulge * 0.9 * (1 - t) * (1 - t)) * lerp(1, 0.82, t), {
    radialSegs: 8,
    rings: 8,
  });
  paintGradient(stem, shiftHex(p.stemColor, -0.05), shiftHex(p.stemColor, 0.04), { axis: 'y', length: sh, rng, jitter: 0.05 });
  const phase = rng.float(0, 1);
  setBend(stem, (x, y) => Math.pow(clamp01(y / sh), 1.6) * 0.18);
  setPhase(stem, phase);
  parts.push(finalize(stem));

  // cap
  const capR = Math.max(0.05, rng.jitter(p.capRadius, 0.12));
  const capH = Math.max(0.03, rng.jitter(p.capHeight, 0.15));
  const e = lerp(3.4, 1.12, p.profile); // big exponent = flat plate, small = pointy bell
  const rows = [];
  const rowCount = 7;
  for (let i = 0; i <= rowCount; i++) {
    const t = i / rowCount;
    rows.push({ x: Math.max(0.012, capR * Math.pow(t, 0.85)), y: capH * (1 - Math.pow(t, e)) });
  }
  if (p.flare > 0.02) {
    rows.push({ x: capR * 1.02, y: -capH * 0.1 * p.flare });
    rows.push({ x: capR * 0.9, y: -capH * 0.22 * p.flare });
  }
  const lobes = rng.int(4, 7);
  const lobePhase = rng.float(0, TAU);
  const wobbleFn = (cx, sx, row) => {
    const a = Math.atan2(sx, cx);
    const wave = Math.sin(a * lobes + lobePhase + row * 0.5) * 0.08;
    const grain = (fbm3(cx * 1.6 + 5, row * 0.45, sx * 1.6 + 5, 2, noiseSeed) - 0.5) * 0.22;
    return 1 + p.wobble * (wave + grain);
  };
  const cap = latheWobbled(rows, 16, wobbleFn, true);
  paintGradient(cap, shiftHex(p.capColor, -0.1), shiftHex(p.capColor, 0.07), { axis: 'y', length: capH, rng, jitter: 0.05 });
  const capBend = 0.1 + clamp01(sh) * 0.12;
  setBend(cap, capBend);
  setPhase(cap, phase);

  const tip = curve.getPointAt(1);
  const tangent = curve.getTangentAt(1);
  const capQuat = new THREE.Quaternion().setFromUnitVectors(UP, tangent.clone().lerp(UP, 0.35).normalize());
  xform(cap, { pos: tip.toArray(), quat: capQuat });
  parts.push(finalize(cap));

  // gills — a shallow dark cone tucked under the rim
  const gills = latheWobbled(
    [
      { x: capR * 0.86, y: -capH * 0.1 - 0.005 },
      { x: Math.max(0.02, thick * 1.05), y: 0.01 },
    ],
    16,
    null,
    false
  );
  paintFlat(gills, shiftHex(p.capColor, -0.28, -0.12), { rng, jitter: 0.04 });
  setBend(gills, capBend);
  setPhase(gills, phase);
  xform(gills, { pos: tip.toArray(), quat: capQuat });
  parts.push(finalize(gills));

  // freckles sitting on the cap surface
  const spotCount = Math.round(p.spots * 13 * (capR / 0.3));
  for (let i = 0; i < spotCount; i++) {
    const t = rng.float(0.15, 0.78);
    const az = rng.float(0, TAU);
    const cx = Math.cos(az), sx = Math.sin(az);
    const r = capR * Math.pow(t, 0.85) * wobbleFn(cx, sx, t * rowCount);
    const y = capH * (1 - Math.pow(t, e));
    const normal = new THREE.Vector3(cx * t, 1 - t * 0.55, sx * t).normalize();
    const spot = new THREE.SphereGeometry(capR * rng.float(0.08, 0.17), 6, 5);
    xform(spot, { scale: [1, 0.35, 1] });
    paintFlat(spot, p.spotColor, { rng, jitter: 0.05 });
    setBend(spot, capBend);
    setPhase(spot, phase);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, normal);
    xform(spot, { pos: [cx * r + normal.x * 0.008, y + normal.y * 0.008, sx * r + normal.z * 0.008], quat: q });
    xform(spot, { pos: tip.toArray(), quat: capQuat });
    parts.push(finalize(spot));
  }
}

export function generateMushroom(p, seed, { ghost = false } = {}) {
  const rng = new Rng(seed);
  const noiseSeed = seed ^ 0x9e3779b9;
  const parts = [];
  const n = p.clusterCount;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const r = i === 0 ? 0 : (p.spread + p.capRadius) * (0.5 + 0.6 * Math.sqrt(t)) * (1 + rng.spread(0.3));
    const a = i * GOLDEN + rng.spread(0.7);
    const scale = i === 0 ? rng.float(0.95, 1.1) : rng.float(lerp(0.85, 0.32, p.sizeVar), lerp(1.05, 0.72, p.sizeVar));
    const tiltOut = i === 0 ? 0 : rng.float(0.05, 0.22); // outer ones lean away from the middle
    const start = parts.length;
    buildShroom(parts, p, rng, noiseSeed + i * 17);
    for (let j = start; j < parts.length; j++) {
      xform(parts[j], { rotZ: -tiltOut }); // lean before facing outward
      xform(parts[j], { pos: [Math.cos(a) * r, 0, Math.sin(a) * r], rotY: -a + Math.PI, scale });
    }
  }
  const mesh = mergeToMesh(parts, { ghost });
  mesh.receiveShadow = true;
  mesh.userData.footprint = p.spread + p.capRadius;
  return mesh;
}
