// The bench — a floating specimen viewport. The model sits still; you orbit,
// pan and zoom it with the mouse (OrbitControls on its own little renderer).
// The whole panel drags around the screen by its grip.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generate } from './generators/index.js';
import { toonRamp } from './materials.js';
import { disposeMeshDeep } from './generators/common.js';
import { COMPACT_MEDIA } from './ui.js';

const POS_KEY = 'bench-pos-v1';

export function createBench() {
  const card = document.getElementById('bench');
  const canvas = document.getElementById('bench-canvas');
  const grip = document.getElementById('bench-grip');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const width = () => canvas.clientWidth || 230;
  const height = () => canvas.clientHeight || 190;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width(), height(), false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene(); // background stays null: the glass shows through

  const hemi = new THREE.HemisphereLight('#fff0dc', '#b3bb9e', 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3e0', 2.0);
  sun.position.set(3.5, 6, 4.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -5;
  sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -3;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 25;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(38, width() / height(), 0.05, 80);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.4;
  controls.maxDistance = 30;

  const puck = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshToonMaterial({ color: '#a9b787', gradientMap: toonRamp })
  );
  puck.rotation.x = -Math.PI / 2;
  puck.position.y = 0.005;
  puck.receiveShadow = true;
  scene.add(puck);

  let mesh = null;
  let framed = false;

  function setDesign({ type, params, seed }) {
    if (mesh) {
      disposeMeshDeep(mesh);
      scene.remove(mesh);
      mesh = null;
    }
    mesh = generate(type, params, seed >>> 0, {});
    scene.add(mesh);

    mesh.geometry.computeBoundingSphere();
    const bs = mesh.geometry.boundingSphere;
    const r = Math.max(0.35, bs.radius);
    const cy = Math.max(bs.center.y, r * 0.4);
    const dist = r * 2.35 + Math.hypot(bs.center.x, bs.center.z) + 0.25;
    const target = new THREE.Vector3(0, cy * 0.85, 0);

    if (!framed) {
      camera.position.set(dist * 0.78, cy + r * 0.7, dist * 0.85);
      framed = true;
    } else {
      // keep the angle you chose, refit the distance to the new specimen
      const dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-6) dir.set(0.7, 0.6, 0.8);
      camera.position.copy(target).addScaledVector(dir.normalize(), dist);
    }
    controls.target.copy(target);
    controls.update();

    const fp = Math.max(0.45, mesh.userData.footprint ?? 0.6);
    puck.scale.setScalar(fp * 1.3);
  }

  // On a phone the bench is docked at the top of the potting-bench pane, and
  // is hidden entirely while you are at the bed. `visible` is kept by the
  // observer below so a hidden pane costs nothing to draw.
  let visible = true;

  function update() {
    if (!visible) return;
    controls.update();
    renderer.render(scene, camera);
  }

  // ---------- docking ----------

  const compact = window.matchMedia?.(COMPACT_MEDIA);
  const isCompact = () => !!compact?.matches;

  function restorePosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(POS_KEY));
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && (saved.x > 4 || saved.y > 4)) {
        const vw = window.innerWidth || 1280, vh = window.innerHeight || 720;
        card.style.left = `${Math.min(Math.max(saved.x, 8), vw - 80)}px`;
        card.style.top = `${Math.min(Math.max(saved.y, 8), vh - 80)}px`;
        card.style.right = 'auto';
      }
    } catch {
      /* fine */
    }
  }

  // a docked bench must not wear the position the floating one remembers
  function applyDock() {
    if (isCompact()) card.style.left = card.style.top = card.style.right = '';
    else restorePosition();
  }
  applyDock();
  compact?.addEventListener?.('change', applyDock);

  // The canvas is 190px on a desktop and a slice of the viewport on a phone,
  // and the pane's journal starts directly under the card — so watch both
  // boxes rather than assuming either never moves.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      visible = w > 0 && h > 0;
      if (!visible) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }).observe(canvas);

    new ResizeObserver(() => {
      const h = card.offsetHeight;
      if (h > 0) document.documentElement.style.setProperty('--bench-h', `${Math.round(h)}px`);
    }).observe(card);
  }

  // ---------- draggable panel (desktop only) ----------

  let drag = null;
  grip.addEventListener('pointerdown', (e) => {
    if (isCompact()) return;
    const r = card.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    grip.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const w = card.offsetWidth, h = card.offsetHeight;
    const x = Math.min(Math.max(e.clientX - drag.dx, 8), (window.innerWidth || 1280) - w - 8);
    const y = Math.min(Math.max(e.clientY - drag.dy, 8), (window.innerHeight || 720) - h - 8);
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.right = 'auto';
  });
  const endDrag = () => {
    if (!drag) return;
    drag = null;
    if (!card.offsetWidth) return; // not laid out (hidden/collapsed viewport) — don't save junk
    const r = card.getBoundingClientRect();
    try {
      localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left, y: r.top }));
    } catch {
      /* fine */
    }
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);

  return { setDesign, update };
}
