// Global atmosphere: the paper ground plane, hemisphere + travelling sun,
// time-of-day, fog, and fireflies. Everything follows the focus point (the
// player, or the roundabout being tended) since the world is big now.
// Per-intersection geometry lives in roundabout.js / blocks.js.

import * as THREE from 'three';
import { Rng } from './rng.js';
import { glowTexture } from './materials.js';
import { lerp, clamp01, TAU } from './generators/common.js';
import { createSky } from './effects/sky/index.js';

const TIME_KEYS = [
  { t: 0.0,  bg: '#f6ddd6', sun: '#ffc9a0', sunInt: 1.6, az: -1.25, el: 0.32, sky: '#ffe2d0', gnd: '#b9a89e', hemiInt: 0.95, night: 0 },
  { t: 0.35, bg: '#f4e4d6', sun: '#fff3e0', sunInt: 2.15, az: -0.35, el: 1.12, sky: '#fff0dc', gnd: '#b3bb9e', hemiInt: 0.95, night: 0 },
  { t: 0.68, bg: '#f7d8bc', sun: '#ffaa66', sunInt: 1.9, az: 0.95, el: 0.3, sky: '#ffd9a5', gnd: '#97907d', hemiInt: 0.9, night: 0 },
  { t: 1.0,  bg: '#3a2d47', sun: '#a9bfe4', sunInt: 0.85, az: 1.6, el: 0.8, sky: '#4e4566', gnd: '#2d2733', hemiInt: 0.55, night: 1 },
];

