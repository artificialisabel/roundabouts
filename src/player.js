// First-person walking: pointer-lock mouse look + WASD, gentle head bob,
// circle-collider push-out. The camera belongs to the player only in walk
// mode; garden mode hands it to OrbitControls.

import * as THREE from 'three';

const EYE = 1.6;
const SPEED = 5.2; // the blocks are long now — walk with intent
const SPRINT = 1.7;
const TURN_RATE = 2.2; // A/D swing the view, tank-style

export function createPlayer({ camera, canvas, hooks = {} }) {
  const pos = new THREE.Vector3(0, 0, 14.5); // south of the home roundabout
  let yaw = 0; // facing -z: straight at home
  let pitch = -0.08;
  let yawTarget = yaw; // the view eases toward these — no abrupt swivels
  let pitchTarget = pitch;
  let enabled = true;
  let bobPhase = 0;
  const vel = new THREE.Vector3();
  const keys = new Set();

  // analogue input fed from outside (touch thumb stick) — added to the keys
  let extFwd = 0;
  let extTurn = 0;
  let lockAllowed = true; // touch devices switch this off: never prompt for lock

  const isLocked = () => document.pointerLockElement === canvas;

  function lock() {
    if (!lockAllowed) return;
    if (!isLocked()) canvas.requestPointerLock?.();
  }

  document.addEventListener('pointerlockchange', () => hooks.onLockChange?.(isLocked()));

  document.addEventListener('mousemove', (e) => {
    if (!enabled || !isLocked()) return;
    yawTarget -= e.movementX * 0.0023;
    pitchTarget = Math.max(-1.25, Math.min(1.25, pitchTarget - e.movementY * 0.0021));
  });

  const KEYMAP = {
    KeyW: 'f', ArrowUp: 'f',
    KeyS: 'b', ArrowDown: 'b',
    KeyA: 'l', ArrowLeft: 'l',
    KeyD: 'r', ArrowRight: 'r',
    ShiftLeft: 's', ShiftRight: 's',
  };

  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.code === 'KeyE' && enabled) hooks.onInteract?.();
    const k = KEYMAP[e.code];
    if (k) {
      keys.add(k);
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  });

  let roll = 0;

  function update(dt, colliders = []) {
    if (!enabled) return;
    const clamp1 = (v) => Math.max(-1, Math.min(1, v));
    const fwd = clamp1((keys.has('f') ? 1 : 0) - (keys.has('b') ? 1 : 0) + extFwd);
    const turn = clamp1((keys.has('l') ? 1 : 0) - (keys.has('r') ? 1 : 0) + extTurn);
    yawTarget += turn * TURN_RATE * dt;
    // ease the view toward its target — smooth swivel, no snap
    const ease = 1 - Math.exp(-dt * 8);
    const prevYaw = yaw;
    yaw += (yawTarget - yaw) * ease;
    pitch += (pitchTarget - pitch) * ease;
    const yawRate = Math.max(-3, Math.min(3, (yaw - prevYaw) / Math.max(dt, 1e-4)));
    const speed = SPEED * (keys.has('s') ? SPRINT : 1);
    const target = new THREE.Vector3(-Math.sin(yaw) * fwd * speed, 0, -Math.cos(yaw) * fwd * speed);
    vel.lerp(target, Math.min(1, dt * 10));
    pos.addScaledVector(vel, dt);

    // push out of circle colliders
    for (const c of colliders) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 0.4;
      if (d < min && d > 1e-5) {
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }

    const moving = Math.hypot(vel.x, vel.z) > 0.4;
    bobPhase += (moving ? Math.hypot(vel.x, vel.z) : 0) * dt * 2.1;
    const bob = moving ? Math.sin(bobPhase * Math.PI) * 0.015 : 0;
    roll += (yawRate * -0.014 - roll) * Math.min(1, dt * 5); // lean gently into the turn

    camera.position.set(pos.x, EYE + bob, pos.z);
    camera.rotation.set(pitch, yaw, roll, 'YXZ');
  }

  return {
    position: pos,
    update,
    lock,
    isLocked,
    setEnabled(v) {
      enabled = v;
      if (!v) {
        keys.clear();
        extFwd = extTurn = 0;
        vel.set(0, 0, 0);
        if (isLocked()) document.exitPointerLock?.();
      }
    },
    // --- additive input surface, used by src/touch.js ---
    // Nudge the *targets* so touch inherits the same easing as the mouse.
    nudgeLook(dYaw = 0, dPitch = 0) {
      if (!enabled) return;
      yawTarget += dYaw;
      pitchTarget = Math.max(-1.25, Math.min(1.25, pitchTarget + dPitch));
    },
    // Analogue walk/turn in [-1,1], read exactly where the keys are read.
    setMoveAxis(forward = 0, turnAxis = 0) {
      if (!enabled) return;
      extFwd = Math.max(-1, Math.min(1, forward));
      extTurn = Math.max(-1, Math.min(1, turnAxis));
    },
    setPointerLockAllowed(v) {
      lockAllowed = !!v;
    },
    get yaw() { return yaw; },
    set yaw(v) { yaw = yawTarget = v; },
    get pitch() { return pitch; },
    set pitch(v) { pitch = pitchTarget = v; },
    applyCamera() {
      camera.position.set(pos.x, EYE, pos.z);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    },
  };
}
