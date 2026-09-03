// Grid constants shared by world/blocks/player (kept tiny to avoid cycles).
export const GRID_S = 52; // distance between intersection centres — a real stroll
export const keyOf = (i, j) => `${i},${j}`;
export const parseKey = (key) => key.split(',').map(Number);
export const centerOf = (i, j) => ({ x: i * GRID_S, z: j * GRID_S });
