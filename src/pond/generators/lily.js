// Lily generator — a raft of hand-drawn notched pads floating on the water,
// some carrying a layered lotus bloom on a short stem. Static (it floats
// where you put it), so the whole raft merges into one mesh; the bob and
// current lean happen in the lily material.

import * as THREE from 'three';
import { Rng } from '../../rng.js';
import {
  buildBlade, taperedTube, xform, paintFlat, paintGradient, paintByPosition,
  setBend, setPhase, shiftHex, lerp, clamp01, TAU, clusterOffsets,
} from '../../generators/common.js';
import { srgbLinear } from '../../materials.js';
import { finalizePond, mergeToPondMesh } from '../water-common.js';
import { lilyMaterial, lilyGhostMaterial } from '../materials.js';

// a lily pad: polar disc with a pac-man notch, wobbled rim, upcurled edge
function padGeometry(R, notch, curl, wobble, rng) {
  const rings = 5, segs = 28;
  const W = 0.06 + notch * 1.05; // notch wedge in radians
  const a0 = W / 2, a1 = TAU - W / 2;
  const ph1 = rng.float(0, TAU), ph2 = rng.float(0, TAU);
  const pos = [0, 0, 0];
  for (let i = 1; i <= rings; i++) {
    const rr = i / rings;
    for (let j = 0; j <= segs; j++) {
      const a = a0 + (j / segs) * (a1 - a0);
      const wob = 1 + wobble * (0.07 * Math.sin(a * 3 + ph1) + 0.045 * Math.sin(a * 7 + ph2));
      const r = R * rr * wob;
      const y = curl * R * 0.25 * Math.pow(rr, 3.2) - R * 0.03 * Math.sin(rr * Math.PI) * 0.4;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  const cols = segs + 1;
  const at = (i, j) => 1 + (i - 1) * cols + j;
  const idx = [];
  for (let j = 0; j < segs; j++) idx.push(0, at(1, j + 1), at(1, j));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function paintPad(geom, p, R, rng) {
  const base = srgbLinear(p.padColor);
  const rim = srgbLinear(shiftHex(p.padColor, 0.07, -0.08));
  const vein = srgbLinear(shiftHex(p.padColor, 0.12, -0.02));
  const ph = rng.float(0, TAU);
  paintByPosition(geom, (c, x, y, z) => {
    const r = Math.hypot(x, z) / R;
    const a = Math.atan2(z, x);
    c.copy(base).lerp(rim, Math.pow(clamp01(r), 1.6));
    const v = Math.pow(Math.max(0, Math.sin(a * 9 + ph)), 14);
    c.lerp(vein, v * 0.4 * clamp01(r));
    const k = 1 + rng.spread(0.035);
    c.r *= k; c.g *= k; c.b *= k;
  });
}

function buildBloom(parts, p, rng, scale, padY) {
  const plen0 = p.petalLen * scale;
  const stemH = plen0 * rng.float(0.35, 0.7);
  const cy = padY + 0.025 + stemH;

  // short stem from pad to bloom
  const stem = taperedTube(
    [[0, padY, 0], [rng.spread(0.02), padY + stemH * 0.6, rng.spread(0.02)], [0, cy, 0]],
    () => Math.max(0.008, plen0 * 0.09),
    { radialSegs: 5, rings: 4 }
  );
  paintFlat(stem, shiftHex(p.padColor, -0.05), { rng });
  setBend(stem, 0.12);
  setPhase(stem, rng.float(0, 1));
  parts.push(finalizePond(stem));

  const phase = rng.float(0, 1);
  for (let li = 0; li < p.layers; li++) {
    const cnt = Math.max(4, Math.round(p.petalCount * (1 - li * 0.22)));
    const plen = plen0 * (1 - li * 0.16);
    const tilt = lerp(1.3, 0.3, p.open) + li * 0.28; // inner whorls stand more upright
    for (let k = 0; k < cnt; k++) {
      const az = (k / cnt) * TAU + li * 0.45 + rng.spread(0.3 / cnt);
      const petal = buildBlade(
        {
          len: plen, width: plen * lerp(0.55, 0.3, p.taper), taper: p.taper,
          cup: 0.45, base: 0.5, peak: lerp(0.5, 0.35, p.taper), segL: 6, segW: 4, jitter: 0.06,
        },
        rng
      );
      paintGradient(petal, p.petalColor, p.petalTip, { axis: 'z', length: plen, rng, jitter: 0.05 });
      setBend(petal, (x, y, z) => 0.1 + 0.18 * clamp01(z / plen));
      xform(petal, { rotX: -tilt });
      xform(petal, { rotY: az, pos: [0, cy, 0] });
      setPhase(petal, phase + rng.float(0, 0.15));
      parts.push(finalizePond(petal));
    }
  }

  // centre button + a shy ring of stamens
  const centerR = Math.max(0.015, plen0 * 0.28);
  const center = new THREE.SphereGeometry(centerR, 8, 6);
  xform(center, { scale: [1, 0.55, 1], pos: [0, cy + centerR * 0.15, 0] });
  paintFlat(center, p.centerColor, { rng, jitter: 0.06 });
  setBend(center, 0.1);
  setPhase(center, phase);
  parts.push(finalizePond(center));

  const stamens = 4 + Math.round(p.petalCount / 3);
  for (let s = 0; s < stamens; s++) {
    const a = (s / stamens) * TAU + 0.3;
    const dot = new THREE.SphereGeometry(centerR * 0.22, 5, 4);
    xform(dot, { pos: [Math.cos(a) * centerR * 1.25, cy + centerR * 0.25, Math.sin(a) * centerR * 1.25] });
    paintFlat(dot, shiftHex(p.centerColor, 0.14), { rng, jitter: 0.05 });
    setBend(dot, 0.12);
    setPhase(dot, phase);
    parts.push(finalizePond(dot));
  }
}

export function generateLily(p, seed, { ghost = false } = {}) {
  const rng = new Rng(seed);
  const parts = [];
  const offsets = clusterOffsets(p.padCount, p.spread, rng, {
    minScale: 1 - 0.45 * p.sizeVar,
    maxScale: 1 + 0.35 * p.sizeVar,
  });
  for (const off of offsets) {
    const start = parts.length;
    const R = p.padSize;
    const pad = padGeometry(R, p.notch, p.curl, p.wobble, rng);
    paintPad(pad, p, R, rng);
    setBend(pad, (x, y, z) => 0.06 + 0.12 * clamp01(Math.hypot(x, z) / R));
    setPhase(pad, rng.float(0, 1));
    parts.push(finalizePond(pad));

    if (rng.next() < p.bloomShare) buildBloom(parts, p, rng, off.scale, 0.01);

    for (let i = start; i < parts.length; i++) {
      xform(parts[i], { pos: [off.x, 0.03, off.z], rotY: off.rotY, scale: off.scale });
    }
  }
  const mesh = mergeToPondMesh(parts, ghost ? lilyGhostMaterial : lilyMaterial);
  mesh.userData.footprint = p.spread + p.padSize;
  return mesh;
}
