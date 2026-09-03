// Pond parameter schemas — same contract as the garden's src/params.js:
// the single source of truth driving the UI panel, the seed-code bit packing
// and the randomizer. Order matters for packing: never reorder params within
// a version, add new ones behind a version bump.

import { Rng, hashString } from '../rng.js';

// pond palettes — koi brocade, glassy pastel jellies, dusty water greens
export const PALETTES = {
  koiBody: ['#e8e4d8', '#e2762f', '#e6b34c', '#d96a5e', '#2f2a33', '#f0e6d0', '#c9485b'],
  koiPatch: ['#d0452f', '#2f2a33', '#e6b34c', '#b3543f', '#8a4a5e', '#e2762f', '#c9485b'],
  belly: ['#f6ead2', '#f0e6d0', '#eadfc6', '#f2cfc3', '#e8e4d8'],
  fin: ['#f2cfc3', '#e8a1b0', '#e6b34c', '#e8e4d8', '#d96a5e', '#b48ead', '#f6ead2'],
  jellyBell: ['#b48ead', '#8fc4c9', '#e8a1b0', '#f2cfc3', '#9db8e8', '#c9e4de', '#8fa0c9'],
  jellyGlow: ['#ffd9a5', '#f6ead2', '#ffb7c5', '#ffe2d0', '#c9e4de', '#e8a1b0'],
  jellyTent: ['#e8a1b0', '#b48ead', '#8fc4c9', '#f2cfc3', '#8fa0c9', '#f6ead2', '#c9e4de'],
  pad: ['#5f7d64', '#6f9077', '#88a08a', '#4e6b52', '#93a86b', '#7d8f6a', '#a7b47a'],
  lotus: ['#f2cfc3', '#e8a1b0', '#f6ead2', '#d96a5e', '#b48ead', '#e6b34c', '#e8e4d8'],
  lotusCenter: ['#e9b84f', '#e6b34c', '#c9743f', '#f4e3bc', '#d96a5e'],
};

const F = (k, label, min, max, def, r, steps = 48) => ({ type: 'float', k, label, min, max, def, r, steps });
const I = (k, label, min, max, def, r) => ({ type: 'int', k, label, min, max, def, r });
const C = (k, label, def, palette) => ({ type: 'color', k, label, def, palette });
const CH = (k, label, options, def, weights) => ({ type: 'choice', k, label, options, def, weights });

