// A block — the square of land between four intersections: a lawn, a couple
// of pastel houses with pitched roofs, a sidewalk, sometimes a tree and a
// street lamp. Monument-Valley-adjacent, hand-wobbled, merged per block.

import * as THREE from 'three';
import { Rng, fbm3, hashString } from './rng.js';
import { groundMaterial, srgbLinear, glowTexture } from './materials.js';
import { xform, finalize, paintByPosition, clamp01 } from './generators/common.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { generateTree } from './generators/tree.js';
import { randomParams } from './params.js';
import { GRID_S } from './world-constants.js';
import { ROAD_W } from './roundabout.js';

const HOUSE_COLORS = ['#e8c8b8', '#d9a68f', '#c9d4b8', '#e6d3a8', '#d8b8c4', '#c4cbd6', '#e2b39a', '#efe0c8'];
const ROOF_COLORS = ['#b06a55', '#8a6f5c', '#a5535e', '#7d8f6a', '#9c7f68', '#c98a6b'];

function wobbleGeom(geo, amt, rng) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = fbm3(x * 1.3 + 7, y * 1.3, z * 1.3 + 7, 2, 5);
    pos.setXYZ(i, x + (n - 0.5) * amt, y + (fbm3(y, x, z, 2, 9) - 0.5) * amt * 0.6, z + (fbm3(z, y, x, 2, 13) - 0.5) * amt);
  }
  return geo;
}

// triangular-prism roof lying along z
function roofGeometry(w, h, d) {
  const hw = w / 2, hd = d / 2;
  const verts = [
    // front triangle
    [-hw, 0, hd], [hw, 0, hd], [0, h, hd],
    // back triangle
    [hw, 0, -hd], [-hw, 0, -hd], [0, h, -hd],
    // left slope
    [-hw, 0, -hd], [-hw, 0, hd], [0, h, hd], [-hw, 0, -hd], [0, h, hd], [0, h, -hd],
    // right slope
    [hw, 0, hd], [hw, 0, -hd], [0, h, -hd], [hw, 0, hd], [0, h, -hd], [0, h, hd],
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts.flat(), 3));
  g.computeVertexNormals();
  return g;
}

function buildHouse(parts, rng, x, z, facing) {
  const w = rng.float(2.6, 4.2);
  const d = rng.float(2.4, 3.6);
  const h = rng.float(1.8, 3.2);
  const wallHex = HOUSE_COLORS[rng.int(0, HOUSE_COLORS.length - 1)];
  const roofHex = ROOF_COLORS[rng.int(0, ROOF_COLORS.length - 1)];
  const wall = srgbLinear(wallHex);
  const wallShade = wall.clone().multiplyScalar(0.82);

  const body = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  wobbleGeom(body, 0.07, rng);
  xform(body, { pos: [0, h / 2, 0] });
  paintByPosition(body, (c, bx, by, bz) => {
    c.copy(wall).lerp(wallShade, clamp01((h - by) / h) * 0.25 + (fbm3(bx, by, bz, 2, 3) - 0.5) * 0.16);
  });

  const roof = roofGeometry(w * 1.14, rng.float(0.7, 1.4), d * 1.12);
  wobbleGeom(roof, 0.05, rng);
  xform(roof, { pos: [0, h - 0.02, 0] });
  const roofC = srgbLinear(roofHex);
  paintByPosition(roof, (c, bx, by) => c.copy(roofC).multiplyScalar(1 + (by > 0.1 ? 0.08 : -0.04) + rng.spread(0.03)));

  const houseParts = [body, roof];

  if (rng.chance(0.7)) {
    const chimney = new THREE.BoxGeometry(0.32, rng.float(0.5, 0.9), 0.32);
    xform(chimney, { pos: [w * rng.float(-0.28, 0.28), h + 0.5, d * rng.float(-0.2, 0.2)] });
    paintByPosition(chimney, (c) => c.copy(srgbLinear('#b09084')).multiplyScalar(1 + rng.spread(0.05)));
    houseParts.push(chimney);
  }

  // door + windows: small proud slabs on the facing side
  const ink = srgbLinear('#6b5a52');
  const cream = srgbLinear('#f4e8d2');
  const door = new THREE.BoxGeometry(0.5, 0.92, 0.06);
  xform(door, { pos: [w * rng.float(-0.22, 0.22), 0.46, d / 2 + 0.02] });
  paintByPosition(door, (c) => c.copy(ink).multiplyScalar(1 + rng.spread(0.05)));
  houseParts.push(door);
  const winCount = rng.int(1, 3);
  for (let i = 0; i < winCount; i++) {
    const win = new THREE.BoxGeometry(0.42, 0.42, 0.05);
    xform(win, { pos: [w * rng.float(-0.36, 0.36), h * rng.float(0.45, 0.72), d / 2 + 0.02] });
    paintByPosition(win, (c) => c.copy(rng.chance(0.6) ? cream : ink).multiplyScalar(1 + rng.spread(0.04)));
    houseParts.push(win);
  }

  for (const g of houseParts) {
    xform(g, { pos: [x, 0, z], rotY: facing });
    parts.push(finalize(g));
  }

  return { x, z, hw: Math.max(w, d) * 0.62 + 0.25, h };
}

