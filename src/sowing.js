// Sowing a bed — the specimens one roundabout is planted with, drawn
// deterministically from a single number. Same seed, same corner, every
// time: the whole planting travels as nothing but that number.

import { Rng } from './rng.js';
import { randomParams, TYPE_ORDER } from './params.js';
import { encode } from './seedcode.js';

export function sowBed(seed, bedRadius) {
  const rng = new Rng(((seed >>> 0) ^ 0x5eed) >>> 0);
  const records = [];
  const n = rng.int(6, 13);
  const weights = [
    ['flower', 0.26], ['grass', 0.22], ['plant', 0.16],
    ['mushroom', 0.14], ['rock', 0.12], ['tree', 0.1],
  ];
  let hasTree = false;

  for (let k = 0; k < n; k++) {
    let type;
    if (k === 0 && rng.chance(0.75)) {
      type = 'tree'; // most corners get one tree to stand under
    } else {
      let t = rng.next();
      type = TYPE_ORDER[0];
      for (const [ty, w] of weights) {
        t -= w;
        if (t <= 0) { type = ty; break; }
      }
    }
    if (type === 'tree') {
      if (hasTree && rng.chance(0.7)) type = 'flower';
      else hasTree = true;
    }

    const { params, seed: iseed } = randomParams(type, rng.int(1, 0xfffffff));
    if (type === 'tree') {
      params.groveCount = 1;
      params.height = Math.min(params.height, 3.2);
    }
    const r = bedRadius * (0.15 + 0.75 * Math.sqrt(rng.next()));
    const a = rng.float(0, Math.PI * 2);
    records.push({
      code: encode(type, params, iseed),
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      rotY: rng.float(0, Math.PI * 2),
      scale: rng.float(0.9, 1.08),
      iseed,
    });
  }
  return records;
}
