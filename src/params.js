// Parameter schemas — the single source of truth that drives the UI panel,
// the seed-code bit packing, and the randomizer. Order matters for packing:
// never reorder params within a version, add new ones behind a version bump.

import { Rng, hashString } from './rng.js';
import { SCHEMAS as POND_SCHEMAS, PALETTES as POND_PALETTES } from './pond/params.js';

// mood-board palettes (blush paper, dusty coral, sage, ochre, plum)
export const PALETTES = {
  petal: ['#d96a5e', '#c9485b', '#e8a1b0', '#f2cfc3', '#b48ead', '#e6b34c', '#f6ead2', '#8fa0c9'],
  center: ['#e9b84f', '#c9743f', '#f4e3bc', '#8a5a3b', '#d96a5e', '#7d8f6a'],
  green: ['#7d8f6a', '#5f7d54', '#93a86b', '#4e6b52', '#88a08a', '#a7b47a'],
  cap: ['#c0574f', '#b98b52', '#e0cba8', '#8a6f5c', '#a5535e', '#d9a05b', '#97a08b'],
  stemPale: ['#eadfc6', '#e0cba8', '#d8c49a', '#f0e6d0', '#cbb489'],
  rock: ['#a8a09b', '#9a9aa2', '#b3a68f', '#8f8b86', '#bcb1a6', '#8a8690'],
  moss: ['#7d8f5e', '#93a86b', '#5f7d54', '#a7b47a'],
  grass: ['#6d8a58', '#7d8f6a', '#93a86b', '#5c7d5a', '#a3a86b'],
  grassTip: ['#b9c47e', '#d9c97e', '#a7b47a', '#e0cba8', '#c9b96a'],
  foliage: ['#79a05e', '#8fb06a', '#5d8a52', '#cd85ab', '#dda3bd', '#a8bd6e', '#e0a94f'],
  foliageTip: ['#bccf7e', '#aec46f', '#eab7cd', '#e2cf7a', '#cfe0a3', '#f5cfc0'],
  trunk: ['#7a5a4c', '#8a6f5c', '#6b4a44', '#9c7f68', '#5a4a44'],
  water: ['#4f7d76', '#3f6d78', '#6a9a8e', '#52708c', '#5e8a80', '#476b66', '#6f8aa0'],
  ...POND_PALETTES, // koiBody, jellyBell, pad, lotus… — used by the pond's creature params
};

// lift a creature's params out of the pond app's schema, prefixed so they can
// live inside the garden pond schema (skipping the pond-app-only groups)
function embedPondCreature(type, prefix, labelPrefix, skipGroups, keepKeys = null) {
  return POND_SCHEMAS[type].groups
    .filter((g) => !skipGroups.includes(g.label) || keepKeys)
    .map((g) => {
      const skip = skipGroups.includes(g.label);
      const params = g.params
        .filter((p) => (skip ? keepKeys?.includes(p.k) : true))
        .map((p) => ({ ...p, k: prefix + p.k }));
      return params.length ? { label: `${labelPrefix} · ${g.label}`, params } : null;
    })
    .filter(Boolean);
}

const F = (k, label, min, max, def, r, steps = 48) => ({ type: 'float', k, label, min, max, def, r, steps });
const I = (k, label, min, max, def, r) => ({ type: 'int', k, label, min, max, def, r });
const C = (k, label, def, palette) => ({ type: 'color', k, label, def, palette });
const CH = (k, label, options, def, weights) => ({ type: 'choice', k, label, options, def, weights });

