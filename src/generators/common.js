// Shared geometry kitchen for all specimen generators. Every part ends up
// non-indexed with the same attribute set (position, normal, color, aBend,
// aPhase) so a whole specimen merges into ONE mesh = one draw call.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plantMaterial, ghostMaterial, srgbLinear } from '../materials.js';

export const lerp = (a, b, t) => a + (b - a) * t;

// lighten/darken + desaturate a hex colour (dl, ds in -1..1)
export function shiftHex(hex, dl, ds = 0) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, clamp01(hsl.s + ds), clamp01(hsl.l + dl));
  return '#' + c.getHexString();
}
export const clamp01 = (t) => Math.min(1, Math.max(0, t));
export const smoothstep = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
export const TAU = Math.PI * 2;
export const GOLDEN = 2.399963229728653; // golden angle, for phyllotaxis spirals

// ---------- attribute painting ----------

export function paintFlat(geom, hex, { rng = null, jitter = 0.06 } = {}) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = srgbLinear(hex);
  for (let i = 0; i < pos.count; i++) {
    const k = rng ? 1 + rng.spread(jitter) : 1;
    colors[i * 3] = c.r * k;
    colors[i * 3 + 1] = c.g * k;
    colors[i * 3 + 2] = c.b * k;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

// gradient along local axis (pre-transform!), base colour -> tip colour
export function paintGradient(geom, cBase, cTip, { axis = 'z', length = 1, rng = null, jitter = 0.05, curve = 1.15 } = {}) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const a = srgbLinear(cBase), b = srgbLinear(cTip);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const coord = axis === 'z' ? pos.getZ(i) : pos.getY(i);
    const t = Math.pow(clamp01(coord / length), curve);
    tmp.copy(a).lerp(b, t);
    const k = rng ? 1 + rng.spread(jitter) : 1;
    colors[i * 3] = tmp.r * k;
    colors[i * 3 + 1] = tmp.g * k;
    colors[i * 3 + 2] = tmp.b * k;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

// paint each vertex via fn(colorOut, x, y, z) — for ground washes, houses…
export function paintByPosition(geom, fn) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(tmp, pos.getX(i), pos.getY(i), pos.getZ(i));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geom;
}

export function setBend(geom, fn) {
  const pos = geom.attributes.position;
  const arr = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    arr[i] = clamp01(typeof fn === 'function' ? fn(pos.getX(i), pos.getY(i), pos.getZ(i)) : fn);
  }
  geom.setAttribute('aBend', new THREE.BufferAttribute(arr, 1));
  return geom;
}

export function setPhase(geom, value) {
  const pos = geom.attributes.position;
  const arr = new Float32Array(pos.count).fill(value % 1);
  geom.setAttribute('aPhase', new THREE.BufferAttribute(arr, 1));
  return geom;
}

// ---------- transforms ----------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

export function xform(geom, { pos = [0, 0, 0], quat = null, rotX = 0, rotY = 0, rotZ = 0, scale = 1 } = {}) {
  const q = quat ? _q.copy(quat) : _q.setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ'));
  if (Array.isArray(scale)) _s.set(scale[0], scale[1], scale[2]);
  else _s.set(scale, scale, scale);
  _m.compose(_v.set(pos[0], pos[1], pos[2]), q, _s);
  geom.applyMatrix4(_m);
  return geom;
}

// ---------- primitive builders ----------

