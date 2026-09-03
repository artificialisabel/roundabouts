// Flower generator — petals around a centre, blooms arranged on a stalk
// (single / spike like a foxglove / cluster ball like a hydrangea), grown
// in a patch of several stalks.

import * as THREE from 'three';
import { Rng } from '../rng.js';
import {
  buildBlade, taperedTube, xform, paintGradient, paintFlat, setBend, setPhase,
  finalize, mergeToMesh, clusterOffsets, shiftHex, lerp, clamp01, TAU, GOLDEN,
} from './common.js';

const UP = new THREE.Vector3(0, 1, 0);

function buildBloom(parts, p, rng, pos, axis, size, basePhase) {
  const petalLen = Math.max(0.05, p.petalLen * size);
  const petalW = Math.max(0.03, p.petalWidth * size);
  const centerR = Math.max(0.02, p.centerSize * size);
  const bloomQuat = new THREE.Quaternion().setFromUnitVectors(UP, axis.clone().normalize());
  const bloomBend = clamp01(0.18 + pos.y * 0.45);

  // centre button
  const center = new THREE.SphereGeometry(centerR, 7, 6);
  xform(center, { scale: [1, 0.62, 1] });
  paintFlat(center, p.centerColor, { rng, jitter: 0.08 });
  setBend(center, bloomBend);
  setPhase(center, basePhase);
  xform(center, { pos: pos.toArray(), quat: bloomQuat });
  parts.push(finalize(center));

  // a few petal outline variants so they don't look stamped
  const variants = [];
  for (let v = 0; v < 3; v++) {
    const g = buildBlade(
      {
        len: petalLen,
        width: petalW,
        taper: p.taper,
        ruffle: p.ruffle * 0.9,
        ruffleFreq: 2.6,
        cup: p.curl * 0.6,
        base: 0.4,
        peak: lerp(0.55, 0.35, p.taper),
        segL: 7,
        segW: 4,
        jitter: 0.07,
      },
      rng
    );
    paintGradient(g, p.petalColor, p.petalTip, { axis: 'z', length: petalLen, rng, jitter: 0.05 });
    variants.push(g);
  }

  const K = p.petalCount;
  const tiltBase = lerp(1.32, 0.06, p.open); // radians above horizontal
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let k = 0; k < K; k++) {
    const az = (k / K) * TAU + rng.spread(0.35 / K);
    const tilt = tiltBase + rng.spread(0.09);
    const petal = variants[k % variants.length].clone();
    setBend(petal, (x, y, z) => bloomBend + 0.2 * clamp01(z / petalLen));
    setPhase(petal, basePhase + rng.float(0, 0.18));
    m.identity()
      .multiply(new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z))
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(bloomQuat))
      .multiply(new THREE.Matrix4().makeRotationY(az))
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tilt)))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0.015, centerR * 0.5))
      .multiply(new THREE.Matrix4().makeScale(1 + rng.spread(0.08), 1, 1 + rng.spread(0.08)));
    petal.applyMatrix4(m);
    parts.push(finalize(petal));
  }
}

