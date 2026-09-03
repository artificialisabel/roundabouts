// Tree generator — a crooked trunk with a few branches, topped with leaf
// puffs in three moods: soft clouds (flamingo-tree pompoms), chunky cubes,
// or upright drops. Grown alone or in little groves.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, fbm3 } from '../rng.js';
import {
  taperedTube, xform, paintGradient, setBend, setPhase, finalize, mergeToMesh,
  clusterOffsets, shiftHex, lerp, clamp01, TAU, GOLDEN,
} from './common.js';

function wobblePuff(geo, amount, freq, noiseSeed) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const L = v.length() || 1;
    const n = fbm3((v.x / L) * freq + 9, (v.y / L) * freq + 9, (v.z / L) * freq + 9, 2, noiseSeed);
    const d = 1 + (n - 0.5) * 2 * amount;
    pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
  }
  geo.computeVertexNormals();
  return geo;
}

function puffGeometry(style, size, rng, noiseSeed) {
  if (style === 'cubes') {
    const g = new THREE.BoxGeometry(size * 1.7, size * 1.4, size * 1.7, 2, 2, 2);
    // pull corners in a touch so the cubes read hand-carved, keep edges hard
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
      const s = v.clone().normalize().multiplyScalar(size * 1.05);
      v.lerp(s, 0.22);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    wobblePuff(g, 0.05, 1.4, noiseSeed);
    return { g, h: size * 1.4 };
  }
  if (style === 'drops') {
    let g = new THREE.SphereGeometry(size, 8, 7);
    g = mergeVertices(g);
    xform(g, { scale: [0.78, 1.4, 0.78] });
    wobblePuff(g, 0.09, 1.7, noiseSeed);
    return { g, h: size * 2.8 };
  }
  // clouds
  let g = new THREE.SphereGeometry(size, 8, 6);
  g = mergeVertices(g);
  xform(g, { scale: [1.08, 0.8, 1.08] });
  wobblePuff(g, 0.12, 1.6, noiseSeed);
  return { g, h: size * 1.6 };
}

function buildOneTree(parts, p, rng, noiseSeed) {
  const H = Math.max(0.5, rng.jitter(p.height, 0.1));
  const baseR = p.trunkThick * (0.75 + H * 0.14);
  const wander = () => rng.spread(p.crook * H * 0.16);
  const topX = rng.spread(p.crook * H * 0.24), topZ = rng.spread(p.crook * H * 0.24);
  const pts = [
    [0, -0.06, 0],
    [wander(), H * 0.35, wander()],
    [topX * 0.6 + wander() * 0.5, H * 0.72, topZ * 0.6 + wander() * 0.5],
    [topX, H, topZ],
  ];
  const curve = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(...v)));
  const phase = rng.float(0, 1);

  const trunk = taperedTube(pts, (t) => baseR * (1 + 0.9 * Math.pow(1 - t, 3)) * lerp(1, 0.5, t), {
    radialSegs: 7,
    rings: 10,
  });
  paintGradient(trunk, shiftHex(p.trunkColor, -0.05), shiftHex(p.trunkColor, 0.06), { axis: 'y', length: H, rng, jitter: 0.05 });
  setBend(trunk, (x, y) => Math.pow(clamp01(y / H), 2) * 0.12);
  setPhase(trunk, phase);
  parts.push(finalize(trunk));

  // branches give the canopy its perches
  const anchors = [{ pos: curve.getPointAt(1), major: true, y: H }];
  for (let i = 0; i < p.branchCount; i++) {
    const t = rng.float(0.5, 0.92);
    const at = curve.getPointAt(t);
    const az = i * GOLDEN + rng.spread(0.5);
    const rise = rng.float(0.35, 0.95);
    const len = H * rng.float(0.18, 0.4) * lerp(1.1, 0.7, t);
    const dir = new THREE.Vector3(Math.cos(az), rise, Math.sin(az)).normalize();
    const mid = at.clone().addScaledVector(dir, len * 0.5);
    mid.y += len * 0.06;
    const end = at.clone().addScaledVector(dir, len);
    const br = taperedTube([at.toArray(), mid.toArray(), end.toArray()], (tt) => baseR * lerp(0.42, 0.15, tt), {
      radialSegs: 5,
      rings: 5,
    });
    paintGradient(br, shiftHex(p.trunkColor, -0.02), shiftHex(p.trunkColor, 0.08), { axis: 'y', length: H, rng, jitter: 0.05 });
    setBend(br, clamp01(at.y / H) * 0.2);
    setPhase(br, phase + rng.float(0, 0.2));
    parts.push(finalize(br));
    anchors.push({ pos: end, major: false, y: end.y });
  }

  // leaf puffs
  for (let i = 0; i < p.puffCount; i++) {
    const a = anchors[i % anchors.length];
    const size = Math.max(0.08, p.puffSize * rng.float(0.72, 1.15) * (a.major ? 1.2 : 0.85));
    const { g, h } = puffGeometry(p.style, size, rng, noiseSeed + i * 13);
    paintGradient(g, shiftHex(p.foliageColor, -0.09), p.foliageTip, {
      axis: 'y',
      length: h * 0.95,
      rng,
      jitter: 0.06,
      curve: 1.3,
    });
    // gradient reads local y from 0..h, so lift the puff onto its base first
    xform(g, { pos: [0, h * 0.5, 0] });
    let c;
    if (i < anchors.length) {
      c = a.pos.clone();
      c.y -= h * 0.28;
    } else {
      const az2 = rng.float(0, TAU);
      const lift = rng.float(0.0, 0.55);
      const reach = p.canopy * size * rng.float(0.55, 1.15);
      c = a.pos.clone().add(new THREE.Vector3(Math.cos(az2) * reach, lift * size - h * 0.3, Math.sin(az2) * reach));
    }
    setBend(g, 0.1 + clamp01(a.y / H) * 0.16);
    setPhase(g, phase + rng.float(0, 0.25));
    xform(g, { pos: c.toArray(), rotY: rng.float(0, TAU) });
    parts.push(finalize(g));
  }
}

export function generateTree(p, seed, { ghost = false } = {}) {
  const rng = new Rng(seed);
  const noiseSeed = (seed >>> 2) ^ 0x77aa11;
  const parts = [];
  for (const off of clusterOffsets(p.groveCount, p.spread + 0.8, rng, { minScale: 0.72, maxScale: 1.08 })) {
    const start = parts.length;
    buildOneTree(parts, p, rng, noiseSeed + start);
    for (let i = start; i < parts.length; i++) {
      xform(parts[i], { pos: [off.x, 0, off.z], rotY: off.rotY, scale: off.scale });
    }
  }
  const mesh = mergeToMesh(parts, { ghost });
  mesh.receiveShadow = true;
  mesh.userData.footprint = p.puffSize * (1 + p.canopy) + (p.groveCount > 1 ? p.spread : 0.2);
  return mesh;
}