// A blade lying along +Z (base at origin, tip at z=len), bending up in +Y.
// Serves as petal, leaf and grass blade depending on proportions.
export function buildBlade(o, rng = null) {
  const segL = o.segL ?? 7, segW = o.segW ?? 4;
  const len = o.len, halfW = o.width / 2;
  const peak = o.peak ?? 0.45, base = o.base ?? 0.35;
  const taper = o.taper ?? 0.5;
  const tipPow = lerp(2.6, 0.95, taper);
  const tipW = lerp(0.42, 0.04, taper);
  const edgeWave = o.edgeWave ?? 0, edgeFreq = o.edgeFreq ?? 3;
  const cup = o.cup ?? 0, droop = o.droop ?? 0;
  const ruffle = o.ruffle ?? 0, ruffleFreq = o.ruffleFreq ?? 2.5;
  const jitterAmt = o.jitter ?? 0.05;

  const pos = [];
  for (let i = 0; i <= segL; i++) {
    const u = i / segL;
    let f;
    if (u < peak) f = lerp(base, 1, smoothstep(u / peak));
    else f = lerp(1, tipW, Math.pow((u - peak) / (1 - peak), tipPow));
    if (i === segL) f = Math.min(f, 0.05);
    if (edgeWave > 0) f *= 1 - edgeWave * 0.28 * (0.5 + 0.5 * Math.sin(u * TAU * edgeFreq));
    f = Math.max(f, 0.02);
    const rowW = halfW * f * (rng ? 1 + rng.spread(jitterAmt) : 1);
    const z = u * len;
    for (let j = 0; j <= segW; j++) {
      const v = (j / segW) * 2 - 1;
      const x = v * rowW;
      let y =
        cup * halfW * (v * v) -
        droop * len * u * u * 0.6 +
        ruffle * halfW * 0.55 * Math.sin(u * TAU * ruffleFreq) * v;
      if (rng) y += rng.spread(0.01 * len);
      pos.push(x, y, z);
    }
  }
  const idx = [];
  const cols = segW + 1;
  for (let i = 0; i < segL; i++) {
    for (let j = 0; j < segW; j++) {
      const a = i * cols + j;
      idx.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Tube along a curve with a radius function — stems, stalks, pedicels.
export function taperedTube(points, rFn, { radialSegs = 7, rings = 10 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const frames = curve.computeFrenetFrames(rings, false);
  const pos = [];
  const cols = radialSegs + 1;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const c = curve.getPointAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    const r = rFn(t);
    for (let j = 0; j <= radialSegs; j++) {
      const a = (j / radialSegs) * TAU;
      const cx = Math.cos(a), sx = Math.sin(a);
      pos.push(c.x + (N.x * cx + B.x * sx) * r, c.y + (N.y * cx + B.y * sx) * r, c.z + (N.z * cx + B.z * sx) * r);
    }
  }
  const idx = [];
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radialSegs; j++) {
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

// Revolved profile with per-angle wobble — mushroom caps, gill cones.
// profile: array of {x: radius, y: height}; wobbleFn(cosA, sinA, rowIndex) -> radial scale
export function latheWobbled(profile, segs, wobbleFn = null, capTop = true) {
  const pos = [];
  const rows = profile.length;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * TAU;
      const cx = Math.cos(a), sx = Math.sin(a);
      const s = wobbleFn ? wobbleFn(cx, sx, i) : 1;
      pos.push(profile[i].x * s * cx, profile[i].y, profile[i].x * s * sx);
    }
  }
  const idx = [];
  const at = (i, j) => i * segs + (j % segs);
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < segs; j++) {
      idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1), at(i + 1, j));
    }
  }
  let apexIndex = -1;
  if (capTop) {
    apexIndex = pos.length / 3;
    pos.push(0, profile[0].y, 0);
    for (let j = 0; j < segs; j++) idx.push(apexIndex, at(0, j + 1), at(0, j));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Polar grid disc (for the domed flower bed / flat ground washes).
export function discGeometry(R, { rings = 10, segs = 48, yFn = null } = {}) {
  const pos = [];
  pos.push(0, yFn ? yFn(0, 0) : 0, 0);
  for (let i = 1; i <= rings; i++) {
    const r = (i / rings) * R;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * TAU;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      pos.push(x, yFn ? yFn(r, a) : 0, z);
    }
  }
  const idx = [];
  const at = (i, j) => 1 + (i - 1) * segs + (j % segs);
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

// ---------- assembly ----------

export function finalize(geom, { color = '#7d8f6a', bend = 0, phase = 0, rng = null } = {}) {
  if (!geom.attributes.color) paintFlat(geom, color, { rng });
  if (!geom.attributes.aBend) setBend(geom, bend);
  if (!geom.attributes.aPhase) setPhase(geom, phase);
  let g = geom;
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.normal) g.computeVertexNormals();
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

export function mergeToMesh(parts, { ghost = false } = {}) {
  const merged = mergeGeometries(parts, false);
  const mesh = new THREE.Mesh(merged, ghost ? ghostMaterial : plantMaterial);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

// dispose a specimen mesh and any child meshes (ponds carry water/creatures
// as children); materials are shared and never disposed
export function disposeMeshDeep(mesh) {
  mesh.traverse((o) => o.geometry?.dispose?.());
}

// scatter N cluster members: first at the centre, the rest spiralling out
export function clusterOffsets(n, spread, rng, { minScale = 0.75, maxScale = 1.12 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const r = i === 0 ? 0 : spread * (0.3 + 0.7 * Math.sqrt(t)) * (1 + rng.spread(0.25));
    const a = i * GOLDEN + rng.spread(0.6);
    out.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      rotY: rng.float(0, TAU),
      scale: rng.float(minScale, maxScale),
    });
  }
  return out;
}
