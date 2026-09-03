import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './style.css';
import { buildEnvironment } from './environment.js';
import { createWeather } from './weather.js';
import { windUniforms } from './materials.js';
import { waterUniforms } from './pond/materials.js';
import { createUI } from './ui.js';
import { createBench } from './bench.js';
import { createPlayer } from './player.js';
import { createWorld } from './world.js';
import { encode, decode, parseSeedInput } from './seedcode.js';
import { randomParams } from './params.js';
import { randomSeed } from './rng.js';
import { BED_R } from './roundabout.js';
import { showNoWebGL } from './no-webgl.js';
import { initTouch } from './touch.js';

// ---------- renderer / scene / camera ----------

const canvas = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (err) {
  // three throws at module scope when there is no context, which would leave
  // the page blank with no explanation — say something instead
  showNoWebGL();
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// The canvas is sized by CSS (100vw × 100lvh) so it keeps covering the screen
// while a phone browser's chrome slides in and out. Measure that box rather
// than the window, and pass updateStyle=false so three never writes pixel
// sizes back onto it and pins the scene to a stale viewport.
const viewSize = () => {
  const r = canvas.getBoundingClientRect();
  return {
    w: Math.round(r.width) || window.innerWidth || 1280,
    h: Math.round(r.height) || window.innerHeight || 720,
  };
};
renderer.setSize(viewSize().w, viewSize().h, false);
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, viewSize().w / viewSize().h, 0.08, 220);

const controls = new OrbitControls(camera, canvas);
controls.enabled = false;
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 3;
controls.maxDistance = 22;
controls.minPolarAngle = 0.15;
controls.maxPolarAngle = 1.45;
controls.autoRotateSpeed = 0.55;

