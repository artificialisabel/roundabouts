// One shared toon material for every living thing in the garden. Geometry
// carries all colour in vertex colours plus two custom attributes:
//   aBend  — 0 at the root, 1 at the tip; how much the wind moves a vertex
//   aPhase — per-part random phase so petals/blades don't sway in lockstep
// The wind is injected into the toon shader via onBeforeCompile.

import * as THREE from 'three';

export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0.08 },
  uWindDir: { value: new THREE.Vector2(1, 0.35).normalize() },
  uRain: { value: 0 }, // 0..1 — plants sag a little and shiver under drops
};

const rampSteps = new Uint8Array([135, 185, 230, 255]);
export const toonRamp = new THREE.DataTexture(rampSteps, rampSteps.length, 1, THREE.RedFormat);
toonRamp.needsUpdate = true;
toonRamp.magFilter = THREE.NearestFilter;
toonRamp.minFilter = THREE.NearestFilter;
toonRamp.generateMipmaps = false;

// low mist that eats the feet of everything — blends fragments toward the fog
// colour near y=0 so houses and beds have no hard bottom line
export const mistUniforms = {
  uMistAir: { value: 0.55 },
  uMistTop: { value: 1.6 },
};

export function injectHeightMist(shader) {
  shader.uniforms.uMistAir = mistUniforms.uMistAir;
  shader.uniforms.uMistTop = mistUniforms.uMistTop;
  shader.vertexShader =
    'varying float vMistY;\n' +
    shader.vertexShader.replace(
      '#include <project_vertex>',
      `{
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vMistY = (modelMatrix * wp4).y;
      }
      #include <project_vertex>`
    );
  shader.fragmentShader =
    'varying float vMistY;\nuniform float uMistAir;\nuniform float uMistTop;\n' +
    shader.fragmentShader.replace(
      '#include <fog_fragment>',
      `#include <fog_fragment>
      #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, uMistAir * smoothstep(uMistTop, 0.0, vMistY));
      #endif`
    );
}

function patchWind(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uWindDir = windUniforms.uWindDir;
    shader.uniforms.uRain = windUniforms.uRain;
    shader.vertexShader =
      `attribute float aBend;\nattribute float aPhase;\nuniform float uTime;\nuniform float uWind;\nuniform vec2 uWindDir;\nuniform float uRain;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float ph = aPhase * 6.2831 + (modelMatrix[3][0] + modelMatrix[3][2]) * 0.37;
          float sw = sin(uTime * 1.7 + ph) * 0.72 + sin(uTime * 2.93 + ph * 1.83) * 0.28;
          float amp = uWind * aBend * aBend;
          transformed.x += uWindDir.x * sw * amp;
          transformed.z += uWindDir.y * sw * amp;
          transformed.y -= abs(sw) * amp * 0.22;
          // rain: a gentle sag plus a high-frequency shiver, as if drops keep landing
          float sag = uRain * aBend * aBend;
          transformed.y -= sag * (0.045 + 0.02 * sin(uTime * 6.7 + ph * 4.1));
          transformed.x += sin(uTime * 9.3 + ph * 17.0) * sag * 0.014;
          transformed.z += cos(uTime * 8.1 + ph * 23.0) * sag * 0.012;
        }`
      );
    injectHeightMist(shader);
  };
  material.customProgramCacheKey = () => 'garden-wind-mist';
  return material;
}

export function makePlantMaterial({ ghost = false } = {}) {
  const mat = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: toonRamp,
    side: THREE.DoubleSide,
  });
  if (ghost) {
    mat.transparent = true;
    mat.opacity = 0.55;
    mat.depthWrite = false;
  }
  return patchWind(mat);
}

export const plantMaterial = makePlantMaterial();
export const ghostMaterial = makePlantMaterial({ ghost: true });

// ground / curb / houses — no wind, still toon + vertex colours, feet in mist
export const groundMaterial = new THREE.MeshToonMaterial({
  vertexColors: true,
  gradientMap: toonRamp,
});
groundMaterial.onBeforeCompile = (shader) => injectHeightMist(shader);
groundMaterial.customProgramCacheKey = () => 'ground-mist';

// hex strings are sRGB; the Color constructor already converts them into the
// linear working space — no extra convertSRGBToLinear, that double-darkens
export function srgbLinear(hex) {
  return new THREE.Color(hex);
}

// soft radial glow — for lamp halos and fireflies (otherwise sprites/points
// render as hard squares)
export const glowTexture = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
