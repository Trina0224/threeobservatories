# AGENTS.md

This repository is a science/engineering visualization. Agents must treat orbital truth, mission history, and visual presentation as separate layers.

## Mission

Reconstruct and visualize three observatories in a shared UTC simulation:

- James Webb Space Telescope (JWST): launch, transfer to Sun–Earth L2, deployment timeline, halo orbit, station-keeping context.
- Nancy Grace Roman Space Telescope: launch, transfer to Sun–Earth L2, L2 quasi-halo orbit, science-observatory configuration.
- Hubble Space Telescope (HST): realistic low-Earth-orbit propagation and Earth-relative visualization.

The simulation should be educational, inspectable, and physically grounded. Never invent a trajectory merely because it looks plausible.

## Reuse from `Trina0224/simplegames/threebody`

This project has an upstream orbital-mechanics sandbox owned by the same author:

- https://github.com/Trina0224/simplegames/tree/main/threebody

Agents MUST inspect and reuse validated upstream modules before implementing equivalent functionality from scratch.

### Reuse directly unless there is a documented reason not to

- `threebody/src/integrator.js` — adaptive Dormand–Prince 5(4), dense output, numerical diagnostics.
- `threebody/src/playback.js` — deterministic trajectory playback semantics.
- General testing/validation patterns from `threebody/tools/`.

When copied, preserve an upstream provenance comment and record the source commit/path in `docs/UPSTREAM_REUSE.md`.

### Adapt rather than blindly copy

- `threebody/src/cr3bp3d.js`
- `threebody/src/lagrange.js`
- `threebody/src/halo.js`
- `threebody/src/trajectory3d.js`
- `threebody/src/frames3d.js`
- `threebody/src/events3.js`
- worker-based propagation patterns

These are scientifically valuable but currently encode Earth–Moon normalization, constants, or frame assumptions. For Three Observatories, generalize them into a parameterized two-primary CR3BP layer and instantiate a Sun–Earth system. Do not silently reuse Earth–Moon units/constants.

### Reuse concepts, not implementation

- `threebody/src/render3d.js`
- `threebody/src/app.js`

The useful concepts are one physical history with multiple views, playback separated from propagation, orthogonal scientific views, orbit trails, reference planes, fit/zoom behavior, diagnostics, and worker isolation. The new application should use the Three.js/WebGL rendering stack rather than copying the old Canvas 2D renderer wholesale.

### Regression rule

Do not weaken or discard an already validated upstream numerical behavior merely to make a new implementation appear to work. When adapting a solver, first reproduce one or more upstream reference cases, then add Sun–Earth validation cases.

## Source hierarchy

When sources disagree, prefer in this order:

1. Mission-specific operational ephemerides / SPICE kernels / official trajectory products.
2. NASA/JPL/GSFC/STScI technical documentation and NASA Technical Reports Server (NTRS).
3. Peer-reviewed papers and conference proceedings from mission teams.
4. NASA public mission pages and NASA Scientific Visualization Studio (SVS).
5. Trusted orbital data providers for HST TLEs (for example CelesTrak) when NASA does not provide a convenient current propagation feed.
6. Secondary sources only for context, never as authoritative orbital truth.

Record the source URL, product date/version, coordinate frame, units, epoch/time scale, and any transformation applied to imported data.

## Required reading before changing orbital code

Read `docs/RESEARCH_SOURCES.md`, `docs/COORDINATES.md`, and `docs/UPSTREAM_REUSE.md` first.

Minimum concepts:

- Sun–Earth Lagrange points and rotating frames
- Circular Restricted Three-Body Problem (CR3BP)
- halo/quasi-halo/Lissajous-family orbits and instability
- station keeping near Sun–Earth L2
- UTC, TAI, TT, TDB and why ephemeris time matters
- ECI/GCRS, Earth-fixed frames, ecliptic frames, and GSE visualization frames
- TLE/SGP4 limitations for Hubble
- interpolation of state vectors without introducing visible or dynamical artifacts

## Non-negotiable physics rules

1. Rendering coordinates are not orbital-state coordinates. Keep physics state in documented SI or km-based units and transform only at the rendering boundary.
2. Never apply arbitrary nonuniform scale inside a physics calculation. Educational-scale exaggeration belongs only in rendering.
3. JWST and Roman do not sit at L2. They orbit around the Sun–Earth L2 region.
4. Hubble is not propagated with the L2 model. Use an Earth-orbit propagation path (initially SGP4 from a current/archived TLE; later allow higher-fidelity ephemeris playback).
5. Do not claim a numerical integration is the historical mission trajectory unless it is initialized/calibrated from authoritative mission data.
6. Historical playback and free-running physics must be visibly distinguishable in the UI.
7. Every state vector must have an explicit epoch, frame, units, and source.
8. Keep Sun/Earth/Moon ephemerides independent from decorative sphere rotation.

## Architecture boundaries

Keep these layers separate:

### `src/core/`

