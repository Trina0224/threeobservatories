# Three Observatories — Simulation Specification

## 1. Goal

Build a browser-based 3D simulation that places Hubble, Webb, and Roman in one coherent astronomical scene and one synchronized simulation clock.

The experience must support historical mission playback and educational exploration without conflating rendered scale with physical truth.

## 2. Observatory scope

### Hubble Space Telescope

Primary mode: Earth-centered LEO propagation.

Truth source:
- current or archived TLE + SGP4

Current implementation:
- NORAD 20580 TLE propagated in-browser with `satellite.js`
- current orbital phase is no longer a hand-chosen circular phase
- checked-in TLE epoch must be refreshed when used far outside its useful prediction window

Required outputs:
- TEME/ECI propagation state
- display-frame transform
- altitude
- orbital period estimate
- sunlight / Earth-shadow state
- ground track (later milestone)

Sanity-check values around the 2026-08-30 integration:
- altitude: about 470–472 km
- inclination: about 28.47 deg
- period: about 94.03 min

### James Webb Space Telescope

Primary modes:
- launch/transfer playback from authoritative trajectory/ephemeris products
- L2 ephemeris playback
- optional propagated CR3BP educational model

Current truth source:
- JPL Horizons spacecraft ID `-170`
- Earth-centered ecliptic Cartesian state vectors
- same-epoch Earth-to-Sun vectors define the Sun–Earth rotating display basis
- STScI documents JWST as Horizons observer location `500@-170`
- NASA MEM JWST trajectory remains an independent historical/reference product

#### JWST data-delivery architecture

The browser must **not** depend on direct cross-origin calls to the JPL Horizons API.

Required pipeline:

1. `scripts/update-jwst-ephemeris.mjs` queries Horizons outside the browser.
2. Query JWST and Sun sequentially rather than in parallel.
3. Write a compact, browser-friendly cache at `public/data/jwst-horizons.json`.
4. Preserve source metadata: command IDs, center, frame/reference plane, units, time scale, cadence, range, and generation time.
5. The browser fetches only the same-origin cache and interpolates it on the shared simulation clock.
6. `.github/workflows/update-jwst-ephemeris.yml` refreshes the cache manually and on a schedule.

Current cache contract:
- object: JWST `-170`
- reference body/origin: Earth center `500@399`
- reference plane: ecliptic
- units: km and km/s product convention, with position columns cached
- time scale: TDB
- cadence: 12 hours
- current range: 2024-01-01 through 2031-01-01

Truth/fallback rule:
- **one function owns Webb's position.** The sprite, the local trail, the local tube and the heliocentric wave must all be sampled from it, in every view. A spacecraft drawn from one source while its path is drawn from another will drift off its own trajectory; see section 6.
- suppressing a placeholder that another layer keeps redrawing is not a substitute for removing it
- if the cache is missing or invalid, or the clock leaves its coverage window, draw a visibly educational fallback rather than claiming current truth, and label it as such in the focus card
- never blend cached and fallback samples into a single path: if the centre epoch is covered, draw only cached samples and simply omit epochs that are not
- do not extrapolate the older NASA MEM trajectory beyond its supplied time span and call it current ephemeris

Required milestones:
- launch epoch marker
- Earth departure
- deployment timeline layer
- arrival/insertion into the Sun–Earth L2 region
- continuing L2 motion from real ephemeris where available

Sanity checks:
- L2 distance from Earth: about 1.5 million km
- Webb does not sit on L2
- Webb orbit period around the L2 region is roughly six months. NASA public material quotes about 168 days; the bundled Horizons cache measures 178–183 days depending on epoch, and the renderer must use the measured value rather than a hard-coded one
- the halo is quasi-periodic and does not close on itself: over one revolution it drifts roughly 40 000–50 000 km. A drawn loop must not be forced shut with interpolated points
- Webb must not be depicted as normally hiding in Earth's umbra; its thermal story is dominated by its own Sun-facing sunshield and stable L2 geometry

### Nancy Grace Roman Space Telescope

Primary modes:
- launch/transfer playback from authoritative trajectory products
- L2 quasi-halo orbit playback
- optional propagated CR3BP educational model

Required milestones:
- launch epoch marker
- departure from Earth
- transfer trajectory
- L2 arrival
- quasi-halo orbit around Sun–Earth L2

Roman launched on 2026-08-30 and is currently in the transfer phase as this specification is written. Historical/current-state support must therefore be designed from the start rather than hardcoding a future pre-launch scenario.

