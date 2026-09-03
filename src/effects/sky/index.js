// A reusable atmosphere: a dome shader with four-stop gradient
// banding, 5-octave FBM clouds (soft veils through billowy lobes), a hashed
// twinkling star field, sun/moon glow; plus canvas-painted sun and phase-
// accurate moon sprites on a day arc, slanting palette-tinted rain, and a
// jagged additive lightning bolt.
//
// Scene-specific state and palette reads are exposed as settings and resolved
// colours so the system can be reused independently.

import * as THREE from 'three';

export const SKY_BODY_HOURS = { day: 13.5, sunset: 18.25, night: 23.5 };

export const SKY_BODY_ORBIT = {
  horizonY: 6,
  apexY: 72,
  sunriseX: -36,
  sunsetX: 24,
  sunriseZ: -52,
  sunsetZ: 72,
  noonZPull: 18,
};

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export const skyShader = {
  uniforms: {
    uTop: { value: new THREE.Color(0x87e9ee) },
    uMid: { value: new THREE.Color(0xffa50a) },
    uHorizon: { value: new THREE.Color(0xffa50a) },
    uBottom: { value: new THREE.Color(0x746693) },
    uGradientBand: { value: 0.5 },
    uBodyDir: { value: new THREE.Vector3(0, 1, 0) },
    uBodyColor: { value: new THREE.Color(0xffa50a) },
    uAccentA: { value: new THREE.Color(0xc8ff00) },
    uAccentB: { value: new THREE.Color(0xff7300) },
    uBodyPower: { value: 1 },
    uBodySize: { value: 1 },
    uCloudCover: { value: 0 },
    uCloudDensity: { value: 0.35 },
    uCloudScale: { value: 1.15 },
    uCloudSoftness: { value: 0.72 },
    uCloudBillow: { value: 0.32 },
    uCloudBrightness: { value: 0.68 },
    uCloudSpeed: { value: 0.22 },
    uCloudOrientation: { value: 0 },
    uWind: { value: 0.16 },
    uStorm: { value: 0 },
    uLightning: { value: 0 },
    uTime: { value: 0 },
    uNight: { value: 1 },
    uStarDensity: { value: 0.18 },
    uStarColor: { value: new THREE.Color(0xdaf6ff) },
  },
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = normalize(world.xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uTop;
    uniform vec3 uMid;
    uniform vec3 uHorizon;
    uniform vec3 uBottom;
    uniform float uGradientBand;
    uniform vec3 uBodyDir;
    uniform vec3 uBodyColor;
    uniform vec3 uAccentA;
    uniform vec3 uAccentB;
    uniform float uBodyPower;
    uniform float uBodySize;
    uniform float uCloudCover;
    uniform float uCloudDensity;
    uniform float uCloudScale;
    uniform float uCloudSoftness;
    uniform float uCloudBillow;
    uniform float uCloudBrightness;
    uniform float uCloudSpeed;
    uniform float uCloudOrientation;
    uniform float uWind;
    uniform float uStorm;
    uniform float uLightning;
    uniform float uNight;
    uniform float uStarDensity;
    uniform vec3 uStarColor;
    varying vec3 vWorld;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amp = 0.5;
      for (int i = 0; i < 5; i++) {
        value += noise(p) * amp;
        p *= 2.04;
        amp *= 0.5;
      }
      return value;
    }

    float cloudTexture(vec2 uv) {
      mat2 rotate = mat2(0.78, -0.62, 0.62, 0.78);
      float motion = uTime * (0.012 + uCloudSpeed * 0.18 + uWind * 0.04);
      vec2 drift = vec2(motion * (0.65 + uWind * 1.2), -motion * 0.36);
      vec2 flow = vec2(
        fbm(uv * 1.7 + drift),
        fbm(rotate * uv * 1.9 - drift.yx * 0.82)
      );
      vec2 warped = uv + (flow - 0.5) * mix(0.74, 0.34, uCloudBillow);
      float broad = fbm(warped * uCloudScale * mix(1.55, 0.9, uCloudBillow) + drift * 0.42);
      float detail = fbm(rotate * warped * uCloudScale * mix(5.6, 2.75, uCloudBillow) + broad * mix(1.7, 0.72, uCloudBillow));
      float wisps = sin((warped.x * 23.0 + detail * 8.0 + motion * 2.6) * max(0.35, uCloudScale)) * (1.0 - uCloudBillow);
      float softCloud = broad * 0.68 + detail * 0.28 + wisps * 0.035;
      float lobed = smoothstep(0.24, 0.92, broad) * 0.78 + detail * 0.18;
      float cloud = mix(softCloud, lobed, uCloudBillow);
      return clamp((cloud - 0.5) * mix(1.0, 2.35, uCloudBillow) + 0.5, 0.0, 1.0);
    }

    float starField(vec3 dir, float h) {
      float azimuth = atan(dir.z, dir.x) / 6.2831853 + 0.5;
      vec2 uv = vec2(azimuth, h * 0.92 + dir.z * 0.035);
      vec2 grid = uv * vec2(104.0, 50.0);
      vec2 cell = floor(grid);
      vec2 local = fract(grid) - 0.5;
      float seed = hash(cell);
      vec2 offset = vec2(hash(cell + vec2(17.2, 3.9)), hash(cell + vec2(5.7, 29.1))) - 0.5;
      float density = smoothstep(0.01, 0.42, uStarDensity);
      float present = step(1.0 - density * 0.46, seed);
      float point = smoothstep(0.01, 0.0, length(local - offset * 0.8));
      float horizonMask = smoothstep(0.02, 0.16, h);
      float twinkle = 0.72 + 0.28 * sin(uTime * (1.1 + seed * 3.8) + seed * 31.4);
      return present * point * horizonMask * twinkle;
    }

    void main() {
      float h = clamp(vWorld.y * 0.5 + 0.5, 0.0, 1.0);
      float band = clamp(uGradientBand, 0.0, 1.0);
      float horizonStart = mix(0.02, 0.16, band);
      float horizonPeak = mix(0.16, 0.42, band);
      float horizonEnd = mix(0.32, 0.74, band);
      float topStart = mix(0.24, 0.5, band);
      float topEnd = mix(0.56, 0.86, band);
      float midStart = mix(0.1, 0.3, band);
      float midPeak = mix(0.32, 0.6, band);
      float midEnd = mix(0.54, 0.95, band);
      float horizonRise = smoothstep(horizonStart, horizonPeak, h);
      float horizonFall = 1.0 - smoothstep(horizonPeak, horizonEnd, h);
      float horizonBand = max(horizonRise * horizonFall, smoothstep(horizonStart, horizonEnd, h) * (1.0 - band * 0.35));
      vec3 low = mix(uBottom, uHorizon, horizonRise);
      vec3 color = mix(low, uTop, smoothstep(topStart, topEnd, h));
      color = mix(color, uHorizon, horizonBand * mix(0.18, 0.52, band));
      color = mix(color, uMid, smoothstep(midStart, midPeak, h) * (1.0 - smoothstep(midPeak, midEnd, h)) * 0.18);

      vec3 dir = normalize(vWorld);
      float bodyDot = max(dot(dir, normalize(uBodyDir)), 0.0);
      float glowPower = mix(26.0, 5.0, clamp(uBodySize / 2.5, 0.0, 1.0));
      float bodyGlow = pow(bodyDot, glowPower) * uBodyPower;

      float cloudAngle = radians(uCloudOrientation);
      vec2 xz = normalize(dir.xz + vec2(0.0001));
      float domeFacing = dir.y;
      float domeMask = smoothstep(-0.08, 0.08, domeFacing);
      vec2 skyUv = vec2(xz.x * 0.92 + xz.y * 0.26, h * 1.42 + xz.y * 0.18);
      mat2 cloudOrientation = mat2(cos(cloudAngle), -sin(cloudAngle), sin(cloudAngle), cos(cloudAngle));
      skyUv = cloudOrientation * skyUv;
      float cloudNoise = cloudTexture(skyUv);
      float threshold = mix(0.84, 0.34, uCloudDensity);
      float feather = mix(0.006, 0.36, uCloudSoftness) * mix(0.7, 1.0, 1.0 - uCloudBillow);
      float veil = smoothstep(threshold - feather, threshold + feather, cloudNoise + uCloudCover * 0.22);
      veil *= uCloudCover * smoothstep(0.03, 0.24, h) * domeMask;

      vec3 cloudAccent = mix(uAccentA, uAccentB, smoothstep(0.28, 0.92, cloudNoise));
      vec3 cloudShade = mix(uMid * 0.48 + uHorizon * 0.3 + cloudAccent * 0.22, uHorizon * 0.86 + uMid * 0.18 + cloudAccent * 0.34, smoothstep(0.25, 0.86, cloudNoise));
      cloudShade = mix(cloudShade, uBodyColor * 0.82 + uAccentA * 0.34, bodyGlow * 0.22);
      cloudShade = mix(cloudShade, uBottom * 0.62 + uAccentB * 0.24, uStorm * (0.2 + cloudNoise * 0.18));
      color = mix(color, cloudShade * (0.42 + uCloudBrightness * 1.18), veil * 0.6);
      float starNight = max(uNight, smoothstep(0.72, 1.0, uStarDensity) * 0.5);
      float stars = starField(dir, h) * starNight * (1.0 - uCloudCover * 0.68);
      color += mix(uStarColor, uAccentB, 0.12) * stars * (1.18 + uStarDensity * 0.62);
      color += uBodyColor * bodyGlow * 0.28;
      color += mix(uAccentA, uBodyColor, 0.22) * uLightning * 0.42;
      color = mix(color, vec3(0.035, 0.04, 0.07), uStorm * 0.1);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

// ---------- canvas-painted celestial bodies ----------

export function makeSunTexture() {
  const size = 192;
  const canvasElement = document.createElement('canvas');
  canvasElement.width = size;
  canvasElement.height = size;
  const ctx = canvasElement.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#fff8d8');
  gradient.addColorStop(0.18, '#fff2b8');
  gradient.addColorStop(0.58, 'rgba(255, 157, 34, 0.82)');
  gradient.addColorStop(0.94, 'rgba(255, 92, 74, 0.24)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeMoonTexture(phase) {
  const size = 192;
  const canvasElement = document.createElement('canvas');
  canvasElement.width = size;
  canvasElement.height = size;
  const ctx = canvasElement.getContext('2d');
  const center = size / 2;
  const radius = size * 0.36;
  const glow = ctx.createRadialGradient(center, center, radius * 0.15, center, center, size * 0.5);
  glow.addColorStop(0, 'rgba(231,245,255,0.42)');
  glow.addColorStop(0.72, 'rgba(102,156,255,0.11)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  const moonGradient = ctx.createRadialGradient(center - radius * 0.18, center - radius * 0.2, radius * 0.08, center, center, radius * 1.2);
  moonGradient.addColorStop(0, '#f1fbff');
  moonGradient.addColorStop(0.62, '#9fbfff');
  moonGradient.addColorStop(1, '#314878');
  ctx.fillStyle = moonGradient;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.clip();
  const illum = 1 - Math.abs(phase - 0.5) * 2;
  const waxing = phase < 0.5 ? -1 : 1;
  const shadowX = center + waxing * radius * (1 - illum) * 0.82;
  const shadowGradient = ctx.createRadialGradient(shadowX - waxing * radius * 0.1, center - radius * 0.06, radius * 0.08, shadowX, center, radius * 1.18);
  shadowGradient.addColorStop(0, '#274283');
  shadowGradient.addColorStop(0.7, '#17223d');
  shadowGradient.addColorStop(1, '#0b1226');
  ctx.fillStyle = shadowGradient;
  ctx.beginPath();
  ctx.ellipse(shadowX, center, Math.max(radius * 0.12, radius * illum), radius, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// position of the sun (or moon at hour+12) along the day arc
export function skyBodyOrbitPosition(hour, orbit = SKY_BODY_ORBIT) {
  const t = clamp((((hour - 6) % 24) + 24) % 24 / 12, 0, 1);
  const angle = t * Math.PI;
  const altitude = Math.max(0, Math.sin(angle));
  const pathT = smoothstep(0, 1, t);
  const lateralDrift = Math.sin(angle * 2) * 8;
  return new THREE.Vector3(
    lerp(orbit.sunriseX, orbit.sunsetX, pathT) + lateralDrift,
    orbit.horizonY + Math.pow(altitude, 0.72) * (orbit.apexY - orbit.horizonY),
    lerp(orbit.sunriseZ, orbit.sunsetZ, pathT) - altitude * orbit.noonZPull,
  );
}

// day/night blends derived only from the hour
export function celestial(hour, orbit = SKY_BODY_ORBIT) {
  const h = ((hour % 24) + 24) % 24;
  const sunAngle = ((h - 6) / 12) * Math.PI;
  const sunAltitude = Math.sin(sunAngle);
  const sunFade = smoothstep(-0.22, -0.04, sunAltitude);
  const bodyKind = sunFade <= 0.001 ? 'moon' : 'sun';
  const position = bodyKind === 'moon'
    ? skyBodyOrbitPosition((h + 12) % 24, orbit)
    : skyBodyOrbitPosition(h, orbit);
  return {
    hour: h,
    bodyKind,
    position,
    dayAmount: smoothstep(0, 0.35, sunAltitude),
    nightAmount: smoothstep(0.08, -0.32, sunAltitude),
    goldenAmount: Math.max(0, 1 - Math.abs(sunAltitude) / 0.4),
    sunFade,
  };
}

// ---------- rain (palette-tinted line segments, wind-slanted) ----------

export function createRain({ count = 900, rng = Math.random } = {}) {
  const positions = new Float32Array(count * 6);
  const base = new Float32Array(count * 3);
  const lengths = new Float32Array(count);
  const phases = new Float32Array(count);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    base[i * 3] = lerp(-42, 42, rng());
    base[i * 3 + 1] = lerp(-8, 36, rng());
    base[i * 3 + 2] = lerp(-18, 58, rng());
    lengths[i] = lerp(1.6, 5.2, rng());
    phases[i] = rng() * 100;
    speeds[i] = lerp(0.7, 1.3, rng());
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const mesh = new THREE.LineSegments(geometry, material);
  mesh.renderOrder = 5;

  // settings: { rainAmount, rainAngle=0.5, rainSpeed, windAmount, stormAmount, color }
  function update(time, s) {
    const fallSpan = 44;
    const top = 37;
    const n = Math.round(count * s.rainAmount);
    const slant = lerp(-0.1, -1.9, s.rainAngle ?? 0.5) * lerp(0.72, 1.3, s.windAmount ?? 0);
    const fallSpeed = lerp(4, 32, s.rainSpeed ?? s.rainAmount) * lerp(0.75, 1.35, s.windAmount ?? 0);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < n; i += 1) {
      const x = base[i * 3] + Math.sin(time * 0.5 + phases[i]) * (s.windAmount ?? 0) * 1.4;
      const z = base[i * 3 + 2] + Math.cos(time * 0.28 + phases[i]) * (s.windAmount ?? 0) * 1.2;
      const length = lengths[i] * lerp(0.75, 1.35, s.rainAmount);
      const wrapped = top - ((time * fallSpeed * speeds[i] + base[i * 3 + 1] + phases[i]) % fallSpan);
      const index = i * 6;
      position.array[index] = x;
      position.array[index + 1] = wrapped;
      position.array[index + 2] = z;
      position.array[index + 3] = x + slant * length;
      position.array[index + 4] = wrapped - length;
      position.array[index + 5] = z;
    }
    geometry.setDrawRange(0, n * 2);
    position.needsUpdate = true;
    if (s.color) material.color.copy(s.color);
    material.opacity = s.rainAmount * lerp(0.22, 0.58, s.stormAmount ?? 0);
  }

  return { mesh, update };
}

// ---------- lightning ----------

export function createLightning() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
  geometry.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    color: 0xd7f5ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 7;

  let pulse = 0;
  let cooldown = 0;
  const start = new THREE.Vector3();

  function reset(time) {
    const position = geometry.getAttribute('position');
    start.set(Math.sin(time * 8.71) * 22, 38, -18 + Math.cos(time * 3.17) * 12);
    for (let i = 0; i < 9; i += 1) {
      const t = i / 8;
      position.array[i * 3] = start.x + Math.sin(t * 12.4 + time) * lerp(0, 3.2, t);
      position.array[i * 3 + 1] = lerp(start.y, 8, t);
      position.array[i * 3 + 2] = start.z + Math.cos(t * 10.1 + time) * 1.4;
    }
    position.needsUpdate = true;
    geometry.setDrawRange(0, 9);
  }

  // settings: { stormAmount, color } → returns current pulse 0..1
  function update(time, delta, s) {
    pulse *= Math.pow(0.015, delta);
    cooldown = Math.max(0, cooldown - delta);
    const storm = s.stormAmount ?? 0;
    if (storm > 0.05 && cooldown <= 0 && Math.random() < delta * storm * 0.16) {
      pulse = lerp(0.55, 1, Math.random());
      cooldown = lerp(1.8, 5.8, Math.random()) / Math.max(0.25, storm);
      reset(time);
    }
    if (pulse < 0.01) geometry.setDrawRange(0, 0);
    material.opacity = pulse * 0.92 * storm;
    if (s.color) material.color.copy(s.color);
    return pulse;
  }

  return { line, update };
}

// ---------- the whole atmosphere, wired ----------

export function createSky({ scene, radius = 160 } = {}) {
  const material = new THREE.ShaderMaterial({
    ...skyShader,
    uniforms: THREE.UniformsUtils.clone(skyShader.uniforms),
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;

  const bodyDisc = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSunTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    }),
  );
  bodyDisc.renderOrder = -80;
  bodyDisc.scale.setScalar(14);

  let bodyKind = 'sun';
  function setBody(kind, moonPhase = 0.66) {
    if (kind === bodyKind && kind !== 'moon') return;
    if (bodyDisc.material.map) bodyDisc.material.map.dispose();
    bodyDisc.material.map = kind === 'moon' ? makeMoonTexture(moonPhase) : makeSunTexture();
    bodyDisc.material.needsUpdate = true;
    bodyKind = kind;
  }

  const rain = createRain();
  const lightning = createLightning();

  if (scene) {
    scene.add(mesh);
    scene.add(bodyDisc);
    scene.add(rain.mesh);
    scene.add(lightning.line);
  }

  // convenience: place the body + sync dome uniforms from an hour of day
  function setHour(hour, moonPhase = 0.66) {
    const c = celestial(hour);
    setBody(c.bodyKind, moonPhase);
    bodyDisc.position.copy(c.position);
    material.uniforms.uBodyDir.value.copy(c.position).normalize();
    material.uniforms.uNight.value = c.nightAmount;
    return c;
  }

  return { mesh, material, uniforms: material.uniforms, bodyDisc, setBody, setHour, rain, lightning, celestial };
}