function lerpHex(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

export function buildEnvironment(scene) {
  // no ground at all — the town floats; a low mist shrouds everything's feet
  const mistLayers = [];
  {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const rng = new Rng(414);
    for (let i = 0; i < 46; i++) {
      const r = 18 + rng.next() * 46;
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
      grad.addColorStop(0, `rgba(255,255,255,${0.16 + rng.next() * 0.2})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save();
      ctx.translate(rng.next() * 256, rng.next() * 256);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const SIZE = 150;
    for (const [y, opacity, repeat, drift] of [
      [0.35, 0.5, 2.2, 0.0016],
      [1.0, 0.34, 1.6, -0.0011],
      [1.9, 0.2, 1.1, 0.0007],
    ]) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity,
        depthWrite: false,
        fog: false,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), mat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = y;
      plane.renderOrder = 1;
      scene.add(plane);
      mistLayers.push({ plane, mat, repeat, drift, size: SIZE });
    }
  }

  // …and billboarded fog banks so the mist has body at eye level
  const wisps = [];
  {
    const rng = new Rng(818);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        opacity: rng.float(0.05, 0.12),
        depthWrite: false,
      });
      const wisp = new THREE.Sprite(mat);
      wisp.scale.set(rng.float(14, 30), rng.float(3.5, 7), 1);
      wisp.userData = {
        ox: rng.spread(46),
        oz: rng.spread(46),
        y: rng.float(0.6, 2.6),
        s: rng.float(0.3, 1),
      };
      scene.add(wisp);
      wisps.push(wisp);
    }
  }

  // the sky — an extracted atmosphere system: FBM veil→billow clouds,
  // twinkling stars, sun/moon glow. We drive its uniforms from the garden's
  // own time-of-day palette + the weather; its rain/lightning stay unused
  // (the garden has its own painterly versions).
  const sky = createSky({ scene, radius: 170 });
  scene.remove(sky.rain.mesh);
  scene.remove(sky.lightning.line);
  sky.uniforms.uGradientBand.value = 0.42;
  sky.uniforms.uCloudScale.value = 1.25;
  sky.uniforms.uStarDensity.value = 0.24;
  sky.uniforms.uStarColor.value.set('#ffe9c9');
  sky.uniforms.uAccentA.value.set('#f6ead2');
  sky.uniforms.uAccentB.value.set('#e8c4bb');
  sky.uniforms.uBodySize.value = 1.3;
  sky.bodyDisc.scale.setScalar(17);

  // lights
  const hemi = new THREE.HemisphereLight('#fff0dc', '#b3bb9e', 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff3e0', 2.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun);
  scene.add(sun.target);

  const amb = new THREE.AmbientLight('#8f86a3', 0.0);
  scene.add(amb);

  scene.fog = new THREE.Fog('#f4e4d6', 30, 78);
  const bgColor = new THREE.Color('#f4e4d6');
  scene.background = bgColor;

  let sunDir = new THREE.Vector3(0, 1, 0.3);

  // time-of-day gives the BASE light; weather modulates it every frame
  const base = {
    bg: new THREE.Color(),
    sun: new THREE.Color(),
    sunInt: 2.15,
    sky: new THREE.Color(),
    gnd: new THREE.Color(),
    hemiInt: 0.95,
    night: 0,
  };
  let weather = { cloud: 0, rain: 0, storm: 0, flash: 0, wind: 0.2 };
  const stormGrey = new THREE.Color('#a8a3b3');
  const flashWhite = new THREE.Color('#ffffff');
  const stormSun = new THREE.Color('#c3c4d4');

  function applyTime(t) {
    t = clamp01(t);
    let a = TIME_KEYS[0], b = TIME_KEYS[TIME_KEYS.length - 1];
    for (let i = 0; i < TIME_KEYS.length - 1; i++) {
      if (t >= TIME_KEYS[i].t && t <= TIME_KEYS[i + 1].t) {
        a = TIME_KEYS[i];
        b = TIME_KEYS[i + 1];
        break;
      }
    }
    const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    base.bg.copy(lerpHex(a.bg, b.bg, f));
    base.sun.copy(lerpHex(a.sun, b.sun, f));
    base.sunInt = lerp(a.sunInt, b.sunInt, f);
    const az = lerp(a.az, b.az, f), el = lerp(a.el, b.el, f);
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    base.sky.copy(lerpHex(a.sky, b.sky, f));
    base.gnd.copy(lerpHex(a.gnd, b.gnd, f));
    base.hemiInt = lerp(a.hemiInt, b.hemiInt, f);
    base.night = lerp(a.night, b.night, f);
    applyWeatherMod();
    // the page behind the canvas wears the sky's own colour, so nothing ever
    // peeks out as a stripe of the wrong cream at the edge of a phone screen
    const hex = bgColor.getHex();
    document.documentElement.style.setProperty(
      '--sky',
      `${(hex >> 16) & 255} ${(hex >> 8) & 255} ${hex & 255}`
    );
    return base.night;
  }

  function setWeather(w) {
    weather = w;
  }

  const tmpTop = new THREE.Color();
  const tmpMid = new THREE.Color();

  function applyWeatherMod() {
    const w = weather;
    const grey = w.storm * 0.5 + w.cloud * 0.16;
    bgColor.copy(base.bg).lerp(stormGrey, grey).lerp(flashWhite, w.flash * 0.35);
    scene.fog.color.copy(bgColor);
    scene.fog.near = 22 * (1 - w.rain * 0.28);
    scene.fog.far = 58 * (1 - w.rain * 0.28 - w.storm * 0.1);
    sun.color.copy(base.sun).lerp(stormSun, w.storm * 0.55);
    sun.intensity = base.sunInt * (1 - w.cloud * 0.34 - w.storm * 0.3) + w.flash * 2.6;
    hemi.color.copy(base.sky).lerp(stormGrey, grey * 0.7);
    hemi.groundColor.copy(base.gnd).lerp(stormGrey, grey * 0.5);
    hemi.intensity = base.hemiInt * (1 - w.storm * 0.18) + w.flash * 1.3;
    amb.intensity = base.night * 0.35 + w.flash * 0.5;

    // the dome melts into the distance fog at the horizon and opens upward
    const u = sky.uniforms;
    u.uHorizon.value.copy(bgColor);
    u.uBottom.value.copy(bgColor);
    tmpTop.copy(bgColor).lerp(base.sky, 0.4).lerp(stormGrey, grey * 0.5);
    u.uTop.value.copy(tmpTop);
    tmpMid.copy(bgColor).lerp(base.sun, 0.22);
    u.uMid.value.copy(tmpMid);
    u.uBodyDir.value.copy(sunDir);
    u.uBodyColor.value.copy(base.sun);
    u.uBodyPower.value = 0.85 * (1 - w.cloud * 0.4 - w.storm * 0.4);
    u.uCloudCover.value = clamp01(w.cloud + w.storm * 0.1);
    u.uCloudDensity.value = 0.58 + w.storm * 0.32;
    u.uCloudBillow.value = 0.34 + w.cloud * 0.35 + w.storm * 0.2;
    u.uCloudSoftness.value = 0.72 - w.storm * 0.3;
    u.uCloudBrightness.value = (1.2 - w.storm * 0.55) * (1 - base.night * 0.55);
    u.uCloudSpeed.value = 0.08 + w.wind * 0.4;
    u.uWind.value = w.wind * 0.5;
    u.uStorm.value = w.storm;
    u.uLightning.value = w.flash;
    u.uNight.value = base.night;
  }

  // fireflies drift around the focus point
  const N = 56;
  const rng = new Rng(777);
  const anchors = [];
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = Math.sqrt(rng.next()) * 16;
    const a = rng.float(0, TAU);
    anchors.push({ x: Math.cos(a) * r, y: rng.float(0.4, 2.8), z: Math.sin(a) * r, s: rng.float(0.5, 1.5) });
  }
  const fireGeo = new THREE.BufferGeometry();
  fireGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const fireMat = new THREE.PointsMaterial({
    map: glowTexture,
    color: '#ffdf8a',
    size: 0.14,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const fireflies = new THREE.Points(fireGeo, fireMat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  // called every frame with the current focus (player or tended roundabout)
  function update(time, night, focus) {
    applyWeatherMod();
    sun.position.copy(focus).addScaledVector(sunDir, 30);
    sun.target.position.set(focus.x, 0, focus.z);
    sun.target.updateMatrixWorld();

    // dome + sun/moon disc ride along with the focus
    sky.uniforms.uTime.value = time;
    sky.mesh.position.set(focus.x, 0, focus.z);
    sky.setBody(night > 0.5 ? 'moon' : 'sun');
    sky.bodyDisc.position.copy(focus).addScaledVector(sunDir, 150);
    sky.bodyDisc.position.y = Math.max(sky.bodyDisc.position.y, 10);
    sky.bodyDisc.material.opacity = 0.72 * (1 - weather.storm * 0.75) * (1 - weather.cloud * 0.35);

    // mist planes follow the focus; scrolling uvs keep the fog world-anchored
    for (const layer of mistLayers) {
      layer.plane.position.set(focus.x, layer.plane.position.y, focus.z);
      layer.mat.map.repeat.setScalar(layer.repeat);
      layer.mat.map.offset.set(
        (focus.x / layer.size) * layer.repeat + time * layer.drift,
        (-focus.z / layer.size) * layer.repeat + time * layer.drift * 0.6
      );
      layer.mat.color.copy(bgColor).lerp(flashWhite, 0.1 + weather.flash * 0.3);
    }
    for (const w of wisps) {
      const u = w.userData;
      w.position.set(
        focus.x + u.ox + Math.sin(time * 0.05 * u.s + u.ox) * 6,
        u.y + Math.sin(time * 0.11 * u.s + u.oz) * 0.3,
        focus.z + u.oz + Math.cos(time * 0.04 * u.s + u.oz) * 6
      );
      w.material.color.copy(bgColor).lerp(flashWhite, 0.12);
    }

    fireMat.opacity = night * 0.9;
    fireflies.visible = night > 0.02;
    if (fireflies.visible) {
      const arr = fireGeo.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const a = anchors[i];
        arr[i * 3] = focus.x + a.x + Math.sin(time * 0.31 * a.s + i * 1.7) * 0.8;
        arr[i * 3 + 1] = a.y + Math.sin(time * 0.23 * a.s + i * 2.9) * 0.35;
        arr[i * 3 + 2] = focus.z + a.z + Math.cos(time * 0.27 * a.s + i * 0.8) * 0.8;
      }
      fireGeo.attributes.position.needsUpdate = true;
    }
  }

  return { applyTime, setWeather, update };
}