// bi, bj: block whose corners are intersections (bi,bj)..(bi+1,bj+1)
export function buildBlock(bi, bj, scene) {
  const rng = new Rng(hashString(`block:${bi},${bj}`));
  const group = new THREE.Group();
  const cx = (bi + 0.5) * GRID_S;
  const cz = (bj + 0.5) * GRID_S;
  group.position.set(cx, 0, cz);

  const half = (GRID_S - ROAD_W) / 2; // no lawns, no sidewalks — houses float in the mist
  const colliders = [];
  const parts = [];

  // houses: 1-3, each a few steps back from a street line, facing it
  const nHouses = rng.int(1, 3);
  const sides = [0, 1, 2, 3].sort(() => rng.next() - 0.5);
  for (let k = 0; k < nHouses; k++) {
    const side = sides[k];
    const a = (side * Math.PI) / 2;
    const along = rng.float(-half * 0.55, half * 0.55);
    const back = half - rng.float(3.5, 9);
    const hx = Math.sin(a) * back + Math.cos(a) * along;
    const hz = Math.cos(a) * back - Math.sin(a) * along;
    const col = buildHouse(parts, rng, hx, hz, a);
    colliders.push({ type: 'circle', x: cx + col.x, z: cz + col.z, r: col.hw });
  }

  const merged = new THREE.Mesh(mergeGeometries(parts, false), groundMaterial);
  merged.castShadow = true;
  merged.receiveShadow = true;
  group.add(merged);

  // sometimes a lawn tree (the real generator, kept small)
  if (rng.chance(0.55)) {
    const { params, seed } = randomParams('tree', rng.int(1, 0xffffff));
    params.groveCount = 1;
    params.height = Math.min(params.height, 3);
    params.puffSize = Math.min(params.puffSize, 0.8);
    const tree = generateTree(params, seed, {});
    const tx = rng.float(-half * 0.5, half * 0.5), tz = rng.float(-half * 0.5, half * 0.5);
    tree.position.set(tx, 0, tz);
    group.add(tree);
    colliders.push({ type: 'circle', x: cx + tx, z: cz + tz, r: 0.5 });
  }

  // street lamp on a random corner of the sidewalk
  let lampHalo = null;
  if (rng.chance(0.6)) {
    const la = rng.int(0, 3) * (Math.PI / 2) + Math.PI / 4;
    const lx = Math.cos(la) * (half + 0.5), lz = Math.sin(la) * (half + 0.5);
    const lampParts = [];
    const pole = new THREE.CylinderGeometry(0.05, 0.07, 2.6, 6);
    xform(pole, { pos: [lx, 1.3, lz] });
    paintByPosition(pole, (c) => c.copy(srgbLinear('#5a4a44')));
    lampParts.push(finalize(pole));
    const head = new THREE.SphereGeometry(0.16, 8, 6);
    xform(head, { pos: [lx, 2.66, lz] });
    paintByPosition(head, (c) => c.copy(srgbLinear('#ffe9b0')).multiplyScalar(1.4));
    lampParts.push(finalize(head));
    const lamp = new THREE.Mesh(mergeGeometries(lampParts, false), groundMaterial);
    lamp.castShadow = true;
    group.add(lamp);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, color: '#ffdf8a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    halo.scale.setScalar(1.6);
    halo.position.set(lx, 2.66, lz);
    group.add(halo);
    lampHalo = halo;
    colliders.push({ type: 'circle', x: cx + lx, z: cz + lz, r: 0.22 });
  }

  scene.add(group);
  return {
    group,
    colliders,
    setNight(night) {
      if (lampHalo) lampHalo.material.opacity = night * 0.75;
    },
    dispose() {
      group.traverse((o) => {
        o.geometry?.dispose?.();
        if (o.isSprite) o.material.dispose();
      });
      group.removeFromParent();
    },
  };
}
