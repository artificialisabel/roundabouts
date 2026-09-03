// Spring weather — an autonomous little climate that is mostly kind.
// A Markov director wanders between fair / breezy / cloudy / shower / storm /
// clearing; everything visual hangs off four smoothed scalars (cloud, rain,
// storm, wind). Rain is painterly: instanced brush-stroke streaks bowed by the
// wind, splash rings where drops land, a jagged additive lightning bolt, and
// a rainbow when a shower breaks while the sun is out.

import * as THREE from 'three';
import { glowTexture, srgbLinear } from './materials.js';
import { paintByPosition, finalize, lerp, TAU } from './generators/common.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from './rng.js';

const STATES = {
  fair: { cloud: 0.14, rain: 0, storm: 0, wind: 0.22, dwell: [70, 170], label: 'fair' },
  breezy: { cloud: 0.3, rain: 0, storm: 0, wind: 0.62, dwell: [50, 110], label: 'breezy' },
  cloudy: { cloud: 0.68, rain: 0, storm: 0.08, wind: 0.4, dwell: [45, 110], label: 'clouds' },
  shower: { cloud: 0.8, rain: 0.6, storm: 0.2, wind: 0.55, dwell: [35, 75], label: 'showers' },
  storm: { cloud: 1, rain: 1, storm: 1, wind: 1, dwell: [22, 45], label: 'storm' },
  clearing: { cloud: 0.32, rain: 0, storm: 0, wind: 0.34, dwell: [35, 60], label: 'clearing' },
};

const FLOW = {
  fair: [['fair', 0.4], ['breezy', 0.32], ['cloudy', 0.28]],
  breezy: [['fair', 0.4], ['cloudy', 0.35], ['breezy', 0.25]],
  cloudy: [['shower', 0.38], ['fair', 0.24], ['breezy', 0.14], ['cloudy', 0.24]],
  shower: [['clearing', 0.5], ['storm', 0.28], ['cloudy', 0.22]],
  storm: [['shower', 0.55], ['clearing', 0.45]],
  clearing: [['fair', 0.7], ['breezy', 0.3]],
};

const RAIN_COUNT = 1000;
const RING_COUNT = 90;

