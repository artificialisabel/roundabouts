// The appearing paths — stepping stones along the street grid that only
// exist near you: each stone grows out of the mist as you approach (vertex
// scale by distance to the player, fully GPU-side) and sinks away behind.

import * as THREE from 'three';
import { toonRamp, injectHeightMist } from './materials.js';

export const pathUniforms = {
  uPlayer: { value: new THREE.Vector3(0, 0, 14.5) },
};

// stones fully grown within NEAR, gone past FAR
const NEAR = 6.5;
const FAR = 11;

export const stoneGeometry = (() => {
  const g = new THREE.CylinderGeometry(0.5, 0.58, 0.07, 7);
  g.scale(1.2, 1, 0.85);
  return g;
})();

export const stoneMaterial = (() => {
  const mat = new THREE.MeshToonMaterial({ color: '#e3d4c2', gradientMap: toonRamp });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayer = pathUniforms.uPlayer;
    shader.vertexShader =
      `uniform vec3 uPlayer;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
        {
          float d = distance(vec2(instanceMatrix[3][0], instanceMatrix[3][2]), uPlayer.xz);
          transformed *= smoothstep(${FAR.toFixed(1)}, ${NEAR.toFixed(1)}, d);
        }
        #endif`
      );
    injectHeightMist(shader);
  };
  mat.customProgramCacheKey = () => 'appearing-path-mist';
  return mat;
})();

// build the stones for one intersection: four stubs out to the cell midpoint
// plus a walking ring around the bed. Returns an InstancedMesh in world coords.
export function buildPathStones({ cx, cz, bedR, halfSpan, rng }) {
  const mats = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();

  const push = (x, z) => {
    q.setFromEuler(new THREE.Euler(0, rng.float(0, Math.PI * 2), 0));
    s.setScalar(rng.float(0.8, 1.15));
    m.compose(v.set(x, 0.02, z), q, s);
    mats.push(m.clone());
  };

  // ring around the bed
  const ringR = bedR + 1.7;
  const ringN = Math.round(ringR * 4.2);
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2 + rng.spread(0.04);
    push(cx + Math.cos(a) * (ringR + rng.spread(0.35)), cz + Math.sin(a) * (ringR + rng.spread(0.35)));
  }

  // four stubs to the cell midpoints (the neighbor's stub completes the path)
  const spacing = 1.45;
  for (let dir = 0; dir < 4; dir++) {
    const ang = (dir * Math.PI) / 2;
    const dx = Math.sin(ang), dz = Math.cos(ang);
    for (let t = ringR + spacing * 0.7; t <= halfSpan; t += spacing) {
      const sway = Math.sin(t * 0.55 + dir * 2.1) * 0.6 + rng.spread(0.4);
      push(cx + dx * t - dz * sway, cz + dz * t + dx * sway);
    }
  }

  const mesh = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, mats.length);
  mats.forEach((mat, i) => mesh.setMatrixAt(i, mat));
  const tint = new THREE.Color();
  for (let i = 0; i < mats.length; i++) {
    tint.setHSL(0.09 + rng.spread(0.02), 0.18, 0.72 + rng.spread(0.06), THREE.SRGBColorSpace);
    mesh.setColorAt(i, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // instances span the whole cell
  return mesh;
}
