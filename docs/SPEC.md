# Three Observatories — Simulation Specification

## 1. Goal

Build a browser-based 3D simulation that places Hubble, Webb, and Roman in one coherent astronomical scene and one synchronized simulation clock.

The experience must support both historical mission playback and educational exploration without conflating rendered scale with physical truth.

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
- Earth-centered ecliptic Cartesian state vectors fetched over HTTP and interpolated on the shared simulation clock
- same-epoch Sun vectors from Horizons define the Sun–Earth rotating display basis
- STScI documents JWST as Horizons observer location `500@-170`
- NASA MEM JWST trajectory remains an independent historical/reference product

Truth/fallback rule:
- when Horizons data are available, hide the old hand-drawn Webb halo phase/trail
- if Horizons is unavailable, do not label a renderer placeholder as current mission truth
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
- Webb orbit period around L2 region: roughly six months / about 168 days per NASA materials
- Webb is not normally represented as hiding in Earth's umbra; the thermal story is dominated by its own Sun-facing sunshield and stable L2 geometry

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

Roman launched on 2026-08-30 and is currently in the transfer phase as this initial specification is written. Historical/current-state support should therefore be designed from the start rather than hardcoding a future pre-launch scenario.

## 3. Shared simulation clock

The application has one canonical simulation time.

UI:
- show UTC
- play/pause
- step backward/forward
- jump to mission events
- continuous or selectable time-compression rates

Internal requirements:
- deterministic replay where source data permit it
- no dependence on browser local timezone
- ephemeris time conversion explicit
- source validity windows respected

## 4. Scene/view modes

### Solar / L2 View

Show:
- Sun
- Earth
- Moon
- L1 and L2 when useful
- Webb orbit trail
- Roman orbit trail
- transfer trajectories when timeline intersects them

Use a Sun/Earth-aware frame or transform that makes L2 geometry understandable while preserving a documented physical state underneath.

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
- **Hubble:** sunlight / Earth-shadow transitions may use a visible glow/dimming effect because the state changes frequently and therefore carries information.
- **Webb / Roman:** do not use a permanent sunlight halo as the primary visual explanation; a nearly constant glow becomes decorative.
- A text card may explicitly state that the L2 observatories are normally sunlit and are not relying on Earth to shade them.
- Do not use large arrows or translucent orientation planes when they obscure the scene.

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
- The transfer spans about three months, therefore the mission path should occupy only about one quarter of Earth's annual orbit rather than visually implying a full-year trajectory.
- L2 arrival must have dedicated close-up and side views.

### Scale modes

`TRUE_SCALE`
- physically proportional positions and body radii as far as numerically/renderably practical

`EDUCATIONAL_SCALE`
- exaggerated body radii / orbit widths / labels for legibility
- must never mutate physical state vectors
- UI must clearly indicate that the scene is not to scale

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

Physics/data truth and Three.js display objects must stay separable. Browser-friendly ephemeris interpolation may be layered over the renderer, but the display layer must not silently manufacture current mission phase when source data are unavailable.

## 7. Visual-information policy

Every persistent visual effect should answer a question.

Good examples:
- Hubble glow disappears in Earth's shadow.
- A subdued reference plane reveals the out-of-ecliptic extent of a halo orbit.
- Real ephemeris/TLE state drives spacecraft phase.

Bad examples:
- A permanent glow around Webb/Roman that does not change.
- Reference orbits with the same weight/color as the mission trajectory.
- Large labels/arrows/planes that obscure the scene without adding information.

## 8. Current implementation milestones

1. Page opens and renders Sun, Earth and Moon.
2. Simulation clock can pause and advance at multiple rates.
3. L2 is positioned from a documented Sun–Earth model or clearly labeled educational approximation.
4. **Hubble current phase is TLE/SGP4-backed.**
5. **Webb current/local phase is JPL Horizons-backed when the service is available; placeholder current-phase claims are suppressed otherwise.**
6. Roman has launch-to-L2 mission playback with actual launch events and projected future milestones clearly distinguished.
7. All views preserve a consistent mission/simulation time.
8. User can switch among Earth/GSE, L2, heliocentric, follow, and dedicated L2-arrival views.
9. Orbit trails can be toggled.
10. UI/source copy exposes provenance for Hubble/Webb truth state.

## 9. Later scientific features

- automatic scheduled HST TLE refresh/cache
- preprocessed local JWST Horizons/SPICE cache to eliminate runtime network dependence
- CR3BP integrator and free propagation
- station-keeping demonstrations
- higher-fidelity eclipse/penumbra modeling
- real target pointing / field-of-regard constraints
- instrument field of view overlays
- archived TLE playback for historical Hubble dates
- mission-specific Sun/Earth/Moon avoidance and thermal-angle constraints

## 10. Non-goals for the current milestone

- full spacecraft rigid-body dynamics
- high-fidelity propulsion simulation
- exact launch vehicle ascent aerodynamics
- exact thermal model
- photorealistic Earth atmosphere
- perfect 3D spacecraft geometry

Correct trajectory, time, frame, provenance and user comprehension come first.