function buildStalk(parts, p, rng) {
  const h = Math.max(0.2, rng.jitter(p.height, 0.12));
  const leanA = rng.float(0, TAU);
  const leanAmt = p.lean * h * rng.float(0.6, 1.2);
  const lx = Math.cos(leanA) * leanAmt, lz = Math.sin(leanA) * leanAmt;
  const px = -Math.sin(leanA), pz = Math.cos(leanA); // perpendicular, for a slight S
  const sJ = rng.spread(0.08) * h;
  const pts = [
    [0, 0, 0],
    [lx * 0.2 + px * sJ, h * 0.45, lz * 0.2 + pz * sJ],
    [lx * 0.65, h * 0.8, lz * 0.65],
    [lx, h, lz],
  ];
  const curve = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(...v)));

  const r0 = 0.022 + h * 0.01;
  const stem = taperedTube(pts, (t) => lerp(r0, r0 * 0.55, t), { radialSegs: 6, rings: 9 });
  paintGradient(stem, shiftHex(p.stemColor, -0.06), shiftHex(p.stemColor, 0.05), { axis: 'y', length: h, rng, jitter: 0.04 });
  setBend(stem, (x, y) => Math.pow(clamp01(y / h), 1.5) * 0.85);
  const stalkPhase = rng.float(0, 1);
  setPhase(stem, stalkPhase);
  parts.push(finalize(stem));

  // a few leaves low on the stalk
  for (let i = 0; i < p.stemLeaves; i++) {
    const t = 0.16 + 0.4 * (p.stemLeaves === 1 ? 0.5 : i / (p.stemLeaves - 1)) + rng.spread(0.05);
    const at = curve.getPointAt(clamp01(t));
    const leafLen = clamp01(h * 0.3) * rng.float(0.7, 1.15) + 0.12;
    const leaf = buildBlade(
      { len: leafLen, width: leafLen * 0.34, taper: 0.6, cup: 0.25, droop: 0.4, base: 0.25, peak: 0.4, segL: 6, segW: 3, jitter: 0.06 },
      rng
    );
    paintGradient(leaf, shiftHex(p.stemColor, -0.04), shiftHex(p.stemColor, 0.09), { axis: 'z', length: leafLen, rng });
    setBend(leaf, (x, y, z) => 0.15 + (at.y / h) * 0.5 + 0.3 * clamp01(z / leafLen));
    setPhase(leaf, rng.float(0, 1));
    xform(leaf, { pos: at.toArray(), rotY: rng.float(0, TAU), rotX: rng.float(0.15, 0.5) });
    parts.push(finalize(leaf));
  }

  // where do the blooms go?
  const tip = curve.getPointAt(1);
  const tangent = curve.getTangentAt(1);
  const blooms = [];
  const n = Math.max(1, p.bloomCount);
  const arr = n === 1 ? 'single' : p.arrangement;

  if (arr === 'single') {
    const axis = tangent.clone().lerp(UP, 0.45).normalize();
    blooms.push({ pos: tip.clone().addScaledVector(axis, 0.02), axis, size: 1 });
  } else if (arr === 'spike') {
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 1 : i / (n - 1);
      const t = lerp(0.45, 1, f);
      const at = curve.getPointAt(t);
      const az = i * GOLDEN + rng.spread(0.4);
      const out = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      const axis = out.clone().addScaledVector(UP, 0.55).normalize();
      const size = lerp(1, 0.55, f) * rng.float(0.9, 1.1);
      const pedLen = 0.06 + p.petalLen * p.bloomScale * 0.35 * size;
      const end = at.clone().addScaledVector(axis, pedLen);
      const ped = taperedTube([at.toArray(), end.toArray()], () => 0.012, { radialSegs: 5, rings: 3 });
      paintFlat(ped, p.stemColor, { rng });
      setBend(ped, clamp01(0.2 + at.y * 0.4));
      setPhase(ped, rng.float(0, 1));
      parts.push(finalize(ped));
      blooms.push({ pos: end, axis, size });
    }
  } else {
    // cluster — a hydrangea-ish pomander on top of the stalk
    const ballR = Math.max(0.1, p.petalLen * p.bloomScale * 0.8 + n * 0.006);
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 1 : i / (n - 1);
      const y = lerp(0.98, 0.18, f);
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const az = i * GOLDEN;
      const dir = new THREE.Vector3(Math.cos(az) * rr, y, Math.sin(az) * rr);
      const pos = tip.clone().addScaledVector(dir, ballR);
      const ped = taperedTube([tip.toArray(), pos.toArray()], () => 0.011, { radialSegs: 5, rings: 3 });
      paintFlat(ped, p.stemColor, { rng });
      setBend(ped, clamp01(0.2 + tip.y * 0.4));
      setPhase(ped, rng.float(0, 1));
      parts.push(finalize(ped));
      blooms.push({ pos, axis: dir, size: rng.float(0.75, 0.95) });
    }
  }

  for (const b of blooms) {
    buildBloom(parts, p, rng, b.pos, b.axis, b.size * (arr === 'single' ? 1 : p.bloomScale), stalkPhase + rng.float(0, 0.3));
  }
}

export function generateFlower(p, seed, { ghost = false } = {}) {
  const rng = new Rng(seed);
  const parts = [];
  for (const off of clusterOffsets(p.bushCount, p.spread, rng, { minScale: 0.78, maxScale: 1.12 })) {
    const start = parts.length;
    buildStalk(parts, p, rng);
    for (let i = start; i < parts.length; i++) {
      xform(parts[i], { pos: [off.x, 0, off.z], rotY: off.rotY, scale: off.scale });
    }
  }
  const mesh = mergeToMesh(parts, { ghost });
  mesh.userData.footprint = p.spread + p.petalLen;
  return mesh;
}