export function createWeather({ scene }) {
  // ---------- state ----------
  let condition = 'fair';
  let dwell = 90;
  let override = null; // 'fair' | 'shower' | 'storm' | null
  const cur = { cloud: 0.14, rain: 0, storm: 0, wind: 0.22 };
  let lightningPulse = 0;
  let lightningCooldown = 3;
  let rainbowT = -1; // seconds since rainbow began; <0 = none
  let wasWet = false;

  function pickNext() {
    let t = Math.random();
    for (const [next, w] of FLOW[condition]) {
      t -= w;
      if (t <= 0) return next;
    }
    return 'fair';
  }

  // (clouds live on the sky dome now — see effects/sky wired in environment.js)

  // ---------- rain streaks (instanced, fully GPU-animated) ----------
  const rainUniforms = {
    uTime: { value: 0 },
    uRain: { value: 0 },
    uWind: { value: 0 },
    uWindDir: { value: new THREE.Vector2(1, 0) },
    uFocus: { value: new THREE.Vector3() },
    uColor: { value: new THREE.Color('#9fb0c9') },
  };
  let rain;
  {
    const quad = new THREE.PlaneGeometry(1, 1, 1, 3);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;
    const offsets = new Float32Array(RAIN_COUNT * 3);
    const speeds = new Float32Array(RAIN_COUNT);
    const lens = new Float32Array(RAIN_COUNT);
    const rands = new Float32Array(RAIN_COUNT);
    const rng = new Rng(505);
    for (let i = 0; i < RAIN_COUNT; i++) {
      const rr = 22 * Math.sqrt(rng.next());
      const a = rng.float(0, TAU);
      offsets[i * 3] = Math.cos(a) * rr;
      offsets[i * 3 + 1] = rng.next(); // fall phase
      offsets[i * 3 + 2] = Math.sin(a) * rr;
      speeds[i] = rng.float(0.7, 1.35);
      lens[i] = rng.float(0.45, 1.15);
      rands[i] = rng.next();
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
    geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1));
    geo.setAttribute('aLen', new THREE.InstancedBufferAttribute(lens, 1));
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: rainUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime; uniform float uRain; uniform float uWind;
        uniform vec2 uWindDir; uniform vec3 uFocus;
        attribute vec3 aOffset; attribute float aSpeed; attribute float aLen; attribute float aRand;
        varying vec2 vUv; varying float vAlpha;
        void main() {
          vUv = uv;
          float span = 16.0;
          float fall = uTime * (9.0 + 13.0 * uRain) * aSpeed;
          float yTop = mod(aOffset.y * span - fall, span);
          float len = aLen * (0.5 + 0.9 * uRain);
          float along = 1.0 - uv.y; // 0 at streak top, 1 at the falling head
          vec2 bow = uWindDir * uWind * 3.5 * (0.5 * along + 0.5 * along * along) * len;
          vec3 p = vec3(uFocus.x + aOffset.x + bow.x, yTop - along * len, uFocus.z + aOffset.z + bow.y);
          vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          p += camRight * position.x * 0.03;
          vAlpha = (0.14 + 0.5 * along) * uRain * step(aRand, uRain * 1.15);
          vAlpha *= smoothstep(0.0, 1.1, p.y); // die at the ground
          vAlpha *= smoothstep(1.5, 4.5, distance(p.xz, cameraPosition.xz)); // not on the lens
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        varying vec2 vUv; varying float vAlpha;
        void main() {
          float edge = 1.0 - abs(vUv.x - 0.5) * 1.6;
          gl_FragColor = vec4(uColor, vAlpha * clamp(edge, 0.0, 1.0));
        }`,
    });
    rain = new THREE.Mesh(geo, mat);
    rain.frustumCulled = false;
    rain.renderOrder = 6;
    scene.add(rain);
  }

  // ---------- splash rings ----------
  const ringUniforms = {
    uTime: { value: 0 },
    uRain: { value: 0 },
  };
  let rings;
  let ringPositions;
  {
    const base = new THREE.RingGeometry(0.72, 1, 14);
    base.rotateX(-Math.PI / 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    ringPositions = new Float32Array(RING_COUNT * 3);
    const phases = new Float32Array(RING_COUNT);
    const sizes = new Float32Array(RING_COUNT);
    const rng = new Rng(606);
    for (let i = 0; i < RING_COUNT; i++) {
      phases[i] = rng.next();
      sizes[i] = rng.float(0.6, 1.4);
    }
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(ringPositions, 3));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(sizes, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: ringUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: `
        uniform float uTime; uniform float uRain;
        attribute vec3 aPos; attribute float aPhase; attribute float aSize;
        varying float vAlpha;
        void main() {
          float cycle = fract(uTime * 1.3 + aPhase);
          float sc = (0.05 + cycle * 0.3) * aSize;
          vec3 p = aPos + vec3(position.x * sc, 0.015, position.z * sc);
          vAlpha = (1.0 - cycle) * (1.0 - cycle) * uRain * 0.5;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() { gl_FragColor = vec4(0.95, 0.97, 0.92, vAlpha); }`,
    });
    rings = new THREE.Mesh(geo, mat);
    rings.frustumCulled = false;
    rings.renderOrder = 5;
    scene.add(rings);
  }
  let rescatterAt = 0;

  // ---------- lightning ----------
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
  boltGeo.setDrawRange(0, 0);
  const bolt = new THREE.Line(
    boltGeo,
    new THREE.LineBasicMaterial({ color: '#eaf4ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  bolt.frustumCulled = false;
  scene.add(bolt);
  // a soft glow sprite at the strike point sells the flash
  const boltGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: glowTexture, color: '#dcecff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  boltGlow.scale.setScalar(14);
  scene.add(boltGlow);

  function strike(focus) {
    const a = Math.random() * TAU;
    const d = 34 + Math.random() * 22;
    const bx = focus.x + Math.cos(a) * d;
    const bz = focus.z + Math.sin(a) * d;
    const pos = boltGeo.attributes.position;
    let x = bx, z = bz;
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      x += (Math.random() - 0.5) * 3.2;
      z += (Math.random() - 0.5) * 2.2;
      pos.array[i * 3] = x;
      pos.array[i * 3 + 1] = lerp(26, 0.5, Math.pow(t, 0.85));
      pos.array[i * 3 + 2] = z;
    }
    pos.needsUpdate = true;
    boltGeo.setDrawRange(0, 10);
    boltGlow.position.set(bx, 8, bz);
    lightningPulse = 0.6 + Math.random() * 0.4;
  }

  // ---------- rainbow ----------
  let rainbow;
  {
    const bands = ['#e2897a', '#e8b46a', '#e6d76a', '#93b06a', '#7a9ac9', '#9a86c9'];
    const parts = [];
    bands.forEach((hex, i) => {
      const arc = new THREE.TorusGeometry(1 + i * 0.028, 0.016, 5, 64, Math.PI);
      const c = srgbLinear(hex);
      paintByPosition(arc, (col) => col.copy(c));
      parts.push(finalize(arc));
    });
    const geo = mergeGeometries(parts, false);
    rainbow = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false })
    );
    rainbow.scale.setScalar(34);
    rainbow.visible = false;
    rainbow.frustumCulled = false;
    scene.add(rainbow);
  }

  // ---------- the tick ----------

  let lastNight = 0;

  function setOverride(mode) {
    // clearing the sky by hand after a good soak still earns the rainbow
    if (mode === 'fair' && cur.rain > 0.25 && lastNight < 0.45) rainbowT = 0;
    override = mode;
    if (mode) {
      condition = mode;
      dwell = 1e9;
    } else {
      dwell = 4; // pick a fresh natural state soon
    }
  }

  function update(dt, focus, night, groundYAt) {
    lastNight = night;
    // director
    dwell -= dt;
    if (dwell <= 0 && !override) {
      const prev = condition;
      condition = pickNext();
      const [a, b] = STATES[condition].dwell;
      dwell = a + Math.random() * (b - a);
      const wetToDry = (prev === 'shower' || prev === 'storm') && (condition === 'clearing' || condition === 'fair');
      if (wetToDry && night < 0.45) rainbowT = 0;
    }

    const target = STATES[condition];
    const k = 1 - Math.exp(-dt / 6);
    const kr = 1 - Math.exp(-dt / 4);
    cur.cloud += (target.cloud - cur.cloud) * k;
    cur.storm += (target.storm - cur.storm) * k;
    cur.wind += (target.wind - cur.wind) * k;
    cur.rain += (target.rain - cur.rain) * kr;

    // rain + rings
    rainUniforms.uTime.value += dt;
    rainUniforms.uRain.value = cur.rain;
    rainUniforms.uWind.value = cur.wind;
    rainUniforms.uFocus.value.copy(focus);
    rainUniforms.uColor.value.set('#a4b4cc').lerp(new THREE.Color('#7d87a3'), cur.storm);
    rain.visible = cur.rain > 0.02;

    ringUniforms.uTime.value += dt;
    ringUniforms.uRain.value = cur.rain;
    rings.visible = cur.rain > 0.04;
    rescatterAt -= dt;
    if (rings.visible && rescatterAt <= 0) {
      rescatterAt = 1.7;
      for (let i = 0; i < RING_COUNT; i++) {
        const rr = 17 * Math.sqrt(Math.random());
        const a = Math.random() * TAU;
        const x = focus.x + Math.cos(a) * rr;
        const z = focus.z + Math.sin(a) * rr;
        ringPositions[i * 3] = x;
        ringPositions[i * 3 + 1] = (groundYAt?.(x, z) ?? 0.02) + 0.02;
        ringPositions[i * 3 + 2] = z;
      }
      rings.geometry.attributes.aPos.needsUpdate = true;
    }

    // lightning
    lightningPulse *= Math.pow(0.02, dt);
    lightningCooldown = Math.max(0, lightningCooldown - dt);
    if (cur.storm > 0.25 && lightningCooldown <= 0 && Math.random() < dt * cur.storm * 0.3) {
      strike(focus);
      lightningCooldown = (1.4 + Math.random() * 3.6) * lerp(1.6, 0.7, cur.storm);
    }
    if (lightningPulse < 0.01) boltGeo.setDrawRange(0, 0);
    bolt.material.opacity = lightningPulse * 0.95;
    boltGlow.material.opacity = lightningPulse * 0.5;

    // rainbow
    if (rainbowT >= 0) {
      rainbowT += dt;
      const DUR = 70;
      const env = Math.min(rainbowT / 5, 1, (DUR - rainbowT) / 16);
      if (rainbowT > DUR || night > 0.6) {
        rainbowT = -1;
        rainbow.visible = false;
      } else {
        rainbow.visible = true;
        rainbow.material.opacity = Math.max(0, env) * 0.34;
        // stands across the sky from the player, roughly opposite the light
        rainbow.position.set(focus.x - 40, 0, focus.z - 26);
        rainbow.lookAt(focus.x, 6, focus.z);
      }
    }

    wasWet = cur.rain > 0.2;
    void wasWet;

    return {
      cloud: cur.cloud,
      rain: cur.rain,
      storm: cur.storm,
      wind: cur.wind,
      flash: lightningPulse,
      label: (override ? 'held · ' : '') + STATES[condition].label,
    };
  }

  return { update, setOverride, getOverride: () => override, condition: () => condition };
}
