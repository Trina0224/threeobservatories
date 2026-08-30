# Three Observatories — Simulation Specification

## 1. Goal

Build a browser-based 3D simulation that places Hubble, Webb, and Roman in one coherent astronomical scene and one synchronized simulation clock.

The experience must support both historical mission playback and educational exploration without conflating rendered scale with physical truth.

## 2. Observatory scope

### Hubble Space Telescope

Primary mode: Earth-centered LEO propagation.

Initial truth source:
- current or archived TLE + SGP4

Required outputs:
- ECI/GCRS-like inertial state
- Earth-fixed sub-satellite point
- altitude
- orbital period estimate
- sunlight / Earth-shadow state (later milestone)
- ground track (later milestone)

Published NASA reference values for sanity checking:
- altitude: about 483 km
- inclination: about 28.5 deg
- period: about 95 min
- speed: about 27,000 km/h

### James Webb Space Telescope

Primary modes:
- launch/transfer playback from authoritative trajectory/ephemeris products
- L2 historical ephemeris playback
- optional propagated CR3BP educational model

Required milestones:
- launch epoch marker
- Earth departure
- mid-course correction markers when authoritative timing/data are available
- deployment timeline layer
- arrival/insertion into the Sun–Earth L2 region
- continuing L2 halo-orbit motion

Sanity checks:
- L2 distance from Earth: about 1.5 million km
- Webb does not sit on L2
- Webb orbit period around L2 region: roughly six months / about 168 days per NASA materials

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
- selectable rates such as 1x, 60x, 1 h/s, 1 d/s, 30 d/s

Internal requirements:
- deterministic replay
- no dependence on browser local timezone
- ephemeris time conversion isolated in `src/physics/time/`

## 4. Scene/view modes

### Solar / L2 View

Show:
- Sun
- Earth
- Moon
- L1 and L2
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

### Spacecraft Follow View

Follow one observatory while optionally displaying:
- velocity vector
- Sun direction
- Earth direction
- orbit normal
- telescope boresight
- sunshield/body reference axes

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

Imported datasets must carry provenance metadata:

```ts
interface DataSourceMetadata {
  id: string;
  mission: 'HST' | 'JWST' | 'ROMAN' | 'SOLAR_SYSTEM';
  title: string;
  publisher: string;
  url: string;
  retrievedAtUtc: string;
  productDate?: string;
  frame?: string;
  units?: string;
  notes?: string;
}
```

## 6. Rendering architecture

Recommended initial stack:
- TypeScript
- Vite
- Three.js

Do not couple Three.js objects to orbital propagators.

Suggested layout:

```text
src/
  physics/
    frames/
    time/
    cr3bp/
    sgp4/
    interpolation/
  data/
    ephemeris/
    tle/
    mission-events/
  missions/
    hubble/
    jwst/
    roman/
  render/
    scene/
    cameras/
    trails/
    vectors/
    spacecraft/
  ui/
public/
  assets/
    spacecraft/
  data/
docs/
```

## 7. First implementation milestone

The first visually working version should use simple geometric stand-ins rather than spending time on detailed spacecraft models.

Acceptance criteria:

1. Page opens and renders Sun, Earth and Moon.
2. Simulation clock can pause and advance at multiple rates.
3. L2 is calculated/positioned from a documented Sun–Earth model.
4. Hubble moves around Earth using SGP4/TLE data.
5. Webb has a real ephemeris/trajectory-backed path where available.
6. Roman has a real trajectory-backed transfer path where available.
7. All three update from the same simulation clock.
8. User can switch between Solar/L2, Earth, and follow views.
9. Orbit trails can be toggled.
10. The UI exposes source/provenance for the active trajectory.

## 8. Second milestone

- spacecraft illustration/model assets
- JWST deployment event visualization
- Roman mission events
- Hubble Earth shadow and ground track
- Sun vector / velocity vector / boresight overlays
- educational annotations explaining L2 and the difference between Hubble LEO and L2 observatories

## 9. Later scientific features

- CR3BP integrator and free propagation
- station-keeping demonstrations
- `disable station keeping` experiment
- eclipse/penumbra modeling
- real target pointing / field-of-regard constraints
- instrument field of view overlays
- archived TLE playback for historical Hubble dates
- SPICE ingestion pipeline or preprocessed browser-friendly ephemeris cache

## 10. Non-goals for the first milestone

- full spacecraft rigid-body dynamics
- high-fidelity propulsion simulation
- exact launch vehicle ascent aerodynamics
- exact thermal model
- photorealistic Earth atmosphere
- perfect 3D spacecraft geometry

Correct trajectory, time, frame, provenance and user comprehension come first.