#### Current transfer implementation

`src/missions/roman-transfer.js` integrates the transfer rather than drawing it. It is a Sun–Earth CR3BP stable-manifold arc into L2, built by integrating backwards from the L2 point along the stable eigenvector of the linearised saddle until the arc reaches its closest approach to Earth, with a Keplerian coast placing it on the mission clock. Accuracy label: `LOW_ENERGY_CR3BP`.

Two things about it must stay visible in the UI, and both are:

- It is **not** Roman's flown trajectory, and NASA has published no Roman ephemeris to compare against.
- It is a **low-energy** transfer and therefore a different design class from Roman's direct Falcon Heavy injection: it loops sunward for the first days, then coasts out and arrives at L2 asymptotically. That shape is a property of stable manifolds, not an artefact.

Patching a direct Keplerian escape onto the arc to hide the sunward loop was measured and rejected: the join requires 0.5–1.3 km/s, while a real mid-course correction is metres per second. Presenting that as a correction would be a fabrication.

Replacing this with a direct-injection transfer means solving the two-point boundary value problem properly — Richardson third-order halo approximation, differential correction with the state transition matrix, then the manifold tube of the halo rather than of the point. Until that exists, the label stays `LOW_ENERGY_CR3BP`.

#### L2 halo

`src/missions/roman-halo.js` computes the halo rather than drawing it: Richardson's third-order approximation supplies a starting state, then differential correction moves `z0` and `vy0` until the orbit closes on itself. Freeing `x0` and `vy0` instead leaves the out-of-plane velocity uncontrolled and the corrector wanders off the family.

The period lands at 180.1 days, which is the check that the result belongs to the known Sun–Earth L2 family rather than merely looking like a halo. The orbit closes to 0.2 km. Its size — about 700 000 km across in-plane — is inherent: the family's minimum in-plane amplitude is around 211 000 km and the in-plane ratio `k` is about 3.19, so a Sun–Earth L2 halo cannot be small. The GSE cameras are framed for that.

It is a real member of the family but it is not Roman's halo; NASA has published no amplitude for that.

Two implementation notes worth keeping:

- The converged initial state ships as a constant. Correcting it needs a fine crossing integration — coarser than about 4000 steps and the Newton settles onto the **planar Lyapunov orbit** instead, which is periodic and closes perfectly, so nothing looks wrong. `scripts/check-roman-halo.mjs` re-derives the state in CI and asserts an out-of-plane amplitude, which is what separates the two.
- Richardson's amplitudes are in units of γ, not system units. Mixing those up yields amplitudes about a hundred times too large, and the corrector then converges on something unrelated.

## 3. Shared simulation clock

The application has one canonical simulation time.

UI:
- show UTC
- play/pause
- jump to mission events
- continuous or selectable time-compression rates

Internal requirements:
- deterministic replay where source data permit it
- no dependence on browser local timezone
- explicit ephemeris time conversion
- source validity windows respected

## 4. Scene/view modes

### Orbit path rules (all views)

These apply wherever a spacecraft and its trajectory appear together.

- A craft and its drawn path come from the same position function. This is a structural requirement, not a tuning exercise: if the two can disagree, eventually they will.
- A closed orbit loop is drawn as **exactly one revolution**, and the revolution length is measured from the source ephemeris at the current epoch. A fixed window over a drifting period overshoots and leaves a loose end hanging off the loop, which reads as a broken orbit. A 200-day window on Webb's ~178-day halo put the two ends of the line 430 000 km apart.
- The residual step where the ends meet is real orbital drift. Leave it. Do not close the loop with points that are not in the source data.
- Paths are rebuilt on a time bucket, never every animation frame.

### Solar / L2 View

Show:
- Sun
- Earth
- Moon
- L1 and L2 when useful
- Webb orbit trail
- Roman orbit trail
- transfer trajectories when timeline intersects them

Both observatory paths must be present in this view. A regression once left the heliocentric overview with Roman's purple path and no Webb path at all, because only the close follow view rebuilt the real amber one.

Use a Sun/Earth-aware frame or transform that makes L2 geometry understandable while preserving documented physical state underneath.

### Earth System View

Show:
- Earth
- Moon
- Hubble orbit
- Webb/Roman departure direction and transfer trajectory when applicable
- L2 direction indicator

### L2 Close-up / Thermal Geometry View

