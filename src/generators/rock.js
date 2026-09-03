// Rock generator — noise-dented icosahedra with flattened bottoms, a dusting
// of moss on top, smooth boulders or chunky angular shards.

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, fbm3 } from '../rng.js';
import { xform, setBend, setPhase, finalize, mergeToMesh, clusterOffsets, lerp, clamp01 } from './common.js';
import { srgbLinear } from '../materials.js';

function buildRock(p, rng, noiseSeed) {
  let geo = new THREE.IcosahedronGeometry(1, 2);
  const angular = p.angular > 0.55;
  if (!angular) geo = mergeVertices(geo); // shared verts -> smooth normals

  const freq = lerp(0.9, 2.1, p.bumpy);
  const amp = lerp(0.1, 0.42, p.bumpy);
  const off = rng.float(0, 40);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
    const n = fbm3(v.x * freq + off, v.y * freq + off, v.z * freq + off, angular ? 2 : 3, noiseSeed);
    const d = 1 + (n - 0.5) * 2 * amp;
    pos.setXYZ(i, v.x * d, v.y * d, v.z * d);
  }

  const size = p.size;
  const sx = size * p.elongate;
  const sy = size * p.squash;
  const sz = size * rng.float(0.8, 1.1);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * sx, y = pos.getY(i) * sy, z = pos.getZ(i) * sz;
    if (y < 0) y *= 0.3; // sit flat in the soil
    pos.setXYZ(i, x, y - size * 0.04, z);
  }
  geo.computeVertexNormals();

  // stone wash + moss on the upward faces
  const rock = srgbLinear(p.rockColor);
  const moss = srgbLinear(p.mossColor);
  const nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), ny = nor.getY(i);
    const ao = lerp(0.72, 1.05, clamp01(y / (size * p.squash * 0.9) + 0.35));
    const patch = clamp01(fbm3(pos.getX(i) * 2.4 + off, y * 2.4, pos.getZ(i) * 2.4 + off, 2, noiseSeed + 7) * 1.9 - 0.55);
    const m = clamp01((ny - 0.3) / 0.45) * patch * p.moss;
    tmp.copy(rock).lerp(moss, m).multiplyScalar(ao * (1 + rng.spread(0.05)));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  setBend(geo, 0);
  setPhase(geo, 0);
  return geo;
}

export function generateRock(p, seed, { ghost = false } = {}) {
  const rng = new Rng(seed);
  const noiseSeed = (seed >>> 1) ^ 0x51ab3c;
  const parts = [];
  const offsets = clusterOffsets(p.clusterCount, p.spread + p.size * 0.7, rng, { minScale: 1, maxScale: 1 });
  offsets.forEach((off, i) => {
    const g = buildRock(p, rng, noiseSeed + i * 31);
    const scale = i === 0 ? 1 : rng.float(0.3, 0.75);
    xform(g, { pos: [off.x, 0, off.z], rotY: off.rotY, scale });
    parts.push(finalize(g));
  });
  const mesh = mergeToMesh(parts, { ghost });
  mesh.receiveShadow = true;
  mesh.userData.footprint = p.spread * 0.7 + p.size;
  return mesh;
}
