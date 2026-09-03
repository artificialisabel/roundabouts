// The plants of one roundabout: pure rendering + record state, no input.
// One instance per bed; the records it holds are sown by sowing.js.

import * as THREE from 'three';
import { generate } from './generators/index.js';
import { decode } from './seedcode.js';
import { disposeMeshDeep } from './generators/common.js';

export function createPlantings(roundabout, scene) {
  const group = new THREE.Group();
  scene.add(group);
  const items = new Map(); // id -> {record, mesh}
  let nextId = 1;

  function meshFor(record) {
    const decoded = decode(record.code);
    if (!decoded) return null;
    const mesh = generate(decoded.type, decoded.params, record.iseed >>> 0, {});
    placeMesh(mesh, record);
    return mesh;
  }

  function placeMesh(mesh, record) {
    const wx = roundabout.center.x + record.x;
    const wz = roundabout.center.z + record.z;
    mesh.position.set(wx, roundabout.heightAt(wx, wz) - 0.03, wz);
    mesh.rotation.y = record.rotY;
    mesh.scale.setScalar(record.scale);
  }

  function add(record) {
    const mesh = meshFor(record);
    if (!mesh) return null;
    const id = nextId++;
    mesh.userData.placementId = id;
    group.add(mesh);
    mesh.updateMatrixWorld(); // raycasts must not wait for a render
    items.set(id, { record, mesh });
    return id;
  }

  function remove(id) {
    const entry = items.get(id);
    if (!entry) return;
    disposeMeshDeep(entry.mesh);
    group.remove(entry.mesh);
    items.delete(id);
  }

  // regenerate in place (live editing)
  function rebuild(id, code, iseed) {
    const entry = items.get(id);
    if (!entry) return;
    entry.record.code = code;
    entry.record.iseed = iseed >>> 0;
    const mesh = meshFor(entry.record);
    mesh.userData.placementId = id;
    disposeMeshDeep(entry.mesh);
    group.remove(entry.mesh);
    entry.mesh = mesh;
    group.add(mesh);
    mesh.updateMatrixWorld();
  }

  function move(id, lx, lz) {
    const entry = items.get(id);
    if (!entry) return;
    entry.record.x = lx;
    entry.record.z = lz;
    placeMesh(entry.mesh, entry.record);
    entry.mesh.updateMatrixWorld();
  }

  return {
    group,
    roundabout,
    add,
    remove,
    rebuild,
    move,
    get: (id) => items.get(id),
    ids: () => [...items.keys()],
    meshes: () => [...group.children],
    records: () => [...items.values()].map((e) => e.record),
    count: () => items.size,
    findByIseed: (iseed) => {
      for (const [id, e] of items) if (e.record.iseed === (iseed >>> 0)) return { id, ...e };
      return null;
    },
    treeRecords: () => [...items.values()].filter((e) => e.record.code.startsWith('t')),
    dispose() {
      for (const id of [...items.keys()]) remove(id);
      group.removeFromParent();
    },
  };
}
