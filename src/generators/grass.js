// Grass generator — a tuft of narrow folded blades, each with its own tilt
// and phase so the wind combs through rather than shoving the whole clump.

import { Rng } from '../rng.js';
import {
  buildBlade, xform, paintGradient, setBend, setPhase, finalize, mergeToMesh, clamp01, lerp, TAU,
} from './common.js';

export function generateGrass(p, seed, { ghost = false } = {}) {
  const rng = new Rng(seed);
  const parts = [];

  const variants = [];
  for (let v = 0; v < 3; v++) {
    const g = buildBlade(
      {
        len: p.bladeHeight,
        width: p.bladeWidth * lerp(0.85, 1.35, rng.next()),
        taper: 0.88,
        cup: 0.5,
        base: 0.95,
        peak: 0.12,
        droop: p.bend * 0.75,
        segL: 4,
        segW: 2,
        jitter: 0.05,
      },
      rng
    );
    paintGradient(g, p.baseColor, p.tipColor, { axis: 'z', length: p.bladeHeight, rng, jitter: 0.07 });
    setBend(g, (x, y, z) => Math.pow(clamp01(z / p.bladeHeight), 1.25));
    variants.push(g);
  }

  for (let i = 0; i < p.density; i++) {
    const r = p.radius * Math.sqrt(rng.next());
    const a = rng.float(0, TAU);
    const pitch = -Math.PI / 2 + p.bend * 0.5 + rng.spread(0.45 * p.messy);
    const blade = variants[i % variants.length].clone();
    setPhase(blade, rng.next());
    xform(blade, {
      pos: [Math.cos(a) * r, 0, Math.sin(a) * r],
      rotY: rng.float(0, TAU),
      rotX: pitch,
      scale: [1, 1, rng.float(1 - 0.35 * p.messy, 1 + 0.35 * p.messy)],
    });
    parts.push(finalize(blade));
  }

  const mesh = mergeToMesh(parts, { ghost });
  mesh.castShadow = false; // a lawn of blade shadows reads as noise
  mesh.userData.footprint = p.radius;
  return mesh;
}