export const SCHEMAS = {
  flower: {
    label: 'flower',
    prefix: 'f',
    version: 1,
    nouns: ['foxglove', 'poppy', 'bellbloom', 'primrose', 'cosmos', 'hollyhock', 'buttercup', 'anemone', 'larkspur', 'zinnia', 'mallow', 'campion'],
    groups: [
      {
        label: 'petals',
        params: [
          I('petalCount', 'petals per bloom', 3, 16, 6, [0.15, 0.85]),
          F('petalLen', 'petal length', 0.15, 0.85, 0.42, [0.25, 0.8]),
          F('petalWidth', 'petal width', 0.06, 0.6, 0.22, [0.2, 0.75]),
          F('taper', 'round ⟷ pointy', 0, 1, 0.4),
          F('ruffle', 'ruffled edges', 0, 1, 0.15, [0, 0.7]),
          F('open', 'cupped ⟷ open', 0, 1, 0.6, [0.2, 0.95]),
          F('curl', 'petal curl', -1, 1, 0.25),
        ],
      },
      {
        label: 'blooms',
        params: [
          CH('arrangement', 'on the stalk', ['single', 'spike', 'cluster'], 'single', [0.4, 0.32, 0.28]),
          I('bloomCount', 'blooms per stalk', 1, 20, 8, [0.25, 0.8]),
          F('bloomScale', 'bloom size', 0.35, 1.2, 0.75),
          F('centerSize', 'flower centre', 0.04, 0.3, 0.12),
        ],
      },
      {
        label: 'stalk',
        params: [
          F('height', 'stalk height', 0.35, 3, 1.25, [0.25, 0.85]),
          F('lean', 'lean & sway', 0, 0.5, 0.14),
          I('stemLeaves', 'leaves on stalk', 0, 4, 2),
        ],
      },
      {
        label: 'colours',
        params: [
          C('petalColor', 'petal', '#d96a5e', 'petal'),
          C('petalTip', 'petal tip', '#f2cfc3', 'petal'),
          C('centerColor', 'centre', '#e9b84f', 'center'),
          C('stemColor', 'stem & leaf', '#7d8f6a', 'green'),
        ],
      },
      {
        label: 'the patch',
        params: [
          I('bushCount', 'flowers in patch', 1, 12, 3, [0.1, 0.7]),
          F('spread', 'patch spread', 0.25, 2, 0.85),
        ],
      },
    ],
  },

  mushroom: {
    label: 'mushroom',
    prefix: 'm',
    version: 1,
    nouns: ['toadstool', 'bonnet', 'puffcap', 'inkcap', 'chanterelle', 'morel', 'buttonpuff', 'fairycap', 'stinkhorn', 'milkcap'],
    groups: [
      {
        label: 'cap',
        params: [
          F('capRadius', 'cap radius', 0.1, 0.8, 0.3, [0.2, 0.8]),
          F('capHeight', 'cap height', 0.05, 0.7, 0.22, [0.15, 0.75]),
          F('profile', 'flat ⟷ pointy', 0, 1, 0.45),
          F('flare', 'rim curl-under', 0, 1, 0.35),
          F('wobble', 'hand-thrown wobble', 0, 1, 0.35, [0.1, 0.8]),
          F('spots', 'freckles', 0, 1, 0.5),
        ],
      },
      {
        label: 'base',
        params: [
          F('stemHeight', 'stem height', 0.08, 1.2, 0.34, [0.15, 0.8]),
          F('stemThick', 'stem thickness', 0.03, 0.22, 0.08),
          F('stemLean', 'stem lean', 0, 1, 0.3, [0, 0.75]),
          F('stemBulge', 'bulbous base', 0, 1, 0.4),
        ],
      },
      {
        label: 'colours',
        params: [
          C('capColor', 'cap', '#c0574f', 'cap'),
          C('spotColor', 'freckles', '#f0e6d0', 'stemPale'),
          C('stemColor', 'stem', '#eadfc6', 'stemPale'),
        ],
      },
      {
        label: 'the cluster',
        params: [
          I('clusterCount', 'mushrooms in cluster', 1, 15, 5, [0.15, 0.75]),
          F('spread', 'cluster spread', 0.15, 1.5, 0.5),
          F('sizeVar', 'big ones, little ones', 0, 1, 0.6),
        ],
      },
    ],
  },

  plant: {
    label: 'plant',
    prefix: 'p',
    version: 1,
    nouns: ['fern', 'hosta', 'sprout', 'thicket', 'frond', 'clover', 'sorrel', 'bracken', 'nettle', 'plume'],
    groups: [
      {
        label: 'leaves',
        params: [
          F('leafLen', 'leaf length', 0.2, 1.5, 0.65, [0.25, 0.85]),
          F('leafWidth', 'leaf width', 0.05, 0.65, 0.22, [0.2, 0.8]),
          F('taper', 'round ⟷ pointy', 0, 1, 0.55),
          F('serration', 'smooth ⟷ jagged', 0, 1, 0.2),
          F('fold', 'leaf fold', -1, 1, 0.35),
        ],
      },
      {
        label: 'the bush',
        params: [
          I('stemCount', 'stems', 2, 16, 7, [0.25, 0.85]),
          I('leavesPerStem', 'leaves per stem', 1, 12, 6, [0.3, 0.85]),
          F('arch', 'upright ⟷ weeping', 0, 1, 0.5),
          F('height', 'bush height', 0.2, 1.8, 0.75, [0.25, 0.8]),
          F('messiness', 'tidy ⟷ wild', 0, 1, 0.45),
        ],
      },
      {
        label: 'colours',
        params: [
          C('leafColor', 'leaf', '#5f7d54', 'green'),
          C('tipColor', 'leaf tip', '#93a86b', 'grassTip'),
          C('stemColor', 'stems', '#6b7050', 'green'),
        ],
      },
      {
        label: 'the patch',
        params: [
          I('bushCount', 'bushes in patch', 1, 6, 1, [0, 0.5]),
          F('spread', 'patch spread', 0.3, 2, 0.9),
        ],
      },
    ],
  },

  tree: {
    label: 'tree',
    prefix: 't',
    version: 1,
    nouns: ['flamingo tree', 'pompom', 'cube tree', 'sapling', 'lollipop', 'willow', 'penny tree', 'bonsai', 'broccolino', 'shade tree'],
    groups: [
      {
        label: 'trunk',
        params: [
          F('height', 'tree height', 0.8, 4.5, 2.2, [0.3, 0.8]),
          F('trunkThick', 'trunk thickness', 0.04, 0.3, 0.11, [0.15, 0.7]),
          F('crook', 'straight ⟷ crooked', 0, 1, 0.35),
          I('branchCount', 'branches', 0, 6, 3, [0.3, 0.9]),
        ],
      },
      {
        label: 'canopy',
        params: [
          CH('style', 'foliage style', ['clouds', 'cubes', 'drops'], 'clouds', [0.5, 0.3, 0.2]),
          I('puffCount', 'leaf puffs', 1, 14, 5, [0.25, 0.8]),
          F('puffSize', 'puff size', 0.2, 1.2, 0.55, [0.25, 0.65]),
          F('canopy', 'canopy width', 0.2, 1.5, 0.7),
        ],
      },
      {
        label: 'colours',
        params: [
          C('foliageColor', 'foliage', '#7d8f6a', 'foliage'),
          C('foliageTip', 'sunlit tops', '#a7b47a', 'foliageTip'),
          C('trunkColor', 'trunk', '#7a5a4c', 'trunk'),
        ],
      },
      {
        label: 'the grove',
        params: [
          I('groveCount', 'trees in grove', 1, 5, 1, [0, 0.45]),
          F('spread', 'grove spread', 0.5, 2.5, 1.2),
        ],
      },
    ],
  },

  rock: {
    label: 'rock',
    prefix: 'r',
    version: 1,
    nouns: ['boulder', 'pebble', 'knoll', 'cairn', 'cobble', 'erratic', 'shard', 'lump'],
    groups: [
      {
        label: 'shape',
        params: [
          F('size', 'size', 0.12, 1.5, 0.5, [0.2, 0.8]),
          F('squash', 'flat ⟷ tall', 0.35, 1.3, 0.7),
          F('elongate', 'round ⟷ long', 0.6, 1.8, 1.1),
          F('angular', 'smooth ⟷ angular', 0, 1, 0.55),
          F('bumpy', 'bumpiness', 0, 1, 0.45),
        ],
      },
      {
        label: 'colours',
        params: [
          C('rockColor', 'stone', '#9d928c', 'rock'),
          F('moss', 'mossiness', 0, 1, 0.35),
          C('mossColor', 'moss', '#7d8f5e', 'moss'),
        ],
      },
      {
        label: 'the pile',
        params: [
          I('clusterCount', 'rocks in pile', 1, 9, 3, [0.1, 0.6]),
          F('spread', 'pile spread', 0.2, 1.8, 0.65),
        ],
      },
    ],
  },

  grass: {
    label: 'grass',
    prefix: 'g',
    version: 1,
    nouns: ['meadow', 'tuft', 'sedge', 'sward', 'whisper', 'tussock', 'fringe', 'hem'],
    groups: [
      {
        label: 'blades',
        params: [
          F('bladeHeight', 'blade height', 0.08, 1, 0.32, [0.2, 0.8]),
          F('bladeWidth', 'blade width', 0.008, 0.06, 0.026, [0.2, 0.7]),
          F('bend', 'upright ⟷ bowed', 0, 1, 0.45),
          F('messy', 'combed ⟷ unruly', 0, 1, 0.5),
        ],
      },
      {
        label: 'colours',
        params: [
          C('baseColor', 'base', '#6d8a58', 'grass'),
          C('tipColor', 'tip', '#b9c47e', 'grassTip'),
        ],
      },
      {
        label: 'the tuft',
        params: [
          I('density', 'blades', 15, 250, 90, [0.25, 0.85]),
          F('radius', 'tuft radius', 0.25, 2, 0.8),
        ],
      },
    ],
  },

  pond: {
    label: 'pond',
    prefix: 'w',
    version: 2, // v2: creature params surfaced — old w1 codes won't sprout
    nouns: ['mirror', 'basin', 'moonpool', 'stillwater', 'dewpond', 'birdbath', 'lagoon', 'looking glass', 'puddle'],
    groups: [
      {
        label: 'water',
        params: [
          F('radius', 'pond radius', 0.7, 3, 1.4, [0.2, 0.7]),
          F('depth', 'shallow ⟷ deep', 0.2, 1, 0.6),
          C('waterColor', 'water', '#4f7d76', 'water'),
        ],
      },
      {
        label: 'pond life',
        params: [
          I('koiCount', 'koi', 0, 5, 2, [0.2, 0.7]),
          I('lilyCount', 'lily rafts', 0, 4, 2, [0.25, 0.8]),
          I('jellyCount', 'moon jellies', 0, 4, 0, [0, 0.4]),
        ],
      },
      ...embedPondCreature('fish', 'koi_', 'koi', ['the school']),
      ...embedPondCreature('jelly', 'jel_', 'jellies', ['the smack']),
      ...embedPondCreature('lily', 'lil_', 'lilies', ['the raft'], ['padCount']),
    ],
  },
};

export const TYPE_ORDER = ['flower', 'mushroom', 'plant', 'tree', 'rock', 'grass', 'pond'];

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
  // quick rgb->hsl
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
  // hsl->rgb
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
        const pal = PALETTES[p.palette] ?? ['#7d8f6a'];
        out[p.k] = snapValue(p, jitterHex(rng.pick(pal), rng));
        break;
      }
    }
  }
  // geometry seed rolled from the same stream so the whole thing is one number
  const seed = (rng.next() * 0xffffffff) >>> 0;
  return { params: out, seed };
}

// ------- whimsical packet names

const ADJECTIVES = [
  'blushing', 'dozing', 'velvet', 'paper', 'dusty', 'honeyed', 'moonlit', 'freckled',
  'bashful', 'tipsy', 'curious', 'quiet', 'plucky', 'sleepy', 'gentle', 'wild',
  'dainty', 'crooked', 'merry', 'foggy', 'sunlit', 'pocket', 'humming', 'softest',
];

export function nameFromCode(type, code) {
  const h = hashString(code);
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const nouns = SCHEMAS[type].nouns;
  const noun = nouns[(h >>> 8) % nouns.length];
  return `${adj} ${noun}`;
}
