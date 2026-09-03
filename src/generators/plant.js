// Foliage generator — one leaf shape, repeated along arching stems that
// fan out from the middle into a scruffy, believable bush.

import * as THREE from 'three';
import { Rng } from '../rng.js';
import {
  buildBlade, taperedTube, xform, paintGradient, paintFlat, setBend, setPhase,
  finalize, mergeToMesh, clusterOffsets, shiftHex, lerp, clamp01, TAU, GOLDEN,
} from './common.js';

function buildBush(parts, p, rng) {
  const H = Math.max(0.12, rng.jitter(p.height, 0.15));
  const mess = p.messiness;

  // three leaf outline variants, reused across the bush
  const variants = [];
  for (let v = 0; v < 3; v++) {
    const g = buildBlade(
      {
        len: p.leafLen,
        width: p.leafWidth,
        taper: p.taper,
        edgeWave: p.serration,
        edgeFreq: 6.5,
        cup: p.fold * 0.6,
        droop: 0.18,
        base: 0.3,
        peak: lerp(0.5, 0.35, p.taper),
        segL: 7,
        segW: 4,
        jitter: 0.05 + mess * 0.06,
      },
      rng
    );
    paintGradient(g, p.leafColor, p.tipColor, { axis: 'z', length: p.leafLen, rng, jitter: 0.06 });
    variants.push(g);
  }

  for (let s = 0; s < p.stemCount; s++) {
    const az = s * GOLDEN + rng.spread(0.4 + mess * 0.5);
    const dx = Math.cos(az), dz = Math.sin(az);
    const L = H * rng.float(0.7, 1.2);
    const out = lerp(0.18, 0.95, p.arch) * L * rng.float(0.8, 1.2);
    const top = L * lerp(1.05, 0.5, p.arch);
    const sag = p.arch;
    const pts = [
      [0, 0.01, 0],
      [dx * out * 0.15, top * 0.45, dz * out * 0.15],
      [dx * out * 0.6, top * (0.85 + 0.15 * (1 - sag)), dz * out * 0.6],
      [dx * out, top * (1 - 0.5 * sag), dz * out],
    ];
    const curve = new THREE.CatmullRomCurve3(pts.map((v) => new THREE.Vector3(...v)));
    const stemPhase = rng.float(0, 1);

    const r0 = 0.012 + p.leafLen * 0.015;
    const stem = taperedTube(pts, (t) => lerp(r0, r0 * 0.4, t), { radialSegs: 5, rings: 8 });
    paintFlat(stem, p.stemColor, { rng, jitter: 0.05 });
    setBend(stem, (x, y) => Math.pow(clamp01(y / (top + 0.001)), 1.3) * 0.7);
    setPhase(stem, stemPhase);
    parts.push(finalize(stem));

    const k = p.leavesPerStem;
    for (let i = 0; i < k; i++) {
      const f = k === 1 ? 1 : i / (k - 1);
      const t = lerp(0.35, 0.99, f);
      const at = curve.getPointAt(clamp01(t));
      const terminal = i === k - 1;
      const side = i % 2 === 0 ? 1 : -1;
      const leafAz = terminal ? az + rng.spread(0.2) : az + side * (1.0 + rng.spread(0.35 + mess * 0.4));
      const scale = lerp(1, 0.55, f) * rng.float(0.85, 1.1);
      const leaf = variants[(s + i) % variants.length].clone();
      setBend(leaf, (x, y, z) => 0.15 + (at.y / H) * 0.45 + 0.35 * clamp01(z / p.leafLen));
      setPhase(leaf, stemPhase + rng.float(0, 0.25));
      xform(leaf, {
        pos: at.toArray(),
        rotY: -leafAz,
        rotX: rng.float(0.05, 0.35) + p.arch * 0.35,
        rotZ: rng.spread(0.25 * mess),
        scale,
      });
      parts.push(finalize(leaf));
    }
  }
}

export function generatePlant(p, seed, { ghost = false } = {}) {
  const rng = new Rng(seed);
  const parts = [];
  for (const off of clusterOffsets(p.bushCount, p.spread, rng, { minScale: 0.7, maxScale: 1.1 })) {
    const start = parts.length;
    buildBush(parts, p, rng);
    for (let i = start; i < parts.length; i++) {
      xform(parts[i], { pos: [off.x, 0, off.z], rotY: off.rotY, scale: off.scale });
    }
  }
  const mesh = mergeToMesh(parts, { ghost });
  mesh.userData.footprint = Math.max(p.spread * (p.bushCount > 1 ? 1 : 0.4), p.height * lerp(0.3, 0.9, p.arch) + p.leafLen * 0.5);
  return mesh;
}