export const SCHEMAS = {
  fish: {
    label: 'koi',
    prefix: 'k',
    version: 1,
    nouns: ['koi', 'brocade', 'glimmer', 'minnow', 'pennyfish', 'mirrorling', 'dapple', 'inkfin', 'sunscale', 'ember', 'ghostkoi', 'ripplewife'],
    groups: [
      {
        label: 'body',
        params: [
          F('bodyLen', 'body length', 0.4, 1.8, 0.95, [0.25, 0.8]),
          F('plump', 'slender ⟷ plump', 0, 1, 0.45, [0.25, 0.75]),
          F('squash', 'flat ⟷ round', 0.55, 1.2, 0.85),
        ],
      },
      {
        label: 'fins & tail',
        params: [
          CH('tailStyle', 'tail', ['fan', 'fork', 'veil'], 'fan', [0.42, 0.28, 0.3]),
          F('tailLen', 'tail length', 0.2, 1.1, 0.45, [0.25, 0.85]),
          F('finSize', 'fin size', 0.3, 1.6, 0.8, [0.3, 0.8]),
          F('dorsal', 'dorsal fin', 0, 1, 0.5),
          I('barbels', 'whiskers', 0, 2, 1, [0.3, 1]),
        ],
      },
      {
        label: 'pattern',
        params: [
          CH('pattern', 'markings', ['solid', 'patched', 'brindle'], 'patched', [0.25, 0.5, 0.25]),
          F('patchScale', 'patch size', 0.4, 3, 1.4, [0.25, 0.7]),
          F('coverage', 'bare ⟷ covered', 0, 1, 0.45, [0.2, 0.75]),
        ],
      },
      {
        label: 'colours',
        params: [
          C('bodyColor', 'body', '#e8e4d8', 'koiBody'),
          C('patchColor', 'markings', '#d0452f', 'koiPatch'),
          C('bellyColor', 'belly', '#f6ead2', 'belly'),
          C('finColor', 'fins', '#f2cfc3', 'fin'),
        ],
      },
      {
        label: 'the school',
        params: [
          I('schoolCount', 'fish in school', 1, 7, 3, [0.15, 0.7]),
          F('spread', 'school spread', 0.3, 2, 0.9),
          F('sizeVar', 'big ones, little ones', 0, 1, 0.5),
          F('depth', 'shallow ⟷ deep', 0, 1, 0.35, [0.15, 0.75]),
        ],
      },
    ],
  },

  jelly: {
    label: 'jelly',
    prefix: 'j',
    version: 1,
    nouns: ['moonjelly', 'lantern', 'drifter', 'parasol', 'pondghost', 'plume', 'bellflower', 'wisp', 'soapbubble', 'tideheart'],
    groups: [
      {
        label: 'bell',
        params: [
          F('bellSize', 'bell size', 0.12, 0.7, 0.3, [0.2, 0.8]),
          F('dome', 'saucer ⟷ dome', 0, 1, 0.55, [0.25, 0.85]),
          F('frill', 'frilled rim', 0, 1, 0.35, [0.1, 0.8]),
          F('moonRings', 'moon markings', 0, 1, 0.4),
        ],
      },
      {
        label: 'tentacles',
        params: [
          CH('tentStyle', 'style', ['silk', 'ribbon', 'frill'], 'silk', [0.45, 0.3, 0.25]),
          I('tentCount', 'tentacles', 3, 32, 14, [0.25, 0.8]),
          F('tentLen', 'tentacle length', 0.3, 2.2, 1.0, [0.3, 0.85]),
          F('curl', 'straight ⟷ curling', 0, 1, 0.4, [0.1, 0.8]),
        ],
      },
      {
        label: 'glass',
        params: [
          F('glassiness', 'solid ⟷ glass', 0, 1, 0.6, [0.3, 0.85]),
          F('glow', 'inner lantern', 0, 1, 0.5, [0.2, 0.85]),
        ],
      },
      {
        label: 'colours',
        params: [
          C('bellColor', 'bell', '#b48ead', 'jellyBell'),
          C('rimColor', 'rim', '#e8a1b0', 'jellyBell'),
          C('tentColor', 'tentacles', '#e8a1b0', 'jellyTent'),
          C('glowColor', 'lantern', '#ffd9a5', 'jellyGlow'),
        ],
      },
      {
        label: 'the smack',
        params: [
          I('smackCount', 'jellies together', 1, 6, 2, [0.1, 0.6]),
          F('spread', 'drift spread', 0.3, 2, 1),
          F('sizeVar', 'big ones, little ones', 0, 1, 0.5),
          F('depth', 'shallow ⟷ deep', 0, 1, 0.5, [0.2, 0.8]),
        ],
      },
    ],
  },

  lily: {
    label: 'lily',
    prefix: 'l',
    version: 1,
    nouns: ['lotus', 'lilypad', 'watercup', 'padling', 'blushcup', 'pondstar', 'saucer', 'nymphaea'],
    groups: [
      {
        label: 'pads',
        params: [
          F('padSize', 'pad size', 0.15, 0.9, 0.4, [0.25, 0.8]),
          F('notch', 'pad notch', 0, 1, 0.5, [0.2, 0.8]),
          F('curl', 'flat ⟷ curled rim', 0, 1, 0.3, [0.1, 0.7]),
          F('wobble', 'hand-drawn wobble', 0, 1, 0.5, [0.2, 0.85]),
        ],
      },
      {
        label: 'blooms',
        params: [
          F('bloomShare', 'pads with blossoms', 0, 1, 0.5, [0.25, 0.9]),
          I('petalCount', 'petals per whorl', 5, 24, 12, [0.3, 0.8]),
          F('petalLen', 'petal length', 0.08, 0.5, 0.2, [0.25, 0.75]),
          I('layers', 'petal whorls', 1, 3, 2, [0.3, 1]),
          F('open', 'budded ⟷ open', 0, 1, 0.55, [0.3, 0.9]),
          F('taper', 'round ⟷ pointy', 0, 1, 0.6, [0.2, 0.8]),
        ],
      },
      {
        label: 'colours',
        params: [
          C('padColor', 'pad', '#5f7d64', 'pad'),
          C('petalColor', 'petal', '#f2cfc3', 'lotus'),
          C('petalTip', 'petal tip', '#e8a1b0', 'lotus'),
          C('centerColor', 'centre', '#e9b84f', 'lotusCenter'),
        ],
      },
      {
        label: 'the raft',
        params: [
          I('padCount', 'pads in raft', 1, 12, 5, [0.25, 0.8]),
          F('spread', 'raft spread', 0.3, 2.5, 1.1),
          F('sizeVar', 'big ones, little ones', 0, 1, 0.5),
        ],
      },
    ],
  },
};