Numerical utilities and application-independent trajectory playback. No mission constants and no Three.js objects.

### `src/physics/`

Pure orbital mechanics, propagation, interpolation, coordinate transforms, units, and time conversions. No Three.js objects.

### `src/data/`

Loaders/parsers for SPICE-derived products, NASA trajectory tables, TLEs, mission timelines, and cached datasets.

### `src/missions/`

Mission-specific configuration and choreography: launch events, deployment events, maneuvers, observatory modes, pointing constraints.

### `src/render/`

Three.js scene graph, cameras, labels, trails, vectors, scale transforms, spacecraft sprites/models, lighting.

### `src/ui/`

Timeline, time-rate controls, camera/view selection, truth-vs-educational scale, overlays, source/provenance display.

### What exists today

`src/core/`, `src/physics/` and `src/data/` are real and follow the rules above.
`src/missions/`, `src/render/` and `src/ui/` are not split out yet: the
observatory scene graph and its UI both still live in `src/main.js`, and Roman's
scenes in `src/roman-mission.js` / `src/roman-heliocentric.js`. Split them when a
change makes it natural; do not treat the remaining monolith as licence to move
orbital truth back into rendering code.

### One renderer per scene

A scene has exactly one module that builds and drives it. Do not add a second
module that imports the renderer and then corrects the finished scene each frame,
and do not monkey-patch Three.js prototypes to keep objects out of a scene —
change the code that creates them.

Both were tried here and both failed silently: the corrections ran on a second
`requestAnimationFrame` callback registered after the renderer's, so they were
overwritten before anything was drawn. Spacecraft were rendered off their own
trajectories for several commits while every code path looked correct in review.
`docs/SPEC.md` section 6 records the details.

One prototype patch survives that history: `src/three-add-guard.js`, which
filtered nullish values out of `add()` while the correction layer existed. The
layer is gone, and clicking through every observatory and Roman view no longer
produces the `add: object not an instance of THREE.Object3D` error it was
suppressing, so the guard is dead weight and should be deleted rather than
treated as precedent.

### One source per drawn object

A spacecraft's position and its drawn path must be sampled from the same
function. If a placeholder and a real ephemeris can both reach the screen, they
will eventually disagree, and the failure looks like a rendering glitch rather
than a data problem.

## Simulation modes

Implement and label at least these modes:

- `HISTORICAL`: positions come from authoritative ephemeris/trajectory products when available.
- `PROPAGATED`: positions are generated from an orbital propagator initialized from documented state.
- `EDUCATIONAL`: rendering may exaggerate radii/distances while preserving the underlying physical state.

Never silently blend these modes.

## Coordinate/frame policy

The canonical internal inertial frame will be defined in `docs/COORDINATES.md`. Do not introduce a second implicit convention.

Every transform function must state source and destination frame in its name or type signature where practical.

Avoid ambiguous variables such as `x`, `pos`, `worldPosition` across frame boundaries. Prefer names such as `gcrsPositionKm`, `gsePositionKm`, or `renderPosition`.

## Time policy

- UI time is displayed in UTC.
- Internal ephemeris calculations may require TT/TDB or library-specific ephemeris time.
- Store timestamps with explicit time-scale metadata where imported products require it.
- Do not use JavaScript local time for orbital calculations.
- Simulation time must be deterministic when paused/replayed.

## Accuracy and validation

For every propagator/importer, add validation cases against an external authoritative reference.

At minimum validate:

- Hubble altitude/orbital period/order-of-magnitude against NASA published values.
- JWST distance and halo-orbit behavior against NASA/STScI published ephemeris/plots.
- Roman transfer/L2 geometry against NASA SVS and mission data products.
- Sun–Earth L2 direction and Earth/Sun geometry in the chosen visualization frame.

Prefer quantitative checks over screenshots.

## Spacecraft imagery and copyright

Original project artwork belongs in `public/assets/spacecraft/`.

Use project-created/original illustrations for the primary simulation assets unless an external asset has an explicit license that permits redistribution and use in this public repository.

NASA imagery is often broadly reusable, but individual pages can include third-party credits or restrictions. Never assume every image on a NASA site is automatically unrestricted. If an external image is committed, record its source URL, credit, and usage status in an adjacent metadata file or `public/assets/spacecraft/README.md`.

Do not copy NASA logos, mission insignia, or third-party marks into original spacecraft art.

## Development order

1. Correct clocks, units, frames, and source metadata.
2. Sun/Earth/Moon and L1/L2 reference geometry.
3. Hubble orbit.
4. JWST historical transfer and L2 orbit.
5. Roman historical transfer and L2 orbit.
6. Cameras, trails, labels and vector overlays.
7. Spacecraft art/models and mission choreography.
8. Pointing constraints, eclipses, station keeping and advanced educational tools.

Do not prioritize visual polish over orbital correctness in the first milestone.

## Documentation rule

When implementing a scientific equation or mission-specific constant, add a comment or nearby documentation reference identifying the source. Do not leave unexplained magic numbers.