The L2 close-up must explain **why L2 is useful**, not merely show two spacecraft orbit loops.

Required educational message:
- Sun–Earth L2 lies on Earth's anti-solar side, but Webb and Roman are not normally sitting inside a permanent Earth umbra.
- Webb and Roman occupy large halo/quasi-halo trajectories around the L2 region.
- Their mission geometry is designed so the Sun, Earth, and Moon remain in roughly the same general direction from the spacecraft for long periods.
- Stable solar illumination and stable source directions simplify power, thermal control, pointing constraints, communications geometry, and observing operations.

Rendering rules:
- **Hubble:** sunlight / Earth-shadow transitions may use a visible glow/dimming effect because the state changes frequently.
- **Webb / Roman:** do not use a permanent sunlight halo as the primary visual explanation.
- A text card may state that the L2 observatories are normally sunlit and are not relying on Earth to shade them.
- Do not use large arrows or translucent orientation planes when they obscure the scene.

### L2 Wave View

The L2 Wave view combines the annual heliocentric motion of the Earth–L2 system with the local out-of-ecliptic motion of the observatories.

Webb rendering requirements:
- source points must come from the cached Horizons ephemeris
- transform each sample with a same-epoch Sun vector
- the wave and the Webb sprite must be produced by the same position function and the same local-to-heliocentric transform, so the telescope rides the tube by construction
- render a thick, high-contrast amber tube that remains legible on iPad/WebGL
- keep only one authoritative Webb wave path visible, by not creating a second one
- do not rebuild the tube every animation frame; rebuild only when the source or time window materially changes
- depth-test and frustum-culling overrides are not a fix for a path drawn in the wrong place. Do not reach for them to make a competing path win.

Roman may retain a clearly labeled projected purple wave until authoritative post-launch ephemeris is connected.

### Spacecraft Follow View

Follow one observatory while optionally displaying:
- velocity vector
- Sun direction
- Earth direction
- orbit normal
- telescope boresight
- sunshield/body reference axes

### Heliocentric Roman Mission Views

Roman Mission must support both Earth/GSE and heliocentric views while preserving the same mission time.

Heliocentric rendering rules:
- Earth orbit is a thin, subdued blue-gray reference curve.
- Roman's launch-to-L2 transfer is the visually dominant path.
- The transfer spans about three months, so the mission path should occupy only about one quarter of Earth's annual orbit.
- L2 arrival must have dedicated close-up and side views.

### Scale modes

`TRUE_SCALE`
- physically proportional positions and body radii as far as numerically/renderably practical

`EDUCATIONAL_SCALE`
- exaggerated body radii, orbit widths, and local spacing for legibility
- must never mutate source physical state vectors
- UI must indicate that the scene is not to scale

## 5. Data model

Every spacecraft state sample should be representable as:

```ts
interface StateVector {
  epoch: string;
  timeScale: 'UTC' | 'TAI' | 'TT' | 'TDB' | 'ET';
  frame: string;
  positionKm: [number, number, number];
  velocityKmS?: [number, number, number];
  sourceId: string;
}
```

Imported datasets must carry provenance metadata and validity windows.

## 6. Rendering architecture

Physics/data truth and Three.js display objects must stay separable.

Current layout:

| Path | Holds | Must not hold |
| --- | --- | --- |
| `src/physics/` | frames, transforms, low-precision solar coordinates | Three.js objects, mission constants |
| `src/data/` | Horizons cache loader, Hubble TLE + SGP4 | Three.js objects |
| `src/core/` | integrator, playback | mission constants, Three.js objects |
| `src/main.js` | the single observatory renderer, scene graph, UI | orbital truth of its own |
| `src/roman-mission.js`, `src/roman-heliocentric.js` | Roman's independent scenes | — |

Physics and data modules exchange plain `{ x, y, z }` vectors in kilometres. Conversion to render units happens at one boundary and does nothing but apply the display scale.

### One renderer, one source per object

**Do not layer a second module over a finished scene to correct it.** That was tried and it failed in a way worth recording, because it looked like it worked:

A patch module imported the renderer, then each frame reached into the built scene to overwrite spacecraft positions and hide placeholder trails. Both modules drove their own `requestAnimationFrame` callback, and the renderer's was registered first — so every correction was applied *after* the frame it was meant to fix had already been drawn, and was overwritten before the next one. The visible result was a telescope floating beside its own trajectory, suppressed placeholder paths reappearing next to the real ones, and views that silently kept the placeholder because the patch layer only rebuilt some of them.