function fitToViewport() {
  const { w, h } = viewSize();
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', fitToViewport);
window.addEventListener('orientationchange', fitToViewport);
// phones resize the visual viewport without a window resize (chrome sliding
// away, a keyboard coming up) — refit for those too
window.visualViewport?.addEventListener('resize', fitToViewport);

// ---------- the seed ----------

// ?seed=… grows one particular bed. Anything else rolls a number, and every
// sowing writes itself back into the address bar, so a corner worth keeping
// can be sent to somebody as a link.
const rollSeed = () => 1 + (randomSeed() % 999999);

function seedFromUrl() {
  const raw = new URLSearchParams(location.search).get('seed');
  return /^\d{1,10}$/.test(raw ?? '') ? Number(raw) >>> 0 : rollSeed();
}

function publishSeed(seed) {
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  history.replaceState(null, '', url);
}

// ---------- world pieces ----------

const world = createWorld({ scene, seed: seedFromUrl() });
const env = buildEnvironment(scene);
const weather = createWeather({ scene });
let currentNight = env.applyTime(0.42);

// where would a raindrop land? (the bed, or the mist that stands in for ground)
function groundYAt(x, z) {
  const c = world.center;
  if (Math.hypot(x - c.x, z - c.z) < BED_R) return world.roundabout.heightAt(x, z);
  return 0.32; // dimple the mist layer
}

const WEATHER_CYCLE = [null, 'fair', 'shower', 'storm'];
let weatherCycleIdx = 0;
function toggleWeather() {
  weatherCycleIdx = (weatherCycleIdx + 1) % WEATHER_CYCLE.length;
  const mode = WEATHER_CYCLE[weatherCycleIdx];
  weather.setOverride(mode);
  ui?.toast(mode ? `weather held: ${mode} — click again to change` : 'the sky is on its own again');
}

// ---------- state machine ----------

// walk = first person on the street; tend = at the bed, with the potting
// bench open and the camera orbiting it; transition = a glide between them.
let mode = 'walk';
let glide = null;

let ui = null;

const player = createPlayer({
  camera,
  canvas,
  hooks: {
    onInteract: () => {
      if (mode === 'walk' && atTheBed()) enterBed();
    },
    onLockChange: (locked) => {
      if (mode === 'walk') ui?.setWalkOverlay(!locked);
    },
  },
});

const bench = createBench();

// phones and tablets: drag to look, thumb stick to walk, tap to stop by.
// No-ops entirely on anything with a real pointer.
const touch = initTouch({
  player,
  canvas,
  getMode: () => mode,
  onInteract: () => {
    if (mode === 'walk' && atTheBed()) enterBed();
  },
  isNearInteractable: () => mode === 'walk' && atTheBed(),
});

// ---------- ui ----------

let designTimer = null;
ui = createUI({
  onDesignChange: () => {
    clearTimeout(designTimer);
    designTimer = setTimeout(() => bench.setDesign(ui.currentDesign()), 70);
  },
  onTimeChange: (t) => {
    currentNight = env.applyTime(t);
  },
  onWeatherToggle: () => toggleWeather(),
  onOrbitToggle: (v) => (controls.autoRotate = v),
  onResow: () => resow(),
  // "back to the bed ↩" at the foot of the phone's potting bench
  onDoneDesigning: () => ui.showPane('bed'),
  onBackToStreet: () => exitBed(),
});

// ---------- sowing ----------

function resow(seed = rollSeed()) {
  const sown = world.sow(seed);
  publishSeed(sown);
  ui.setBed(world.plantings.count(), sown);
  ui.toast(`sown from № ${sown} ✿`);
}

// ---------- camera glides ----------

function glideTo(pos, quat, dur = 1.1) {
  return new Promise((resolve) => {
    glide = {
      p0: camera.position.clone(),
      q0: camera.quaternion.clone(),
      p1: pos,
      q1: quat,
      t: 0,
      dur,
      resolve,
    };
  });
}

const _m = new THREE.Matrix4();
function lookQuat(from, at) {
  _m.lookAt(from, at, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromRotationMatrix(_m);
}

// ---------- mode switching ----------

const atTheBed = () => Math.hypot(player.position.x - world.center.x, player.position.z - world.center.z) < BED_R + 5;

function enterBed() {
  mode = 'transition';
  ui.setAppMode('transition');
  ui.setInteractChip(null);
  ui.setWalkOverlay(false);
  player.setEnabled(false);

  const c = world.center;
  const camPos = new THREE.Vector3(c.x + 7.2, 6.4, c.z + 9.2);
  const camTarget = new THREE.Vector3(c.x, 0.5, c.z);
  glideTo(camPos, lookQuat(camPos, camTarget), 1.1).then(() => {
    controls.target.copy(camTarget);
    controls.enabled = true;
    mode = 'tend';
    ui.setAppMode('tend');
    ui.setBed(world.plantings.count(), world.seed());
    bench.setDesign(ui.currentDesign());
  });
}

function exitBed() {
  if (mode !== 'tend') return;
  controls.enabled = false;
  controls.autoRotate = false;
  mode = 'transition';
  ui.setAppMode('transition');

  const eye = new THREE.Vector3(player.position.x, 1.6, player.position.z);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  glideTo(eye, q, 0.9).then(() => {
    mode = 'walk';
    ui.setAppMode('walk');
    player.setEnabled(true);
    player.applyCamera();
    // on touch there is no pointer lock to regain, so no prompt to show
    ui.setWalkOverlay(!touch.enabled && !player.isLocked());
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mode === 'tend') exitBed();
});

canvas.addEventListener('click', () => {
  if (mode !== 'walk' || touch.enabled) return;
  // dismiss the prompt on intent — pointer lock is a bonus that may be blocked
  // (iframes, unfocused docs), and we don't want the overlay stuck if it is
  ui.setWalkOverlay(false);
  if (!player.isLocked()) player.lock();
});

// ---------- boot ----------

// stand just outside the corner, facing it
player.position.set(world.center.x, 0, world.center.z + 14.5);
player.yaw = 0;
player.applyCamera();

publishSeed(world.seed());
ui.setBed(world.plantings.count(), world.seed());
ui.setAppMode('walk');
// the "click to take a walk" prompt is about pointer lock — meaningless on touch
ui.setWalkOverlay(!touch.enabled);

// ---------- loop ----------

const clock = new THREE.Clock();
let lastT = 0;
let simTime = 0;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const focusVec = new THREE.Vector3();

function step(dt) {
  simTime += dt;
  const t = simTime;

  if (mode === 'tend') focusVec.set(world.center.x, 0, world.center.z);
  else focusVec.set(player.position.x, 0, player.position.z);

  // weather drives the wind; the breeze slider scales how much the garden feels it
  const wx = weather.update(dt, focusVec, currentNight, groundYAt);
  env.setWeather(wx);
  ui?.setWeatherLabel(wx.label, !!weather.getOverride());

  windUniforms.uTime.value = t;
  const gust = 0.62 + 0.38 * Math.sin(t * 0.6) + 0.22 * Math.sin(t * 1.7 + 2.3);
  const breeze = 0.4 + (ui?.getSettings().wind ?? 0.5) * 1.2;
  windUniforms.uWind.value = (0.03 + wx.wind * 0.24) * breeze * Math.max(0.2, gust);
  windUniforms.uRain.value = wx.rain;
  const wa = t * (0.045 + wx.storm * 0.08);
  windUniforms.uWindDir.value.set(Math.cos(wa), Math.sin(wa) * 0.5 + 0.5).normalize();

  waterUniforms.uTime.value = t;
  waterUniforms.uCurrent.value = 0.25 + wx.wind * 0.75;
  waterUniforms.uRain.value = wx.rain;

  if (glide) {
    glide.t += dt / glide.dur;
    const k = ease(Math.min(1, glide.t));
    camera.position.lerpVectors(glide.p0, glide.p1, k);
    camera.quaternion.slerpQuaternions(glide.q0, glide.q1, k);
    if (glide.t >= 1) {
      const done = glide.resolve;
      glide = null;
      done();
    }
  } else if (mode === 'walk') {
    player.update(dt, world.getColliders());
    ui?.setInteractChip(atTheBed() ? 'stop by the garden' : null, 'E');
  } else if (mode === 'tend') {
    controls.update();
  }

  world.update(player.position, currentNight);
  env.update(t, currentNight, focusVec);

  renderer.render(scene, camera);
  if (mode === 'tend') bench.update(dt);
}

function tick() {
  const now = clock.getElapsedTime();
  const dt = Math.min(0.05, now - lastT);
  lastT = now;
  step(dt);
  requestAnimationFrame(tick);
}

tick();

// debug/test surface
window.__g = {
  THREE,
  player,
  world,
  weather,
  ui,
  camera,
  scene,
  renderer,
  encode,
  decode,
  parseSeedInput,
  randomParams,
  resow,
  enterBed,
  exitBed,
  applyTime: (t) => (currentNight = env.applyTime(t)),
  getMode: () => mode,
  step: (dt = 0.016) => step(dt), // drive frames manually (tests / throttled tabs)
};
