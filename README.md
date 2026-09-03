# the roundabouts 🌸

The procedural core of [**the roundabouts**](https://roundabouts.artificialisabel.com) —
a pastel, toon-shaded digital garden inspired by the planted roundabouts of
Berkeley intersections. Every mesh, colour and texture here is generated in
code: no models, no textures, no assets.

**The full experience lives at [roundabouts.artificialisabel.com](https://roundabouts.artificialisabel.com)** —
a collaborative neighbourhood where every intersection is somebody's garden,
you tend your own corner, and you can leave notes on your neighbours' trees.
This repository is the other half of it: **the generators, and a demo you can
walk** — one roundabout, sown from a single seed, with the weather doing its
own thing overhead.

Built with [three.js](https://threejs.org) and [Vite](https://vitejs.dev).

## run it

```bash
npm install
npm run dev
```

Use Node.js 20.19 or newer (or Node.js 22.12+). Build a static production copy
with `npm run build`.

## the demo

One misty intersection with a planted bed in the middle of it. No accounts,
no network, nothing to sign into — it all runs in the browser.

- **walk** — click to grab the view, W to walk, A/D to turn, mouse to look
  (phones get a thumb stick and a drag to look)
- press **E** at the roundabout to **stop by** — the camera glides in, the
  potting bench opens, and you can orbit the bed
- **re-sow** rolls a new number and grows the whole bed again from it
- the **potting bench** is the field journal: seven specimen types, a slider
  for every shape, seed codes, and a live preview you can orbit and zoom.
  Keep the ones you like as **seed packets** (they live in localStorage).
  Here it is a viewer — what you grow on the bench travels as a seed code;
  planting into a bed by hand belongs to the full version
- **time** slider: dawn → noon → golden hour → night, with street lamps, lit
  windows and fireflies · **breeze** slider: how hard the garden feels the wind
- **the weather does its own thing** — mostly fair, drifting clouds,
  occasional showers, the odd short storm with lightning, and a rainbow when
  the sun breaks through after rain. Rain falls as wind-bowed painterly
  streaks with splash rings where drops land; plants sag and shiver under it.
  Click the weather chip to hold fair / showers / storm, click again to set the
  sky free

## how seeds work

Two different seeds, doing two different jobs.

**A specimen** is a set of parameters plus a 32-bit growth seed. The
parameters say what kind of thing it is — petal count, cap curl, trunk lean,
water colour; the growth seed decides every little wobble within those
bounds. The pair packs into a short base-36 **seed code**:

```
f1-2xk9q7m3p0
│└─ schema version          the rest: bit-packed params + the growth seed
└── type prefix (flower)
```

Paste a code into the seed box and the exact specimen grows back, anywhere.
Type a bare number instead and it rolls a whole new design from that number.
Bit widths come straight from the schema in `src/params.js`, which is also
what builds the sliders — so a code is only ever as long as the design needs,
and params can never drift out of step with the UI. Never reorder params
within a version; add new ones behind a version bump.

**A bed** is one number too. `sowBed(seed, radius)` deterministically picks
how many things grow, what they are, and where they stand — so a whole corner
travels as a single integer. The demo puts it in the address bar:

```
/?seed=482193
```

Same number, same garden, every time.

## the generators

The generators are independent of the world, UI and demo. Hand one params and a
seed and it returns renderable three.js geometry with vertex colours baked in
and toon materials applied. Most specimens collapse to one mesh; ponds keep
their animated water, koi, jellies and lilies as child meshes. Copy the shared
`rng.js`, `materials.js` and `pond/` helpers with the generator modules when
using them elsewhere.

```js
import { generate } from './src/generators/index.js';
import { randomParams } from './src/params.js';

const { params, seed } = randomParams('flower', 1130);
scene.add(generate('flower', params, seed));
```

| generator | what it grows |
| --- | --- |
| `flower.js` | patches of blooms — petal count, length, taper, ruffle, centres, stalks |
| `mushroom.js` | clusters of caps: flat to pointy, curled rims, freckles, bulbous stems |
| `plant.js` | leafy bushes — leaf shape and fold, upright to weeping, tidy to wild |
| `tree.js` | crooked trunks and branches under cloud / cube / drop canopies, in groves |
| `rock.js` | wobbled boulders piled in cairns — flat to tall, smooth to angular, mossy |
| `grass.js` | tufts of bowed blades, tipped with a second colour |
| `pond.js` | a sunken basin of water with koi, lily rafts and moon jellies in it |

They share `generators/common.js` — the mesh plumbing: disc and ribbon
geometry, per-vertex painting, wobble noise, and merge-and-finalize helpers for
specimens that can become one draw call.

## how it fits together

| piece | where |
| --- | --- |
| the corner: roundabout, blocks, path, planting | `src/world.js` |
| the bed itself (dome, pebble curb, signpost) | `src/roundabout.js` |
| houses, lawn trees, street lamps | `src/blocks.js` |
| what grows in a bed, from one number | `src/sowing.js` |
| plant records → meshes on the bed | `src/plantings.js` |
| first-person walking, collisions, head bob | `src/player.js` · `src/touch.js` |
| sky, mist, sun, fog, fireflies, time of day | `src/environment.js` · `src/effects/sky/` |
| clouds, rain, lightning, rainbow | `src/weather.js` |
| toon ramp, wind shader injection, height mist | `src/materials.js` |
| param schemas, palettes, naming | `src/params.js` |
| seed codes | `src/seedcode.js` |
| seeded RNG and noise | `src/rng.js` |
| the field journal, potting bench, garden bar | `src/ui.js` · `src/bench.js` |

The wind is a shader, not a simulation: `materials.js` injects a vertex
displacement into every plant material and `main.js` drives the shared
uniforms — one wind for the whole garden, with each vertex swaying by the
`aBend` weight its generator baked in and a per-plant phase offset, so
nothing moves in lockstep. Rain rides the same attribute as a sag and a
shiver.
