import { generateFlower } from './flower.js';
import { generateMushroom } from './mushroom.js';
import { generatePlant } from './plant.js';
import { generateTree } from './tree.js';
import { generateRock } from './rock.js';
import { generateGrass } from './grass.js';
import { generatePond } from './pond.js';

export const GENERATORS = {
  flower: generateFlower,
  mushroom: generateMushroom,
  plant: generatePlant,
  tree: generateTree,
  rock: generateRock,
  grass: generateGrass,
  pond: generatePond,
};

export function generate(type, params, seed, opts = {}) {
  return GENERATORS[type](params, seed, opts);
}