export const TYPE_ORDER = ['fish', 'jelly', 'lily'];

export function flatParams(type) {
  return SCHEMAS[type].groups.flatMap((g) => g.params);
}

export function defaultParams(type) {
  const out = {};
  for (const p of flatParams(type)) out[p.k] = p.def;
  return out;
}

// ------- value snapping (keeps every stored value exactly representable in the seed code)

export function snapValue(p, v) {
  switch (p.type) {
    case 'int':
      return Math.min(p.max, Math.max(p.min, Math.round(v)));
    case 'float': {
      const q = Math.min(p.steps, Math.max(0, Math.round(((v - p.min) / (p.max - p.min)) * p.steps)));
      return p.min + ((p.max - p.min) * q) / p.steps;
    }
    case 'choice':
      return p.options.includes(v) ? v : p.options[0];
    case 'color': {
      const n = parseInt(String(v).replace('#', ''), 16) || 0;
      const r = (n >> 20) & 15, g = (n >> 12) & 15, b = (n >> 4) & 15;
      const m = ((r * 17) << 16) | ((g * 17) << 8) | (b * 17);
      return '#' + m.toString(16).padStart(6, '0');
    }
  }
}

export function snapParams(type, params) {
  const out = {};
  for (const p of flatParams(type)) out[p.k] = snapValue(p, params[p.k] ?? p.def);
  return out;
}

// ------- randomizer: rolls a whole specimen from one number, within curated ranges

function jitterHex(hex, rng) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  h = (h + rng.spread(0.025) + 1) % 1;
  s = Math.min(1, Math.max(0, s + rng.spread(0.1)));
  const L = Math.min(0.92, Math.max(0.12, l + rng.spread(0.08)));
  const f = (p, q, t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = L < 0.5 ? L * (1 + s) : L + s - L * s;
  const p2 = 2 * L - q;
  const R = Math.round(f(p2, q, h + 1 / 3) * 255), G = Math.round(f(p2, q, h) * 255), B = Math.round(f(p2, q, h - 1 / 3) * 255);
  return '#' + (((R << 16) | (G << 8) | B) >>> 0).toString(16).padStart(6, '0');
}

export function randomParams(type, rseed) {
  const rng = new Rng(rseed >>> 0);
  const out = {};
  for (const p of flatParams(type)) {
    switch (p.type) {
      case 'float': {
        const [a, b] = p.r ?? [0, 1];
        out[p.k] = snapValue(p, p.min + (p.max - p.min) * rng.float(a, b));
        break;
      }
      case 'int': {
        const [a, b] = p.r ?? [0, 1];
        out[p.k] = Math.round(p.min + (p.max - p.min) * rng.float(a, b));
        break;
      }
      case 'choice': {
        if (p.weights) {
          let t = rng.next() * p.weights.reduce((s, w) => s + w, 0);
          let idx = 0;
          for (let i = 0; i < p.weights.length; i++) {
            t -= p.weights[i];
            if (t <= 0) { idx = i; break; }
          }
          out[p.k] = p.options[idx];
        } else out[p.k] = rng.pick(p.options);
        break;
      }
      case 'color': {
        const pal = PALETTES[p.palette] ?? ['#5f7d64'];
        out[p.k] = snapValue(p, jitterHex(rng.pick(pal), rng));
        break;
      }
    }
  }
  const seed = (rng.next() * 0xffffffff) >>> 0;
  return { params: out, seed };
}

// ------- whimsical packet names

const ADJECTIVES = [
  'moonlit', 'pearly', 'drowsy', 'glassy', 'misty', 'freckled', 'sleepy', 'silver',
  'lacquered', 'dappled', 'quiet', 'velvet', 'bashful', 'tipsy', 'gentle', 'wandering',
  'curious', 'softest', 'honeyed', 'foggy', 'plucky', 'dusky', 'brimming', 'wobbly',
];

export function nameFromCode(type, code) {
  const h = hashString(code);
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const nouns = SCHEMAS[type].nouns;
  const noun = nouns[(h >>> 8) % nouns.length];
  return `${adj} ${noun}`;
}
