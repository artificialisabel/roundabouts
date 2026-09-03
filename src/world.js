// One corner of the neighbourhood — a single intersection, the four blocks
// that meet at it, and the appearing path that circles the bed and runs off
// down each street into the mist. The planting comes from one seed and can
// be re-sown in place; everything else is deterministic from the key.

import { GRID_S, keyOf, centerOf } from './world-constants.js';
import { buildRoundabout, BED_R } from './roundabout.js';
import { buildPathStones, pathUniforms } from './paths.js';
import { buildBlock } from './blocks.js';
import { createPlantings } from './plantings.js';
import { sowBed } from './sowing.js';
import { Rng, hashString } from './rng.js';

const KEY = keyOf(0, 0); // the demo stands at one intersection: the origin

export function createWorld({ scene, seed }) {
  const { x: cx, z: cz } = centerOf(0, 0);

  const roundabout = buildRoundabout({ cx, cz, key: KEY, seed: hashString(KEY) });
  scene.add(roundabout.group);

  const stones = buildPathStones({
    cx,
    cz,
    bedR: BED_R,
    halfSpan: GRID_S / 2,
    rng: new Rng(hashString(`stones:${KEY}`)),
  });
  scene.add(stones);

  // the four blocks whose corners meet here — houses, a lawn tree, a lamp
  const blocks = [[-1, -1], [-1, 0], [0, -1], [0, 0]].map(([bi, bj]) => buildBlock(bi, bj, scene));

  const colliders = [
    { type: 'circle', x: cx, z: cz, r: BED_R + 0.45 },
    ...blocks.flatMap((b) => b.colliders),
  ];

  const plantings = createPlantings(roundabout, scene);
  let sown = 0;

  // clear the bed and grow it again from a number
  function sow(next) {
    for (const id of plantings.ids()) plantings.remove(id);
    sown = next >>> 0;
    for (const record of sowBed(sown, BED_R)) plantings.add(record);
    return sown;
  }
  sow(seed);

  return {
    roundabout,
    plantings,
    sow,
    center: roundabout.center,
    seed: () => sown,
    getColliders: () => colliders,
    update(playerPos, night) {
      pathUniforms.uPlayer.value.set(playerPos.x, 0, playerPos.z);
      for (const b of blocks) b.setNight(night);
    },
  };
}
