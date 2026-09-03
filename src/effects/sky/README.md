# sky

A reusable atmosphere system extracted into one module:

- **skyShader / createSky({ scene, radius })** — dome with four-stop gradient
  banding (uTop/uMid/uHorizon/uBottom + uGradientBand), FBM cloud layer that
  morphs from soft veils to billowy lobes (uCloudCover, uCloudDensity,
  uCloudScale, uCloudSoftness, uCloudBillow, uCloudBrightness, uCloudSpeed),
  hashed twinkling star field (uStarDensity, uNight), sun/moon glow
  (uBodyDir, uBodyColor, uBodySize), storm darkening + lightning flash
- **makeSunTexture() / makeMoonTexture(phase)** — canvas-painted discs; the
  moon is phase-accurate (waxing/waning shadow ellipse)
- **skyBodyOrbitPosition(hour) / celestial(hour)** — the day arc + day/night
  blend amounts
- **createRain() / createLightning()** — palette-tinted slanting rain lines
  and the additive zigzag bolt

## Usage

```js
import { createSky } from './index.js';

const sky = createSky({ scene });
sky.setHour(18.25);               // sunset; swaps sun→moon automatically
sky.uniforms.uCloudCover.value = 0.4;
// per frame:
sky.uniforms.uTime.value = t;
sky.rain.update(t, { rainAmount: 0.6, windAmount: 0.3, stormAmount: 0.4, color });
sky.uniforms.uLightning.value = sky.lightning.update(t, dt, { stormAmount: 0.4 });
```

Feed the dome's gradient colours from the host scene's time-of-day palette to
blend it into another environment.
