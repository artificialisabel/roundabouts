// Seed codes — every specimen packs to a short base-36 code like
// `f1-9k3xw07q2...`: type prefix, schema version, then bit-packed params +
// the 32-bit geometry seed. Paste a code back in to regrow the exact plant.
// A bare number is also accepted: it rolls the whole design from that seed.

import { SCHEMAS, flatParams, snapValue, randomParams } from './params.js';

function paramBits(p) {
  switch (p.type) {
    case 'int':
      return Math.max(1, Math.ceil(Math.log2(p.max - p.min + 1)));
    case 'float':
      return Math.max(1, Math.ceil(Math.log2(p.steps + 1)));
    case 'choice':
      return Math.max(1, Math.ceil(Math.log2(p.options.length)));
    case 'color':
      return 12;
  }
}

function quantize(p, v) {
  switch (p.type) {
    case 'int':
      return Math.min(p.max - p.min, Math.max(0, Math.round(v) - p.min));
    case 'float':
      return Math.min(p.steps, Math.max(0, Math.round(((v - p.min) / (p.max - p.min)) * p.steps)));
    case 'choice': {
      const i = p.options.indexOf(v);
      return i < 0 ? 0 : i;
    }
    case 'color': {
      const n = parseInt(String(v).replace('#', ''), 16) || 0;
      return (((n >> 20) & 15) << 8) | (((n >> 12) & 15) << 4) | ((n >> 4) & 15);
    }
  }
}

function dequantize(p, q) {
  switch (p.type) {
    case 'int':
      return p.min + q;
    case 'float':
      return p.min + ((p.max - p.min) * q) / p.steps;
    case 'choice':
      return p.options[Math.min(q, p.options.length - 1)];
    case 'color': {
      const r = (q >> 8) & 15, g = (q >> 4) & 15, b = q & 15;
      const n = ((r * 17) << 16) | ((g * 17) << 8) | (b * 17);
      return '#' + n.toString(16).padStart(6, '0');
    }
  }
}

const b36parse = (s) => {
  let acc = 0n;
  for (const ch of s) {
    const d = parseInt(ch, 36);
    if (Number.isNaN(d)) return null;
    acc = acc * 36n + BigInt(d);
  }
  return acc;
};

export function encode(type, params, seed) {
  const schema = SCHEMAS[type];
  let acc = 0n;
  // fields written MSB-first; decoded in reverse from the LSB side so
  // leading zeros in the base36 string never matter
  acc = (acc << 32n) | BigInt(seed >>> 0);
  for (const p of flatParams(type)) {
    acc = (acc << BigInt(paramBits(p))) | BigInt(quantize(p, params[p.k] ?? p.def));
  }
  return `${schema.prefix}${schema.version}-${acc.toString(36)}`;
}

export function decode(code) {
  const m = /^([a-z])(\d+)-([0-9a-z]+)$/i.exec(String(code).trim().toLowerCase());
  if (!m) return null;
  const type = Object.keys(SCHEMAS).find((t) => SCHEMAS[t].prefix === m[1]);
  if (!type || SCHEMAS[type].version !== Number(m[2])) return null;
  let acc = b36parse(m[3]);
  if (acc === null) return null;
  const list = flatParams(type);
  const params = {};
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    const bits = BigInt(paramBits(p));
    const q = Number(acc & ((1n << bits) - 1n));
    acc >>= bits;
    params[p.k] = snapValue(p, dequantize(p, q));
  }
  const seed = Number(acc & 0xffffffffn) >>> 0;
  return { type, params, seed };
}

// Accepts either a full code or a bare number ("dice roll") for a given type.
export function parseSeedInput(text, currentType) {
  const t = String(text).trim().toLowerCase();
  if (/^\d{1,10}$/.test(t)) {
    const { params, seed } = randomParams(currentType, Number(t) >>> 0);
    return { type: currentType, params, seed };
  }
  return decode(t);
}
