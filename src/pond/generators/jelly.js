// Jellyfish generator — a lathe-turned bell that fades to glass at the rim,
// an inner lantern, moon-jelly markings, and tentacles in three styles:
// silk threads, waving ribbons, or frilly oral arms. Everything is painted
// RGBA so transparency is a gradient, not a switch: tentacle tips dissolve
// into the water. Bell rim sits at y=0, tentacles hang below.

import * as THREE from 'three';
import { Rng } from '../../rng.js';
import {
  buildBlade, taperedTube, latheWobbled, xform, setBend, setPhase,
  shiftHex, lerp, clamp01, TAU, GOLDEN,
} from '../../generators/common.js';
import { srgbLinear } from '../../materials.js';
import { paintFlatA, paintGradientA, paintByPositionA, finalizePond, mergeToPondMesh } from '../water-common.js';
import { jellyMaterial, jellyGhostMaterial } from '../materials.js';

export function generateJelly(p, seed, { ghost = false } = {}) {
  const rng = new Rng(seed);
  const parts = [];
  const R = p.bellSize;
  const H = R * (0.55 + 0.9 * p.dome);
  const basePhase = rng.float(0, 1);
  const A = lerp(0.92, 0.3, p.glassiness); // headline opacity
  const scallops = 5 + Math.round(p.frill * 6);
  const wobPh = rng.float(0, TAU);

  // ---- the bell
  const rows = 13;
  const profile = [];
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1); // 0 apex → 1 rim
    const x = Math.max(0.012, R * Math.pow(Math.sin((t * Math.PI) / 2), 0.72));
    let y = H * Math.pow(Math.cos((t * Math.PI) / 2), 1 + p.dome * 0.5);
    if (t > 0.9) y -= H * 0.05 * (t - 0.9) * 10; // rim tucks under a whisker
    profile.push({ x, y });
  }
  const bell = latheWobbled(profile, 40, (cx, sx, row) => {
    const w = Math.pow(row / (rows - 1), 2);
    const a = Math.atan2(sx, cx);
    return 1 + p.frill * 0.1 * Math.sin(a * scallops) * w + 0.03 * Math.sin(a * 3 + wobPh);
  });
  const apexC = srgbLinear(shiftHex(p.bellColor, 0.02)).lerp(srgbLinear(p.glowColor), p.glow * 0.55);
  const rimC = srgbLinear(p.rimColor);
  paintByPositionA(bell, (c, x, y, z) => {
    const t = clamp01(1 - y / H);
    c.copy(apexC).lerp(rimC, Math.pow(t, 1.3));
    const k = 1 + rng.spread(0.04);
    c.r *= k; c.g *= k; c.b *= k;
    return lerp(A, A * 0.45, t);
  });
  setBend(bell, (x, y) => 0.55 * Math.pow(clamp01(1 - y / H), 1.6));
  setPhase(bell, basePhase);
  parts.push(finalizePond(bell));

  // ---- inner lantern — a small warm dome floating up inside the bell
  if (p.glow > 0.04) {
    const lantern = new THREE.SphereGeometry(R * 0.42, 10, 7, 0, TAU, 0, Math.PI * 0.62);
    xform(lantern, { pos: [0, H * 0.28, 0], scale: [1, H / R * 0.7, 1] });
    paintGradientA(
      lantern,
      shiftHex(p.glowColor, 0.12), p.glowColor,
      clamp01(A + p.glow * 0.35), A * 0.3,
      { axis: 'y', from: H * 0.75, to: 0, rng, jitter: 0.03 }
    );
    setBend(lantern, 0.1);
    setPhase(lantern, basePhase);
    parts.push(finalizePond(lantern));
  }

  // ---- moon markings — the four shy rings under the crown
  if (p.moonRings > 0.05) {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.4;
      const ring = new THREE.SphereGeometry(R * 0.13 * (0.7 + p.moonRings * 0.4), 8, 5);
      xform(ring, { scale: [1, 0.3, 1], pos: [Math.cos(a) * R * 0.34, H * 0.42, Math.sin(a) * R * 0.34] });
      paintFlatA(ring, shiftHex(p.glowColor, 0.1, 0.05), clamp01(A * (0.25 + p.moonRings * 0.35)), { rng, jitter: 0.03 });
      setBend(ring, 0.12);
      setPhase(ring, basePhase);
      parts.push(finalizePond(ring));
    }
  }

  // ---- tentacles
  const TL = p.tentLen;
  const tentA = A * 0.85;

  if (p.tentStyle === 'silk') {
    // many fine threads off the rim, curling as they fall
    for (let i = 0; i < p.tentCount; i++) {
      const a = (i / p.tentCount) * TAU + rng.spread(0.5 / p.tentCount);
      const r0 = R * 0.86;
      const x0 = Math.cos(a) * r0, z0 = Math.sin(a) * r0;
      const len = TL * rng.float(0.7, 1.15);
      const curlAmp = p.curl * len * 0.22;
      const cph = rng.float(0, TAU);
      const pts = [];
      const K = 5;
      for (let k = 0; k <= K; k++) {
        const t = k / K;
        pts.push([
          x0 * (1 - t * 0.25) + Math.sin(t * TAU * (0.7 + p.curl) + cph) * curlAmp * t,
          -t * len,
          z0 * (1 - t * 0.25) + Math.cos(t * TAU * (0.6 + p.curl) + cph * 1.3) * curlAmp * t,
        ]);
      }
      const tube = taperedTube(pts, (t) => Math.max(0.0035, R * 0.045 * (1 - t * 0.8)), { radialSegs: 4, rings: 7 });
      paintGradientA(tube, p.tentColor, shiftHex(p.tentColor, 0.15), tentA, 0.02, { axis: 'y', from: 0, to: -len, rng, jitter: 0.05 });
      setBend(tube, (x, y) => clamp01(0.3 + 0.7 * (-y / Math.max(0.05, len))));
      setPhase(tube, basePhase + rng.float(0, 0.5));
      parts.push(finalizePond(tube));
    }
  } else if (p.tentStyle === 'ribbon') {
    // a handful of long waving ribbons
    const n = Math.max(3, Math.round(p.tentCount / 3));
    for (let i = 0; i < n; i++) {
      const a = i * GOLDEN + rng.spread(0.3);
      const r0 = R * rng.float(0.35, 0.8);
      const len = TL * rng.float(0.85, 1.2);
      const blade = buildBlade(
        {
          len, width: R * (0.22 + p.curl * 0.16), taper: 0.25,
          edgeWave: 0.4 + p.curl * 0.5, edgeFreq: 4 + p.curl * 3,
          ruffle: 0.25 + p.curl * 0.45, ruffleFreq: 2 + p.curl * 2.5,
          base: 0.6, peak: 0.3, segL: 10, segW: 4, jitter: 0.07,
        },
        rng
      );
      // paint along local +Z before hanging it downward
      paintGradientA(blade, p.tentColor, shiftHex(p.tentColor, 0.12, -0.08), tentA, 0.03, { axis: 'z', from: 0, to: len, rng, jitter: 0.05 });
      setBend(blade, (x, y, z) => clamp01(0.3 + 0.7 * (z / len)));
      xform(blade, { rotX: Math.PI / 2 }); // +Z → −Y, ribbon hangs
      xform(blade, { rotY: rng.float(0, TAU), pos: [Math.cos(a) * r0, -0.01, Math.sin(a) * r0] });
      setPhase(blade, basePhase + rng.float(0, 0.5));
      parts.push(finalizePond(blade));
    }
  } else {
    // frill — four-ish ruffled oral arms under the crown
    const n = Math.max(3, Math.min(6, Math.round(p.tentCount / 5)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rng.spread(0.2);
      const len = TL * rng.float(0.6, 0.8);
      const blade = buildBlade(
        {
          len, width: R * 0.75, taper: 0.15,
          ruffle: 0.9, ruffleFreq: 4.5, edgeWave: 0.5, edgeFreq: 6,
          droop: 0.25, base: 0.5, peak: 0.35, segL: 10, segW: 6, jitter: 0.08,
        },
        rng
      );
      paintGradientA(blade, shiftHex(p.tentColor, 0.04), shiftHex(p.tentColor, 0.14, -0.06), tentA * 1.05, 0.05, { axis: 'z', from: 0, to: len, rng, jitter: 0.05 });
      setBend(blade, (x, y, z) => clamp01(0.25 + 0.75 * (z / len)));
      xform(blade, { rotX: Math.PI / 2 + rng.spread(0.15) });
      xform(blade, { rotY: a, pos: [Math.cos(a) * R * 0.22, 0, Math.sin(a) * R * 0.22] });
      setPhase(blade, basePhase + rng.float(0, 0.4));
      parts.push(finalizePond(blade));
    }
  }

  const mesh = mergeToPondMesh(parts, ghost ? jellyGhostMaterial : jellyMaterial, { shadow: false });
  mesh.userData.bellR = R;
  mesh.userData.bellH = H;
  mesh.userData.tentLen = TL;
  return mesh;
}