Monkey-patching `THREE.Object3D.prototype.add` to filter objects out of a scene is the same anti-pattern. If an object should not exist, delete the code that creates it.

The display layer must not silently manufacture current mission phase when source data are unavailable: draw the labelled educational fallback and say so in the UI.

## 7. Visual-information policy

Every persistent visual effect should answer a question.

Good examples:
- Hubble glow disappears in Earth's shadow.
- A subdued reference plane reveals the out-of-ecliptic extent of a halo orbit.
- Real ephemeris/TLE state drives spacecraft phase.
- A thick amber Webb tube remains visible while preserving the real trajectory geometry.

Bad examples:
- A permanent glow around Webb/Roman that does not change.
- Reference orbits with the same weight/color as the mission trajectory.
- Large labels, arrows, or planes that obscure the scene without adding information.
- Two competing Webb paths that flicker or alternately overwrite visibility.

## 8. Verification requirements

A code path is not considered complete merely because it builds a Three.js object.

The repository must retain an automated browser smoke test for Webb's L2 path:

- open the local site
- wait until `data-jwst-ephemeris="ready"`
- walk `L2 close-up`, `L2 wave` and `Sun / Earth orbit`, capturing a screenshot of each
- assert per view:
  - the rendered image contains a substantial amber-pixel population
  - Webb's Earth distance is inside the Sun–Earth L2 band (1.0–2.0 million km)
  - the drawn halo spans one revolution (150–220 days) and its ends land within 150 000 km of each other
  - wherever Webb is on screen, amber pixels are within 40 px of the projected sprite
- repeat the whole sequence against the published GitHub Pages URL after deployment

Counting amber pixels is not sufficient on its own. Every regression this project has hit rendered plenty of amber; what was wrong was *where* it was. An assertion must tie the spacecraft to its path, and the path to one revolution.

The Roman transfer is checked numerically in Node, with no browser, because the
CR3BP is only worth having if its answers are checkable:

- Sun–Earth L2 distance against the published ~1.5 million km
- Jacobi constant drift across the arc (the only integral of motion, so the only
  honest measure of the integration)
- transfer duration against the mission's 90 days
- departure at the separation altitude, arrival inside the L2 region
- Earth range increasing throughout
- the sunward loop, asserted deliberately so that changing the trajectory class
  also forces the UI label to change

Current files:
- `scripts/smoke-jwst-wave.mjs`
- `scripts/check-roman-transfer.mjs`
- `.github/workflows/smoke-jwst-wave.yml`

The renderer exposes `window.__threeObservatories` purely so this test can read the state it asserts on. It is a test seam, not an API.

## 9. Current implementation milestones

1. Page opens and renders Sun, Earth and Moon.
2. Simulation clock can pause and advance at multiple rates.
3. L2 is positioned from a documented Sun–Earth model or clearly labeled educational approximation.
4. **Hubble current phase is TLE/SGP4-backed.**
5. **Webb current/local phase and L2 Wave are driven by the repository-local JPL Horizons cache.**
6. Roman has launch-to-L2 mission playback with actual launch events and projected future milestones clearly distinguished.
7. All views preserve a consistent mission/simulation time.
8. User can switch among Earth/GSE, L2, heliocentric, follow, and dedicated L2-arrival views.
9. Orbit trails can be toggled.
10. UI/source copy exposes provenance for Hubble/Webb truth state.
11. Local and published smoke tests verify, in three views, that the amber Webb trajectory is rendered, that Webb sits on it, and that it is drawn as one measured halo revolution.

## 10. Later scientific features

- automatic scheduled HST TLE refresh/cache
- SPICE-based or reconstructed JWST cache as a possible higher-fidelity alternative
- CR3BP integrator and free propagation
- station-keeping demonstrations
- higher-fidelity eclipse/penumbra modeling
- real target pointing / field-of-regard constraints
- instrument field-of-view overlays
- archived TLE playback for historical Hubble dates
- mission-specific Sun/Earth/Moon avoidance and thermal-angle constraints

## 11. Non-goals for the current milestone

- full spacecraft rigid-body dynamics
- high-fidelity propulsion simulation
- exact launch vehicle ascent aerodynamics
- exact thermal model
- photorealistic Earth atmosphere
- perfect 3D spacecraft geometry

Correct trajectory, time, frame, provenance, visible verification, and user comprehension come first.
