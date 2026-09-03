// Koi generator — a plump brocade body with blade fins, a tail that comes in
// fan / fork / veil, koi patches painted straight into the vertex colours.
// The fish is built nose → +Z, tail → −Z, centred at the origin so it can be
// rotated to swim. aBend bakes the swim-wave amplitude (∝ body length): ~0 at
// the nose, growing past the peduncle and out along the tail fin.

import * as THREE from 'three';
import { Rng, fbm3, valueNoise3 } from '../../rng.js';
import {
  buildBlade, taperedTube, xform, paintFlat, paintByPosition, setBend, setPhase,
  shiftHex, lerp, clamp01, smoothstep, TAU,
} from '../../generators/common.js';
import { srgbLinear } from '../../materials.js';
import { finalizePond, mergeToPondMesh } from '../water-common.js';
import { fishMaterial, fishGhostMaterial } from '../materials.js';

// radius profile along the body: u=0 tail base (peduncle), u=1 nose
function bodyProfile(u) {
  const peak = 0.62;
  if (u < peak) return lerp(0.16, 1, smoothstep(u / peak));
  const v = (u - peak) / (1 - peak);
  return Math.sqrt(Math.max(0, 1 - Math.pow(v, 1.9))); // blunt koi nose
}

function buildBody(p, rng, L, R) {
  const rings = 20, segs = 12;
  const pos = [];
  const cols = segs + 1;
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const z = lerp(-0.5 * L, 0.5 * L, u);
    const r = R * bodyProfile(u) * (1 + rng.spread(0.02));
    const cy = -r * 0.14; // back sits a touch flatter than the belly hangs
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * TAU;
      pos.push(Math.cos(a) * r * p.squash, Math.sin(a) * r + cy, z);
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * cols + j;
      idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// swim-wave amplitude at a given object-space z (nose +0.5L → tail −0.5L…)
function bendAt(z, L) {
  const t = Math.max(0, (0.5 * L - z) / L); // 0 at nose, 1 at peduncle, >1 on the tail fin
  return 0.085 * L * Math.pow(t, 1.8);
}

function paintBody(geom, p, L, R, rng, patternSeed) {
  const body = srgbLinear(p.bodyColor);
  const belly = srgbLinear(p.bellyColor);
  const patch = srgbLinear(p.patchColor);
  const freq = 2.4 / (Math.max(0.2, p.patchScale) * Math.max(0.5, L));
  const brFreq = freq * 3.6;
  paintByPosition(geom, (c, x, y, z) => {
    const down = smoothstep(clamp01(0.42 - y / (R * 1.5)));
    c.copy(body).lerp(belly, down);
    if (p.pattern !== 'solid' && down < 0.82) {
      if (p.pattern === 'patched') {
        const n = fbm3(x * freq, y * freq, z * freq + patternSeed * 0.13, 2, patternSeed);
        if (n > 1 - p.coverage * 0.62) c.copy(patch);
      } else {
        const n = valueNoise3(x * brFreq, y * brFreq, z * brFreq + patternSeed * 0.29, patternSeed);
        if (n > 1 - p.coverage * 0.5) c.copy(patch);
      }
    }
    // faint vertex jitter so flats read painterly
    const k = 1 + rng.spread(0.03);
    c.r *= k; c.g *= k; c.b *= k;
  });
}

export function generateFish(p, seed, { ghost = false } = {}) {
  const rng = new Rng(seed);
  const L = p.bodyLen;
  const R = L * (0.09 + 0.13 * p.plump);
  const parts = [];
  const basePhase = rng.float(0, 1);
  const patternSeed = rng.int(1, 1e6);

  // ---- body
  const body = buildBody(p, rng, L, R);
  paintBody(body, p, L, R, rng, patternSeed);
  setBend(body, (x, y, z) => bendAt(z, L));
  setPhase(body, basePhase);
  parts.push(finalizePond(body));

  // ---- eyes
  for (const s of [-1, 1]) {
    const u = 0.86;
    const r = R * bodyProfile(u);
    const eye = new THREE.SphereGeometry(Math.max(0.012, R * 0.15), 6, 5);
    paintFlat(eye, '#2f2a33', { rng, jitter: 0.02 });
    const z = lerp(-0.5 * L, 0.5 * L, u);
    xform(eye, { pos: [s * r * p.squash * 0.82, r * 0.22 - r * 0.14, z] });
    setBend(eye, bendAt(z, L));
    setPhase(eye, basePhase);
    parts.push(finalizePond(eye));
  }

  // ---- barbels (whisker pairs at the nose)
  for (let w = 0; w < p.barbels; w++) {
    const u = 0.965 - w * 0.06;
    const z0 = lerp(-0.5 * L, 0.5 * L, u);
    const r = R * bodyProfile(u);
    for (const s of [-1, 1]) {
      const x0 = s * r * p.squash * 0.7;
      const y0 = -r * 0.55;
      const wl = R * (0.5 + 0.25 * w) * (1 + rng.spread(0.2));
      const tube = taperedTube(
        [
          [x0, y0, z0],
          [x0 * 1.5, y0 - wl * 0.5, z0 + wl * 0.35],
          [x0 * 1.8, y0 - wl, z0 + wl * 0.5],
        ],
        (t) => Math.max(0.004, R * 0.06 * (1 - t * 0.7)),
        { radialSegs: 4, rings: 4 }
      );
      paintFlat(tube, shiftHex(p.bodyColor, -0.08), { rng });
      setBend(tube, bendAt(z0, L) + 0.02);
      setPhase(tube, basePhase + 0.4);
      parts.push(finalizePond(tube));
    }
  }

  // ---- tail
  const TL = Math.max(0.1, p.tailLen * L);
  const tailZ = -0.5 * L + 0.02;
  const tailY = -R * bodyProfile(0) * 0.14;
  const paintFin = (g, len) => {
    const a = srgbLinear(shiftHex(p.finColor, -0.04));
    const b = srgbLinear(shiftHex(p.finColor, 0.12, -0.05));
    paintByPosition(g, (c, x, y, z) => {
      const t = clamp01(z / len);
      c.copy(a).lerp(b, t);
      const k = 1 + rng.spread(0.04);
      c.r *= k; c.g *= k; c.b *= k;
    });
  };

  const addTailBlade = (opts, tiltX) => {
    const blade = buildBlade(opts, rng);
    paintFin(blade, opts.len);
    xform(blade, { rotZ: Math.PI / 2 }); // width spans Y — a vertical fin
    xform(blade, { rotY: Math.PI });     // point −Z, off the peduncle
    if (tiltX) xform(blade, { rotX: tiltX });
    xform(blade, { pos: [0, tailY, tailZ] });
    setBend(blade, (x, y, z) => bendAt(z, L) * 1.2);
    setPhase(blade, basePhase + 0.08);
    parts.push(finalizePond(blade));
  };

  if (p.tailStyle === 'fan') {
    addTailBlade({ len: TL, width: TL * 0.9, taper: 0.3, ruffle: 0.25, ruffleFreq: 3, base: 0.5, peak: 0.4, cup: 0.15, segL: 8, segW: 5, jitter: 0.06 }, 0);
  } else if (p.tailStyle === 'fork') {
    addTailBlade({ len: TL, width: TL * 0.4, taper: 0.7, base: 0.45, peak: 0.35, segL: 7, segW: 4, jitter: 0.06 }, 0.55);
    addTailBlade({ len: TL, width: TL * 0.4, taper: 0.7, base: 0.45, peak: 0.35, segL: 7, segW: 4, jitter: 0.06 }, -0.55);
  } else {
    for (const t of [-0.3, 0, 0.3]) {
      addTailBlade({ len: TL * 1.3, width: TL * 0.55, taper: 0.2, ruffle: 0.85, ruffleFreq: 3.5, droop: 0.3, base: 0.5, peak: 0.35, segL: 9, segW: 5, jitter: 0.08 }, t);
    }
  }

  // ---- dorsal fin
  if (p.dorsal > 0.05) {
    const dl = (0.14 + 0.24 * p.dorsal) * L;
    const u = 0.48;
    const z = lerp(-0.5 * L, 0.5 * L, u);
    const r = R * bodyProfile(u);
    const blade = buildBlade({ len: dl, width: dl * 0.9, taper: 0.45, edgeWave: 0.35, edgeFreq: 4, base: 0.55, peak: 0.4, segL: 6, segW: 4, jitter: 0.06 }, rng);
    paintFin(blade, dl);
    xform(blade, { rotX: -Math.PI / 2 }); // length up
    xform(blade, { rotY: Math.PI / 2 });  // plane along the spine
    xform(blade, { rotX: -0.5 });         // swept back
    xform(blade, { pos: [0, r * 0.86 - r * 0.14, z] });
    setBend(blade, (x, y, z2) => bendAt(z2, L) + 0.015);
    setPhase(blade, basePhase + 0.15);
    parts.push(finalizePond(blade));
  }

  // ---- paired fins: pectoral (big, at the shoulder) and pelvic (small)
  const pairFin = (u, size, droop, sweep, phaseOff) => {
    const z = lerp(-0.5 * L, 0.5 * L, u);
    const r = R * bodyProfile(u);
    for (const s of [-1, 1]) {
      const fl = size * (1 + rng.spread(0.08));
      const blade = buildBlade({ len: fl, width: fl * 0.55, taper: 0.35, cup: 0.3, base: 0.5, peak: 0.4, segL: 6, segW: 4, jitter: 0.07 }, rng);
      paintFin(blade, fl);
      xform(blade, { rotY: s * sweep, rotX: droop });
      xform(blade, { pos: [s * r * p.squash * 0.85, -r * 0.4, z] });
      setBend(blade, (x, y, z2) => bendAt(z, L) + 0.02 + 0.03 * clamp01(Math.abs(x) / fl));
      setPhase(blade, basePhase + phaseOff + (s > 0 ? 0.1 : 0));
      parts.push(finalizePond(blade));
    }
  };
  pairFin(0.7, 0.26 * L * p.finSize, 0.5, 2.35, 0.2);
  pairFin(0.42, 0.16 * L * p.finSize, 0.8, 2.6, 0.3);

  const mesh = mergeToPondMesh(parts, ghost ? fishGhostMaterial : fishMaterial);
  mesh.userData.bodyLen = L;
  mesh.userData.bodyR = R;
  mesh.userData.tailLen = TL;
  return mesh;
}
